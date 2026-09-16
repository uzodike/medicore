from datetime import date
from django.db import models
from django.db.models import Sum, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from core.pagination import NoPagination

from .models import Drug, DrugBatch, Prescription, StockTransaction
from .serializers import (
    DrugSerializer,
    PrescriptionSerializer,
    StockTransactionSerializer,
)
from .filters import DrugFilter, StockTransactionFilter

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def dispense_multiple(request):
    # Accept both 'patient' and 'patient_name'
    patient = request.data.get('patient') or request.data.get('patient_name', '')
    items = request.data.get('items', [])
    prescription_id = request.data.get('prescription_id', '')
    dispensed_by = request.data.get('dispensed_by') or request.user.get_full_name() or getattr(request.user, 'email', 'Pharmacist')

    if not patient:
        return Response(
            {'error': 'Patient name is required'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not items:
        return Response(
            {'error': 'This prescription has no items to dispense'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    results = []
    errors = []

    for item in items:
        drug_id = item.get('drug_id')
        qty = int(item.get('quantity', 0))
        prescription_id = item.get('prescription_id', '') or prescription_id

        if qty <= 0:
            continue

        drug = get_object_or_404(Drug, id=drug_id, is_deleted=False)
        available = drug.current_stock   # already excludes expired batches

        if available < qty:
            note = ' (some stock expired)' if drug.batches.filter(expiry_date__lt=date.today(), quantity__gt=0).exists() else ''
            errors.append(f'{drug.name}: only {available} usable{note}')
            continue

        # FEFO deduction — earliest-expiring non-expired batch first
        remaining = qty
        batches = drug.batches.filter(
            expiry_date__gte=date.today(),
            quantity__gt=0
        ).order_by('expiry_date')

        for batch in batches:
            if remaining <= 0:
                break
            taken = min(batch.quantity, remaining)
            batch.quantity -= taken
            batch.save(update_fields=['quantity', 'updated_at'])
            remaining -= taken

        if remaining > 0:
            errors.append(f'{drug.name}: not enough non-expired stock')
            continue

        StockTransaction.objects.create(
            drug=drug,
            transaction_type='dispense',
            quantity=-qty,
            patient_name=patient,
            reference=prescription_id,
            performed_by=request.user,
            notes=f'Dispensed by {dispensed_by}',
            balance_after=drug.current_stock,
        )
        results.append({'drug_id': drug.id, 'name': drug.name, 'quantity': qty, 'new_stock': drug.current_stock})

    if errors and not results:
        return Response({'errors': errors}, status=status.HTTP_400_BAD_REQUEST)

    # ── Update the source Prescription so it stops showing as 'pending' ──
    prescription_update_note = None
    if results and prescription_id:
        try:
            prescription = Prescription.objects.filter(prescription_id=prescription_id).first()
            if not prescription:
                try:
                    prescription = Prescription.objects.filter(pk=prescription_id).first()
                except (ValueError, ValidationError):
                    prescription = None

            if not prescription:
                prescription_update_note = f"No prescription found matching '{prescription_id}'"
            else:
                dispensed_drug_ids = {r['drug_id'] for r in results}
                all_items = list(prescription.items.all())
                matched_count = 0
                for pres_item in all_items:
                    if pres_item.drug_id and pres_item.drug_id in dispensed_drug_ids:
                        matched = next(r for r in results if r['drug_id'] == pres_item.drug_id)
                        pres_item.quantity_dispensed = matched['quantity']
                        pres_item.is_dispensed = True
                        pres_item.save(update_fields=['quantity_dispensed', 'is_dispensed', 'updated_at'])
                        matched_count += 1

                if all_items and all(i.is_dispensed for i in all_items):
                    prescription.status = 'dispensed'
                elif matched_count > 0:
                    prescription.status = 'partial'
                prescription.dispensed_by = request.user
                prescription.save(update_fields=['status', 'dispensed_by', 'updated_at'])
                prescription_update_note = (
                    f"Prescription {prescription.prescription_id} -> status='{prescription.status}' "
                    f"({matched_count}/{len(all_items)} items matched)"
                )
        except Exception as e:
            prescription_update_note = f"Prescription status NOT updated — {type(e).__name__}: {e}"

    # ── Post dispensed drugs to billing ────────────────────────────
    invoice_number = None
    patient_id = request.data.get('patient_uuid') or request.data.get('patient_id')
    if results and patient_id:
        try:
            from apps.billing.models import Invoice, InvoiceItem
            from apps.patients.models import Patient as PatientModel
            pat = PatientModel.objects.filter(pk=patient_id).first()
            if pat:
                invoice = (Invoice.objects
                           .filter(patient=pat, status__in=['draft', 'pending', 'partial'])
                           .order_by('-created_at').first())
                if not invoice:
                    invoice = Invoice.objects.create(patient=pat, status='pending')
                for r in results:
                    drug_obj = Drug.objects.filter(id=r['drug_id']).first()
                    InvoiceItem.objects.create(
                        invoice=invoice,
                        description=f"{r['name']} × {r['quantity']}" + (f" (Rx {prescription_id})" if prescription_id else ''),
                        category='pharmacy',
                        quantity=r['quantity'],
                        unit_price=(drug_obj.unit_price if drug_obj else 0),
                    )
                invoice.subtotal = invoice.items.aggregate(s=Sum('total_price'))['s'] or 0
                invoice.save()
                invoice_number = invoice.invoice_number
        except Exception as e:
            errors.append(f'Billing posting failed: {e}')

    return Response({'success': True, 'results': results, 'errors': errors,
                     'invoice_number': invoice_number,
                     'prescription_update': prescription_update_note})
# ── Existing (fixed) ──────────────────────────────
class DrugListCreateView(generics.ListCreateAPIView):
    serializer_class = DrugSerializer
    permission_classes = [IsAuthenticated]
    filter_class = DrugFilter
    pagination_class   = NoPagination
    search_fields = ['name', 'generic_name']
    ordering_fields    = ['name', 'created_at', 'current_stock', 'unit_price']
    ordering = ['-created_at'] 
    queryset = Drug.objects.filter(is_deleted=False)


class DrugDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = DrugSerializer
    permission_classes = [IsAuthenticated]
    queryset = Drug.objects.filter(is_deleted=False)

    def perform_destroy(self, instance):
        instance.soft_delete()


class PrescriptionListCreateView(generics.ListCreateAPIView):
    serializer_class = PrescriptionSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['status', 'patient', 'doctor']
    queryset = Prescription.objects.filter(is_deleted=False).select_related('patient', 'doctor')

    def perform_create(self, serializer):
        serializer.save(doctor=self.request.user)


# ── Low‑stock (fixed) ─────────────────────────────
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def low_stock_drugs(request):
    """
    Returns drugs whose total non‑expired stock is ≤ reorder_level.
    Uses annotation + subquery because current_stock is a property.
    """
    drugs = Drug.objects.filter(is_deleted=False).annotate(
        total_stock=Sum(
            'batches__quantity',
            filter=~Q(batches__expiry_date__lt=date.today())
        )
    ).filter(total_stock__lte=models.F('reorder_level'))

    return Response(DrugSerializer(drugs, many=True).data)


# ── Dispense (batch‑aware, FEFO) ─────────────────
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def dispense_drug(request):
    drug_id = request.data.get('drug_id')
    patient = request.data.get('patient')
    quantity = int(request.data.get('quantity', 0))
    prescription_id = request.data.get('prescription_id', '')

    if not drug_id or not patient or quantity <= 0:
        return Response(
            {'error': 'drug_id, patient, and positive quantity required'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    drug = get_object_or_404(Drug, id=drug_id, is_deleted=False)

    # Total available stock (non‑expired)
    total_available = drug.current_stock  # property, uses batches
    if total_available < quantity:
        return Response(
            {'errors': [f'Only {total_available} units available']},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Simple expiry check – if you want to forbid dispensing *any* expired batch
    if drug.expiry_date and drug.expiry_date < date.today():
        return Response(
            {'errors': ['Drug is expired']},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Deduct using FEFO (first‑expiry‑first‑out) across batches
    remaining = quantity
    batches = drug.batches.filter(
        expiry_date__gte=date.today(),
        quantity__gt=0
    ).order_by('expiry_date')

    for batch in batches:
        if remaining <= 0:
            break
        taken = min(batch.quantity, remaining)
        batch.quantity -= taken
        batch.save(update_fields=['quantity', 'updated_at'])  # updated_at if TimeStampedModel
        remaining -= taken

    if remaining > 0:
        return Response(
            {'errors': ['Not enough non‑expired stock across batches']},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Record transaction
    StockTransaction.objects.create(
        drug=drug,
        transaction_type='dispense',
        quantity=-quantity,
        patient_name=patient,
        reference=prescription_id or 'walk-in',
        performed_by=request.user,
    )

    return Response({
        'success': True,
        'new_stock': drug.current_stock,       # will be recomputed
    })


# ── Walk‑in (multi‑drug) ─────────────────────────
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def process_walkin(request):
    customer = request.data.get('customer')
    items = request.data.get('items', [])

    if not customer or not items:
        return Response(
            {'error': 'customer and items required'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    results = []
    errors = []

    for item in items:
        drug_id = item.get('drug_id')
        qty = int(item.get('quantity', 0))
        if qty <= 0:
            continue

        drug = get_object_or_404(Drug, id=drug_id, is_deleted=False)
        available = drug.current_stock

        if available < qty:
            errors.append(f'{drug.name}: only {available} units available')
            continue
        if drug.expiry_date and drug.expiry_date < date.today():
            errors.append(f'{drug.name}: expired')
            continue

        # FEFO deduction (same as dispense)
        remaining = qty
        batches = drug.batches.filter(
            expiry_date__gte=date.today(),
            quantity__gt=0,
        ).order_by('expiry_date')
        for batch in batches:
            if remaining <= 0:
                break
            taken = min(batch.quantity, remaining)
            batch.quantity -= taken
            batch.save(update_fields=['quantity', 'updated_at'])
            remaining -= taken

        StockTransaction.objects.create(
            drug=drug,
            transaction_type='dispense',
            quantity=-qty,
            patient_name=customer,
            reference='walk-in',
            performed_by=request.user,
        )
        results.append({
            'drug_id': drug.id,
            'name': drug.name,
            'quantity': qty,
            'new_stock': drug.current_stock,
        })

    if errors and not results:
        return Response({'errors': errors}, status=status.HTTP_400_BAD_REQUEST)

    return Response({
        'success': True,
        'results': results,
        'errors': errors,          # partial errors are possible
    })


# ── Stock history (fixed filter) ──────────────────
class StandardPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'


class StockHistoryView(generics.ListAPIView):
    serializer_class = StockTransactionSerializer
    permission_classes = [IsAuthenticated]
    filter_class = StockTransactionFilter          # remove filterset_fields
    search_fields = ['drug__name', 'patient_name', 'reference']
    pagination_class = StandardPagination
    queryset = StockTransaction.objects.select_related('drug', 'performed_by').order_by('-created_at')


# ── Patient usage ─────────────────────────────────
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def patient_usage(request):
    """
    Dispensing history for one specific patient. Uses an exact (not partial)
    name match by default to avoid one patient's history bleeding into
    another's with a similar name — e.g. searching 'Ade' should not also
    return every 'Adeyemi', 'Adeola', 'Ogundana Richard Adewale', etc.
    """
    patient = request.query_params.get('patient') or request.query_params.get('patient_name')
    if not patient:
        return Response([], status=200)
 
    transactions = StockTransaction.objects.filter(
        transaction_type='dispense',
        patient_name__iexact=patient.strip(),
    ).select_related('drug', 'performed_by').order_by('-created_at')
 
    serializer = StockTransactionSerializer(transactions, many=True)
    return Response(serializer.data)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def receive_stock(request):
    """
    Single entry point for every stock movement the Stock Update tab can send,
    keyed by movement_type (drug_id/quantity are common to all):

      restock  — ADD qty as a new batch. Needs batch_number + expiry_date.
      adjust   — SET the absolute balance to qty (post stock-take correction).
                 Internally adds/removes only the difference.
      return   — SUBTRACT qty (matches the "new balance" preview already
                 shown in the UI: current_stock - qty).
      expired  — SUBTRACT qty, write-off.
      damaged  — SUBTRACT qty, write-off.

    Accepts movement_type OR transaction_type (either key works) and defaults
    to 'restock' when neither is sent, so the original GRN-only callers
    (Add Drug's initial stock, the plain Receive form) keep working unchanged.
    """
    drug_id = request.data.get('drug') or request.data.get('drug_id')
    action = (request.data.get('movement_type') or request.data.get('transaction_type') or 'restock').strip()
    try:
        qty = int(request.data.get('quantity', 0) or 0)
    except (TypeError, ValueError):
        qty = 0
    batch_number = (request.data.get('batch_number') or '').strip()
    expiry_date = request.data.get('expiry_date') or None
    supplier = (request.data.get('supplier') or '').strip()
    reference = (request.data.get('reference') or '').strip()
    notes_in = (request.data.get('notes') or '').strip()

    if not drug_id or qty <= 0:
        return Response({'detail': 'drug and a positive quantity are required'}, status=400)

    valid_actions = {'restock', 'adjust', 'return', 'expired', 'damaged'}
    if action not in valid_actions:
        return Response(
            {'detail': f"movement_type must be one of: {', '.join(sorted(valid_actions))}"},
            status=400,
        )

    drug = get_object_or_404(Drug, id=drug_id, is_deleted=False)

    def _add_batch(add_qty, txn_type, auto_note):
        if not expiry_date:
            raise ValueError('expiry_date (YYYY-MM-DD) is required to add stock')
        DrugBatch.objects.create(
            drug=drug, batch_number=batch_number or 'N/A',
            quantity=add_qty, expiry_date=expiry_date, supplier=supplier,
        )
        StockTransaction.objects.create(
            drug=drug, transaction_type=txn_type, quantity=add_qty,
            reference=reference or batch_number, performed_by=request.user,
            notes=notes_in or auto_note, balance_after=drug.current_stock,
        )

    def _deduct_fefo(remove_qty, txn_type, auto_note):
        available = drug.current_stock
        if remove_qty > available:
            raise ValueError(f'Only {available} unit(s) on hand — cannot remove {remove_qty}')
        remaining = remove_qty
        batches = drug.batches.filter(
            expiry_date__gte=date.today(), quantity__gt=0
        ).order_by('expiry_date')
        for batch in batches:
            if remaining <= 0:
                break
            taken = min(batch.quantity, remaining)
            batch.quantity -= taken
            batch.save(update_fields=['quantity', 'updated_at'])
            remaining -= taken
        if remaining > 0:
            raise ValueError('Not enough non-expired stock to complete this action')
        StockTransaction.objects.create(
            drug=drug, transaction_type=txn_type, quantity=-remove_qty,
            reference=reference or batch_number, performed_by=request.user,
            notes=notes_in or auto_note, balance_after=drug.current_stock,
        )

    try:
        if action == 'restock':
            _add_batch(qty, 'restock', f'Received from {supplier}' if supplier else 'Stock received')

        elif action == 'return':
            _deduct_fefo(qty, 'return', 'Returned by patient')

        elif action in ('expired', 'damaged'):
            _deduct_fefo(qty, action, f'Write-off: {action}')

        elif action == 'adjust':
            target = qty  # the typed quantity IS the absolute target balance
            delta = target - drug.current_stock
            if delta > 0:
                _add_batch(delta, 'adjust', 'Manual adjustment (stock-take increase)')
            elif delta < 0:
                _deduct_fefo(-delta, 'adjust', 'Manual adjustment (stock-take decrease)')
            # delta == 0: already correct, nothing to record
    except ValueError as e:
        return Response({'detail': str(e)}, status=400)

    return Response({
        'success': True, 'drug': drug.name, 'action': action,
        'received': qty if action == 'restock' else None,
        'new_stock': drug.current_stock,
    }, status=201)


class PrescriptionDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = PrescriptionSerializer
    permission_classes = [IsAuthenticated]
    queryset = Prescription.objects.filter(is_deleted=False).select_related('patient', 'doctor')


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def drug_detail(request, pk):
    drug = get_object_or_404(Drug, id=pk, is_deleted=False)
    today = date.today()
    batches = []
    for b in drug.batches.all().order_by('expiry_date'):
        days = (b.expiry_date - today).days
        batches.append({
            'id': str(b.id), 'batch_number': b.batch_number, 'quantity': b.quantity,
            'expiry_date': b.expiry_date, 'supplier': getattr(b, 'supplier', ''),
            'days_to_expiry': days,
            'status': 'expired' if days < 0 else ('expiring' if days <= 90 else 'good'),
        })
    txns = (StockTransaction.objects.filter(drug=drug).select_related('performed_by')
            .order_by('-created_at')[:30])
    history = [{
        'id': str(t.id), 'transaction_type': t.transaction_type, 'quantity': t.quantity,
        'reference': t.reference, 'patient_name': t.patient_name, 'notes': t.notes,
        'created_at': t.created_at,
        'performed_by_name': (t.performed_by.get_full_name() or getattr(t.performed_by, 'email', ''))
                             if t.performed_by_id else '',
    } for t in txns]
    expired_units = sum(b['quantity'] for b in batches if b['status'] == 'expired')
    return Response({
        'id': str(drug.id), 'name': drug.name, 'generic_name': drug.generic_name,
        'category': drug.category, 'unit': drug.unit, 'unit_price': drug.unit_price,
        'reorder_level': drug.reorder_level, 'current_stock': drug.current_stock,
        'stock_status': drug.stock_status, 'supplier': drug.supplier,
        'expired_units': expired_units, 'batches': batches, 'history': history,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def writeoff_expired(request, pk):
    drug = get_object_or_404(Drug, id=pk, is_deleted=False)
    today = date.today()
    expired = drug.batches.filter(expiry_date__lt=today, quantity__gt=0)
    total = 0
    for b in expired:
        total += b.quantity
        StockTransaction.objects.create(
            drug=drug, transaction_type='expired', quantity=-b.quantity,
            reference=b.batch_number, performed_by=request.user,
            notes=f'Expired batch written off (exp {b.expiry_date})',
        )
        b.quantity = 0
        b.save(update_fields=['quantity', 'updated_at'])
    return Response({'success': True, 'written_off': total, 'current_stock': drug.current_stock})