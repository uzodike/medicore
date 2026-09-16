# apps/ipd/views.py
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.db.models import Count, Q
from django.utils import timezone

from .models import Ward, Bed, Admission, RoomRecord, RoomMedication
from .serializers import (
    WardSerializer, BedSerializer, AdmissionSerializer,
    RoomRecordSerializer, RoomMedicationSerializer,
)


# ── Dashboard ─────────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def ipd_dashboard(request):
    today = timezone.localdate()
    total_beds     = Bed.objects.filter(is_deleted=False).count()
    available_beds = Bed.objects.filter(is_deleted=False, status='available').count()
    occupied_beds  = Bed.objects.filter(is_deleted=False, status='occupied').count()
    return Response({
        'total_beds':        total_beds,
        'available_beds':    available_beds,
        'occupied_beds':     occupied_beds,
        'pending_requests':  Admission.objects.filter(status='requested', is_deleted=False).count(),
        'active_admissions': Admission.objects.filter(status='active',    is_deleted=False).count(),
        'admitted_today':    Admission.objects.filter(admitted_at__date=today, is_deleted=False).count(),
        'discharged_today':  Admission.objects.filter(
            status='discharged', updated_at__date=today, is_deleted=False
        ).count(),
        'nurses_on_duty': RoomRecord.objects.filter(
            created_at__date=today
        ).values('nurse').distinct().count(),
    })


# ── Wards ─────────────────────────────────────────────────────────────────────

class WardListView(generics.ListCreateAPIView):
    serializer_class   = WardSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Ward.objects.filter(is_deleted=False).prefetch_related('beds__admissions__patient')


class WardDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class   = WardSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Ward.objects.filter(is_deleted=False)

    def perform_destroy(self, instance):
        instance.soft_delete()


# ── Beds ──────────────────────────────────────────────────────────────────────

class BedListCreateView(generics.ListCreateAPIView):
    serializer_class   = BedSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields   = ['status', 'ward']

    def get_queryset(self):
        return Bed.objects.filter(is_deleted=False).select_related('ward')


class BedDetailView(generics.RetrieveUpdateAPIView):
    serializer_class   = BedSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Bed.objects.filter(is_deleted=False)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def bed_availability(request):
    """Per-ward availability summary used by the ward map."""
    wards = Ward.objects.filter(is_deleted=False).annotate(
        available=Count('beds', filter=Q(beds__status='available')),
        occupied =Count('beds', filter=Q(beds__status='occupied')),
        reserved =Count('beds', filter=Q(beds__status='reserved')),
        maint    =Count('beds', filter=Q(beds__status='maintenance')),
    )
    return Response([{
        'id':          str(w.id),
        'name':        w.name,
        'ward_type':   w.ward_type,
        'total':       w.total_beds,
        'available':   w.available,
        'occupied':    w.occupied,
        'reserved':    w.reserved,
        'maintenance': w.maint,
    } for w in wards])


# ── Admission Requests (status = 'requested') ─────────────────────────────────

from django_filters import rest_framework as filters

class AdmissionRequestFilter(filters.FilterSet):
    status = filters.CharFilter(method='filter_by_status')

    class Meta:
        model = Admission
        fields = ['status', 'patient', 'doctor']

    def filter_by_status(self, queryset, name, value):
        # Map frontend status names to database values
        status_map = {
            'pending':   'requested',   # doctor’s request, no bed yet
            'assigned':  'active',      # bed assigned, patient admitted
            'cancelled': 'cancelled',
            'discharged':'discharged',
            'active':    'active',
            'requested': 'requested',
        }
        db_status = status_map.get(value, value)
        return queryset.filter(status=db_status)


class AdmissionRequestListView(generics.ListAPIView):
    serializer_class   = AdmissionSerializer
    permission_classes = [IsAuthenticated]
    filterset_class    = AdmissionRequestFilter   # django-filter 2+: filterset_class (filter_class is ignored!)
    # filterset_fields = ['status','patient','doctor']  # ← remove this line

    def get_queryset(self):
        # The filter_class handles all filtering automatically.
        # We only need to add select_related / prefetch_related.
        return (
            Admission.objects
            .filter(is_deleted=False)
            .select_related('patient', 'bed__ward', 'doctor', 'admitted_by')
            .prefetch_related('records__medications')
        )


class AdmissionRequestCreateView(generics.CreateAPIView):
    """Doctor posts here to request an admission (no bed yet)."""
    serializer_class   = AdmissionSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(doctor=self.request.user, status='requested')


class AdmissionRequestDetailView(generics.RetrieveUpdateAPIView):
    serializer_class   = AdmissionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Admission.objects.filter(is_deleted=False)

    def perform_update(self, serializer):
        instance = self.get_object()
        new_status = self.request.data.get('status')
        admission = serializer.save()
        # 'status' is read-only on the serializer — apply explicitly
        if new_status and new_status != instance.status:
            admission.status = new_status
            admission.save(update_fields=['status'])
            if new_status == 'cancelled':
                try:
                    from apps.notifications.utils import notify
                    notify(admission.doctor, patient=admission.patient,
                           title='Admission request declined',
                           message=f'The admission request for {admission.patient.full_name} was declined by the ward.',
                           category='admission', link='/doctor')
                except Exception:
                    pass


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def assign_bed(request, admission_id):
    """
    Nurse assigns a bed to a 'requested' admission → status becomes 'active'.
    Body: { bed_id: <uuid>, admission_type: 'emergency'|'elective'|'transfer' }
    """
    admission = get_object_or_404(Admission, pk=admission_id, status='requested', is_deleted=False)

    bed_id = request.data.get('bed') or request.data.get('bed_id')
    if not bed_id:
        return Response({'error': 'bed or bed_id is required'}, status=400)

    bed = get_object_or_404(Bed, pk=bed_id, is_deleted=False)
    if bed.status != 'available':
        return Response({'error': 'Bed is not available'}, status=409)

    admission_type = request.data.get('admission_type', admission.admission_type or 'elective')

    bed.status = 'occupied'
    bed.save(update_fields=['status'])

    admission.bed            = bed
    admission.status         = 'active'
    admission.admitted_by    = request.user
    admission.admission_type = admission_type
    admission.save(update_fields=['bed', 'status', 'admitted_by', 'admission_type'])

    # ── Notify the admitting doctor ───────────────────────────────
    try:
        from apps.notifications.utils import notify
        notify(
            admission.doctor, patient=admission.patient,
            title='Patient admitted to a bed',
            message=f'{admission.patient.full_name} was assigned {bed.ward.name}/{bed.bed_number}.',
            category='admission', link='/ipd',
        )
    except Exception:
        pass

    return Response(AdmissionSerializer(admission).data, status=200)


# ── Active Admissions ─────────────────────────────────────────────────────────

class AdmissionListView(generics.ListAPIView):
    serializer_class   = AdmissionSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields   = ['status', 'patient']
    search_fields      = ['patient__first_name', 'patient__last_name']

    def get_queryset(self):
        status_param = self.request.query_params.get('status', 'active')
        return (
            Admission.objects
            .filter(status=status_param, is_deleted=False)
            .select_related('patient', 'bed__ward', 'doctor', 'admitted_by')
            .prefetch_related('records__medications')
        )


class AdmissionDetailView(generics.RetrieveUpdateAPIView):
    serializer_class   = AdmissionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Admission.objects.filter(is_deleted=False)

    def perform_update(self, serializer):
        instance = self.get_object()
        new_status = self.request.data.get('status')
        admission = serializer.save()
        # 'status' is read-only on the serializer, so apply it explicitly here
        if new_status and new_status != instance.status:
            if new_status in ('discharged', 'transferred'):
                # Final true-up of bed-day charges before closing out
                try:
                    accrue_bed_days(admission)
                except Exception:
                    pass
            admission.status = new_status
            admission.save(update_fields=['status'])
            # Free the bed when patient is discharged / transferred
            if new_status in ('discharged', 'transferred') and instance.bed:
                instance.bed.status = 'available'
                instance.bed.save(update_fields=['status'])
            if new_status in ('discharged', 'transferred'):
                try:
                    from apps.notifications.utils import notify
                    notify(admission.doctor, patient=admission.patient,
                           title=f'Patient {new_status}',
                           message=f'{admission.patient.full_name} was {new_status}.',
                           category='admission', link='/ipd')
                except Exception:
                    pass


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def active_admissions(request):
    admissions = (
        Admission.objects
        .filter(status='active', is_deleted=False)
        .select_related('patient', 'bed__ward', 'doctor', 'admitted_by')
        .prefetch_related('records__medications')
    )
    return Response(AdmissionSerializer(admissions, many=True).data)


# ── Nurse Shifts (RoomRecord) ─────────────────────────────────────────────────
# RoomRecord already has shift + nurse + admission — we expose it as /shifts/

class ShiftListView(generics.ListAPIView):
    serializer_class   = RoomRecordSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs    = RoomRecord.objects.select_related('nurse', 'admission__bed__ward')
        ward  = self.request.query_params.get('ward')
        date  = self.request.query_params.get('date')
        nurse = self.request.query_params.get('nurse')
        if ward:  qs = qs.filter(admission__bed__ward_id=ward)
        if date:  qs = qs.filter(created_at__date=date)
        if nurse: qs = qs.filter(nurse_id=nurse)
        return qs.order_by('-created_at')


class ShiftCreateView(generics.CreateAPIView):
    serializer_class   = RoomRecordSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(nurse=self.request.user)


class ShiftDetailView(generics.RetrieveUpdateAPIView):
    serializer_class   = RoomRecordSerializer
    permission_classes = [IsAuthenticated]
    queryset           = RoomRecord.objects.all()


# ── Medication Records ────────────────────────────────────────────────────────

class MedRecordListView(generics.ListAPIView):
    serializer_class   = RoomMedicationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = RoomMedication.objects.select_related('record__admission__patient', 'drug')
        admission_id = self.request.query_params.get('admission')
        if admission_id:
            qs = qs.filter(record__admission_id=admission_id)
        return qs.order_by('-administered_at')


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_med_record(request):
    """
    Nurse logs a medication administration.
    Body: { admission: <uuid>, drug_id: <uuid>, quantity: int,
            shift: 'morning'|'afternoon'|'night', notes: '' }
    """
    admission_id = request.data.get('admission')
    drug_id      = request.data.get('drug') or request.data.get('drug_id')
    quantity     = request.data.get('quantity', 1)
    shift        = request.data.get('shift', 'morning')
    notes        = request.data.get('notes', '')

    if not admission_id or not drug_id:
        return Response({'error': 'admission and drug are required'}, status=400)

    admission = get_object_or_404(Admission, pk=admission_id, status='active', is_deleted=False)

    # Get or create the shift record for this nurse + admission + shift today
    record, _ = RoomRecord.objects.get_or_create(
        admission=admission,
        nurse=request.user,
        shift=shift,
        created_at__date=timezone.localdate(),
        defaults={'notes': notes},
    )

    from apps.pharmacy.models import Drug
    drug = get_object_or_404(Drug, pk=drug_id)

    qty = int(quantity or 1)

    # Block administration when there is not enough non-expired stock
    if drug.current_stock < qty:
        return Response(
            {'error': f'{drug.name}: only {drug.current_stock} in stock — cannot administer {qty}.'},
            status=400,
        )

    med = RoomMedication.objects.create(
        record=record,
        drug=drug,
        quantity=qty,
    )

    # ── Deduct from drug inventory (FEFO) + ledger ────────────────
    try:
        from datetime import date
        from apps.pharmacy.models import StockTransaction
        remaining = qty
        for batch in drug.batches.filter(expiry_date__gte=date.today(), quantity__gt=0).order_by('expiry_date'):
            if remaining <= 0:
                break
            take = min(batch.quantity, remaining)
            batch.quantity -= take
            batch.save(update_fields=['quantity', 'updated_at'])
            remaining -= take
        StockTransaction.objects.create(
            drug=drug, transaction_type='dispense', quantity=-qty,
            patient_name=admission.patient.full_name,
            reference=f'IPD MAR {admission.id}', performed_by=request.user,
            notes=f'Ward administration ({shift} shift)',
        )
    except Exception:
        pass

    # ── Notify the patient's doctor + pharmacy ────────────────────
    try:
        from apps.notifications.utils import notify
        notify(
            admission.doctor, patient=admission.patient,
            title='Medication administered',
            message=f'{drug.name} x {qty} given to {admission.patient.full_name} ({shift} shift).',
            category='pharmacy', link='/ipd',
        )
        # Pharmacy team: stock was drawn from their inventory by the ward
        from django.contrib.auth import get_user_model
        User = get_user_model()
        for pharmacist in User.objects.filter(role='pharmacist', is_active=True)[:10]:
            notify(
                pharmacist,
                title='Ward stock deduction',
                message=f'{drug.name} x {qty} administered to {admission.patient.full_name} (IPD). Stock on hand: {drug.current_stock}.',
                category='pharmacy', link='/pharmacy',
            )
    except Exception:
        pass

    # ── Bill the administered drug to the patient ─────────────────
    try:
        from apps.billing.models import Invoice, InvoiceItem
        from django.db.models import Sum
        inv = (Invoice.objects
               .filter(patient=admission.patient, status__in=['draft', 'pending', 'partial'])
               .order_by('-created_at').first())
        if not inv:
            inv = Invoice.objects.create(patient=admission.patient, status='pending')
        InvoiceItem.objects.create(
            invoice=inv, description=f"{drug.name} x {qty} (ward administration)",
            category='pharmacy', quantity=qty, unit_price=drug.unit_price,
        )
        inv.subtotal = inv.items.aggregate(s=Sum('total_price'))['s'] or 0
        inv.save()
    except Exception:
        pass

    return Response(RoomMedicationSerializer(med).data, status=201)


class MedRecordDetailView(generics.RetrieveUpdateAPIView):
    serializer_class   = RoomMedicationSerializer
    permission_classes = [IsAuthenticated]
    queryset           = RoomMedication.objects.all()

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def post_bed_day(request, admission_id):
    """Post one bed-day charge to billing for an active admission, on demand."""
    admission = get_object_or_404(Admission, pk=admission_id, status='active', is_deleted=False)
    bed = admission.bed
    if not bed:
        return Response({'error': 'Admission has no bed'}, status=400)
    price = request.data.get('price')
    price = float(price) if price not in (None, '') else float(bed.price or 0)
    if price <= 0:
        return Response({'error': 'No bed price set — enter one or set it on the bed.'}, status=400)

    from apps.billing.models import Invoice, InvoiceItem
    from django.db.models import Sum
    inv = (Invoice.objects
           .filter(patient=admission.patient, status__in=['draft', 'pending', 'partial'])
           .order_by('-created_at').first())
    if not inv:
        inv = Invoice.objects.create(patient=admission.patient, status='pending')
    InvoiceItem.objects.create(
        invoice=inv,
        description=f"Bed {bed.ward.name}/{bed.bed_number} — bed-day",
        category='room', quantity=1, unit_price=price,
    )
    inv.subtotal = inv.items.aggregate(s=Sum('total_price'))['s'] or 0
    inv.save()
    return Response({'success': True, 'invoice_number': inv.invoice_number, 'amount': price})


# ── Bed-day billing (auto-accrual) ────────────────────────────────────────────

def _bed_day_items_count(admission):
    """How many bed-day lines already exist for this admission."""
    from apps.billing.models import InvoiceItem
    return InvoiceItem.objects.filter(
        category='room',
        description__startswith=f'Bed-day [{admission.id}]',
    ).count()


def accrue_bed_days(admission):
    """
    Ensure one 'room' invoice line exists per day the patient has been admitted
    (inclusive of admission day). Safe to call repeatedly — it only posts the
    difference. Returns number of new bed-days posted.
    """
    bed = admission.bed
    if admission.status != 'active' or not bed or not bed.price or bed.price <= 0:
        return 0
    days_owed = (timezone.localdate() - admission.admitted_at.date()).days + 1
    already = _bed_day_items_count(admission)
    missing = days_owed - already
    if missing <= 0:
        return 0

    from apps.billing.models import Invoice, InvoiceItem
    from django.db.models import Sum
    from datetime import timedelta
    inv = (Invoice.objects
           .filter(patient=admission.patient, status__in=['draft', 'pending', 'partial'])
           .order_by('-created_at').first())
    if not inv:
        inv = Invoice.objects.create(patient=admission.patient, status='pending')

    first_unbilled = admission.admitted_at.date() + timedelta(days=already)
    for i in range(missing):
        day = first_unbilled + timedelta(days=i)
        InvoiceItem.objects.create(
            invoice=inv,
            description=f"Bed-day [{admission.id}] {bed.ward.name}/{bed.bed_number} — {day.strftime('%d %b %Y')}",
            category='room', quantity=1, unit_price=bed.price,
        )
    inv.subtotal = inv.items.aggregate(s=Sum('total_price'))['s'] or 0
    inv.save()
    return missing


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def post_bed_day(request, admission_id):
    """Catch up bed-day charges for one admission, on demand."""
    admission = get_object_or_404(Admission, pk=admission_id, status='active', is_deleted=False)
    if not admission.bed:
        return Response({'error': 'No bed on this admission.'}, status=400)
    # Allow setting the price on the fly if the bed has none
    req_price = request.data.get('price')
    if (not admission.bed.price or admission.bed.price <= 0) and req_price:
        try:
            admission.bed.price = float(req_price)
            admission.bed.save(update_fields=['price'])
        except (TypeError, ValueError):
            pass
    if not admission.bed.price or admission.bed.price <= 0:
        return Response({'error': 'This bed has no price set — set a daily rate first.'}, status=400)
    posted = accrue_bed_days(admission)
    return Response({'success': True, 'posted': posted,
                     'message': f'{posted} bed-day(s) posted' if posted else 'Billing already up to date'})