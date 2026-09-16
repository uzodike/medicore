from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.utils import timezone

from .models import LabTest, LabOrder, LabOrderItem, SampleCollection, LabResultHistory, LabBill, LabPayment
from .serializers import (LabTestSerializer, LabOrderSerializer, LabOrderWriteSerializer,
                          LabOrderItemSerializer, SampleCollectionSerializer,
                          LabResultHistorySerializer, LabBillSerializer)
from datetime import datetime
from django.db.models import Sum




class LabTestListCreateView(generics.ListCreateAPIView):
    serializer_class = LabTestSerializer
    permission_classes = [IsAuthenticated]
    queryset = LabTest.objects.filter(is_active=True)

class LabOrderListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    #search_fields = ['patient__full_name', 'doctor__get_full_name']
    queryset = LabOrder.objects.all().order_by('-order_date')

    def get_serializer_class(self):
        # LabOrderSerializer.items is read-only — using it for POST silently
        # drops test_ids, creates an order with zero LabOrderItem rows, and
        # every downstream display (including test names) shows nothing.
        # LabOrderWriteSerializer is the one that actually creates items.
        if self.request.method == 'POST':
            return LabOrderWriteSerializer
        return LabOrderSerializer

    def perform_create(self, serializer):
        serializer.save(doctor=self.request.user)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        # Respond with the fully nested read serializer so the caller gets
        # test names / items back immediately, not just the raw write payload.
        read_serializer = LabOrderSerializer(serializer.instance, context=self.get_serializer_context())
        headers = self.get_success_headers(read_serializer.data)
        return Response(read_serializer.data, status=status.HTTP_201_CREATED, headers=headers)

class LabTestDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = LabTestSerializer
    permission_classes = [IsAuthenticated]
    queryset = LabTest.objects.filter(is_active=True)

class LabOrderDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = LabOrderSerializer
    permission_classes = [IsAuthenticated]
    queryset = LabOrder.objects.all()

# ── Sample collection ──────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def collect_sample(request, item_id):
    item = get_object_or_404(LabOrderItem, pk=item_id)
    if item.sample_status != 'pending':
        return Response({'error': 'Sample already collected or rejected'}, status=400)

    # Mark as collected
    item.sample_status = 'collected'
    item.save(update_fields=['sample_status'])

    # Create collection record
    data = request.data
    SampleCollection.objects.create(
        item=item,
        collected_by=request.user,
        sample_type=data.get('sample_type', ''),
        sample_volume=data.get('sample_volume', ''),
        container_type=data.get('container_type', '')
    )
    return Response({'success': True, 'sample_id': item.sample_id})


# ── Approve result (pathologist) ──────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def approve_result(request, item_id):
    item = get_object_or_404(LabOrderItem, pk=item_id)
    if item.result_status != 'completed':
        return Response({'error': 'Result must be completed before approval'}, status=400)
    item.result_status = 'approved'
    item.approved_by = request.user
    item.save(update_fields=['result_status', 'approved_by'])
    # If all items in order are approved, mark order as completed
    order = item.order
    if not order.items.exclude(result_status='approved').exists():
        order.status = 'completed'
        order.save(update_fields=['status'])
    return Response({'success': True})

# ── Pending worklist ─────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def pending_worklist(request):
    """Returns items that need processing (collected, not yet completed)"""
    items = LabOrderItem.objects.filter(
        sample_status='collected',
        result_status__in=['pending', 'in_progress']
    ).select_related('test', 'order__patient').order_by('created_at')
    serializer = LabOrderItemSerializer(items, many=True)
    return Response(serializer.data)



# ══════════════════════════════════════════════════════
# EXISTING VIEWS (unchanged)
# ══════════════════════════════════════════════════════

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def collect_sample(request, item_id):
    item = get_object_or_404(LabOrderItem, pk=item_id)
    if item.sample_status != 'pending':
        return Response({'error': 'Sample already collected or rejected'}, status=400)
    item.sample_status = 'collected'
    item.save(update_fields=['sample_status'])
    SampleCollection.objects.create(
        item=item,
        collected_by=request.user,
        sample_type=request.data.get('sample_type', ''),
        sample_volume=request.data.get('sample_volume', ''),
        container_type=request.data.get('container_type', '')
    )
    return Response({'success': True, 'sample_id': item.sample_id})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def enter_result(request, item_id):
    item = get_object_or_404(LabOrderItem, pk=item_id)
    if item.result_status in ['completed', 'approved']:
        return Response({'error': 'Result already completed'}, status=400)
    previous_value = item.result_value
    new_value = request.data.get('result_value', '')
    item.result_value = new_value
    item.result_numeric = request.data.get('result_numeric', None)
    item.reference_range_low = request.data.get('reference_range_low', None)
    item.reference_range_high = request.data.get('reference_range_high', None)
    item.unit = request.data.get('unit', '')
    item.remarks = request.data.get('remarks', '')
    item.performed_by = request.user
    _flag = request.data.get('flag', None)
    item.flag = _flag if _flag is not None else item.compute_flag()
    item.result_status = 'completed'
    item.save()
    LabResultHistory.objects.create(
        item=item,
        previous_value=previous_value,
        new_value=new_value,
        changed_by=request.user
    )
    return Response({'success': True})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def approve_result(request, item_id):
    item = get_object_or_404(LabOrderItem, pk=item_id)
    if item.result_status != 'completed':
        return Response({'error': 'Result must be completed before approval'}, status=400)
    item.result_status = 'approved'
    item.approved_by = request.user
    item.save(update_fields=['result_status', 'approved_by'])
    order = item.order
    if not order.items.exclude(result_status='approved').exists():
        order.status = 'completed'
        order.save(update_fields=['status'])
    return Response({'success': True})

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def pending_worklist(request):
    items = LabOrderItem.objects.filter(
        sample_status='collected',
        result_status__in=['pending', 'in_progress']
    ).select_related('test', 'order__patient').order_by('created_at')
    serializer = LabOrderItemSerializer(items, many=True)
    return Response(serializer.data)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def awaiting_collection(request):
    """Items that need sample collection"""
    items = LabOrderItem.objects.filter(
        sample_status='pending'
    ).select_related('test', 'order__patient').order_by('created_at')
    serializer = LabOrderItemSerializer(items, many=True)
    return Response(serializer.data)


# ══════════════════════════════════════════════════════
# NEW: DASHBOARD VIEW
# ══════════════════════════════════════════════════════

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def lab_dashboard(request):
    total_tests = LabTest.objects.filter(is_active=True).count()
    pending = LabOrderItem.objects.filter(
        result_status__in=['pending', 'in_progress']
    ).count()
    completed_today = LabOrderItem.objects.filter(
        result_status='completed',
        updated_at__date=timezone.now().date()
    ).count()
    revenue_today = LabOrderItem.objects.filter(
        paid=True,
        updated_at__date=timezone.now().date()
    ).aggregate(total=Sum('test__price'))['total'] or 0

    return Response({
        'total_tests': total_tests,
        'pending': pending,
        'completed_today': completed_today,
        'revenue_today': revenue_today,
    })


# ══════════════════════════════════════════════════════
# BILLING VIEWS (using paid flag on LabOrderItem)
# ══════════════════════════════════════════════════════

class LabBillListView(generics.ListAPIView):
    serializer_class = LabBillSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = LabBill.objects.select_related('order__patient').all()
        status = self.request.query_params.get('status')
        if status and status != 'all':
            qs = qs.filter(status=status)
        return qs.order_by('-created_at')

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())

        # Compute totals BEFORE pagination (on the full filtered set)
        total_billed = sum(bill.subtotal for bill in queryset)
        total_collected = sum(bill.amount_paid for bill in queryset)
        total_outstanding = sum(bill.balance for bill in queryset)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            # Get the standard paginated response dict { count, next, previous, results }
            paginated_data = self.get_paginated_response(serializer.data).data
            # Inject extra financial fields at the top level
            paginated_data['total_billed'] = total_billed
            paginated_data['total_collected'] = total_collected
            paginated_data['total_outstanding'] = total_outstanding
            return Response(paginated_data)

        # Fallback if pagination is off
        serializer = self.get_serializer(queryset, many=True)
        return Response({
            'results': serializer.data,
            'total_billed': total_billed,
            'total_collected': total_collected,
            'total_outstanding': total_outstanding,
        })

class LabBillDetailView(generics.RetrieveAPIView):
    serializer_class = LabBillSerializer
    permission_classes = [IsAuthenticated]
    queryset = LabBill.objects.select_related('order__patient').all()


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def pay_bill(request, bill_id):
    bill = get_object_or_404(LabBill, pk=bill_id)
    if bill.status == 'paid' or bill.status == 'waived':
        return Response({'error': 'Bill already settled'}, status=400)

    data = request.data
    amount = float(data.get('amount', 0))
    method = data.get('method', 'cash')
    discount = float(data.get('discount', 0))
    insurance = float(data.get('insurance_cover', 0))
    reference = data.get('reference', '')
    received_by = data.get('received_by', '')

    # Update bill
    if discount: bill.discount = discount
    if insurance: bill.insurance_cover = insurance
    bill.amount_paid += amount
    bill.notes = data.get('notes', '')
    bill.recalculate()

    # Record payment
    LabPayment.objects.create(
        bill=bill,
        amount=amount,
        method=method,
        reference=reference,
        received_by=received_by,
        notes=f"Payment of ₦{amount}"
    )

    return Response({'success': True, 'balance': bill.balance})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def waive_bill(request, bill_id):
    bill = get_object_or_404(LabBill, pk=bill_id)
    if bill.status == 'paid' or bill.status == 'waived':
        return Response({'error': 'Bill already settled'}, status=400)

    reason = request.data.get('reason', '')
    bill.status = 'waived'
    bill.notes = f'Waived: {reason}'
    bill.recalculate()

    LabPayment.objects.create(
        bill=bill,
        amount=bill.balance,
        method='waiver',
        notes=reason
    )

    return Response({'success': True})

# ══════════════════════════════════════════════════════
# SERVICE INVENTORY VIEWS (Test catalogue with stock)
# ══════════════════════════════════════════════════════

# For a real inventory you might add a "stock" field to LabTest.
# Here we simply show all active tests; you can extend the model later.
class ServiceInventoryListView(generics.ListAPIView):
    serializer_class = LabTestSerializer
    permission_classes = [IsAuthenticated]
    queryset = LabTest.objects.filter(is_active=True)

class ServiceSummaryView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        total = LabTest.objects.filter(is_active=True).count()
        return Response({
            'total_services': total,
            'message': 'Inventory summary (extend as needed)'
        })

# ── Attach scanned report / result sheet to an order ──────────────────────────
from rest_framework.parsers import MultiPartParser
from rest_framework.decorators import parser_classes

@api_view(['POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser])
def attach_report(request, pk):
    order = get_object_or_404(LabOrder, pk=pk, is_deleted=False)
    f = request.FILES.get('file')
    if not f:
        return Response({'error': 'No file provided'}, status=400)
    order.report_file = f
    order.save(update_fields=['report_file'])
    return Response({'success': True, 'report_file': order.report_file.url})