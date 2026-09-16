from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.filters import SearchFilter
from django_filters.rest_framework import DjangoFilterBackend
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db.models import Sum, Count, Q
from datetime import date, timedelta
# apps/lab/service.py
from decimal import Decimal
from apps.billing.models import Invoice, InvoiceItem
from .models import (LabTest, LabOrder, LabOrderItem, SampleCollection,
                     LabResultHistory, LabBill, LabPayment, ServiceInventoryEntry, LabBillItem)
from .serializers import (LabTestSerializer, LabOrderSerializer, LabOrderWriteSerializer,
                           LabOrderItemSerializer, SampleCollectionSerializer,
                           LabBillSerializer, LabPaymentSerializer,
                           ServiceInventorySerializer) 

def update_service_inventory(item):
    """
    Update service inventory when a lab test result is approved.
    This function should create/update ServiceInventoryEntry records.
    """
    from .models import ServiceInventoryEntry
    # Example: log one entry per approved test
    ServiceInventoryEntry.objects.create(
        test=item.test,
        date=item.approved_at.date() if item.approved_at else timezone.now().date(),
        count=1,
        revenue=item.test.price if item.test.price else 0,
    )

def create_bill_for_order(order):
    """Auto-create a LabBill AND a synced Invoice when a lab order is placed."""
    
    # 1. Create LabBill (existing logic)
    bill = LabBill.objects.create(
        order=order,
        patient=order.patient,
    )
    for item in order.items.select_related('test').all():
        LabBillItem.objects.create(
            bill=bill,
            test=item.test,
            unit_price=item.test.price,
            total=item.test.price,
        )
    subtotal = sum(i.total for i in bill.line_items.all())
    bill.subtotal = subtotal
    bill.total = subtotal
    bill.balance = subtotal
    bill.save(update_fields=['subtotal', 'total', 'balance'])

    # 2. Create the matching Invoice (NEW)
    invoice = Invoice.objects.create(
        patient=order.patient,
        created_by=order.doctor,
        status='pending',
        subtotal=subtotal,
        total_amount=subtotal,
        discount_amount=0,
        insurance_deduction=0,
    )
    
    # 3. Create InvoiceItems for each test
    for item in order.items.select_related('test').all():
        InvoiceItem.objects.create(
            invoice=invoice,
            description=item.test.name,
            category='lab',
            quantity=1,
            unit_price=item.test.price,
        )

    # 4. Link the LabBill to the Invoice
    bill.invoice = invoice
    bill.save(update_fields=['invoice'])

    return bill


def record_payment(bill, amount, method, received_by='', reference=''):
    from .models import LabPayment
    LabPayment.objects.create(
        bill=bill,
        amount=amount,
        method=method,
        received_by=received_by,
        reference=reference,
    )
    bill.amount_paid += amount
    bill.balance = max(0, float(bill.total) - float(bill.amount_paid))
    bill.status = 'paid' if bill.balance == 0 else 'part_paid'
    bill.save(update_fields=['amount_paid', 'balance', 'status'])
    return bill


def get_financial_summary(start, end):
    from django.db.models import Sum
    from .models import LabBill
    bills = LabBill.objects.filter(created_at__date__range=(start, end))
    return {
        'total_billed':      float(bills.aggregate(v=Sum('total'))['v'] or 0),
        'total_collected':   float(bills.filter(status='paid').aggregate(v=Sum('amount_paid'))['v'] or 0),
        'total_outstanding': float(bills.filter(status__in=['unpaid', 'part_paid']).aggregate(v=Sum('balance'))['v'] or 0),
        'total_bills':       bills.count(),
    }

# ═══════════════════════════════════════════════════════
# TEST CATALOGUE
# ═══════════════════════════════════════════════════════
class LabTestListCreateView(generics.ListCreateAPIView):
    serializer_class   = LabTestSerializer
    permission_classes = [IsAuthenticated]
    filter_backends    = [DjangoFilterBackend, SearchFilter]
    filterset_fields   = ['category', 'is_active', 'requires_fasting']
    search_fields      = ['name', 'short_name', 'category']
    queryset           = LabTest.objects.filter(is_active=True)


class LabTestDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class   = LabTestSerializer
    permission_classes = [IsAuthenticated]
    queryset           = LabTest.objects.all()


# ═══════════════════════════════════════════════════════
# LAB ORDERS
# ═══════════════════════════════════════════════════════
class LabOrderListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    filter_backends    = [DjangoFilterBackend, SearchFilter]
    filterset_fields   = ['status', 'priority', 'patient']
    search_fields      = ['order_number', 'patient__first_name',
                          'patient__last_name', 'doctor__first_name']

    def get_serializer_class(self):
        return LabOrderWriteSerializer if self.request.method == 'POST' else LabOrderSerializer

    def get_queryset(self):
        return (LabOrder.objects.all()
                .select_related('patient', 'doctor', 'bill')
                .prefetch_related('items__test', 'items__collection',
                                  'items__history'))

    def perform_create(self, serializer):
        serializer.save(doctor=self.request.user)


class LabOrderDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class   = LabOrderSerializer

    def get_queryset(self):
        return (LabOrder.objects.all()
                .select_related('patient', 'doctor', 'bill')
                .prefetch_related('items__test', 'items__collection',
                                  'items__history'))


# ═══════════════════════════════════════════════════════
# SAMPLE COLLECTION
# ═══════════════════════════════════════════════════════
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def collect_sample(request, item_id):
    item = get_object_or_404(LabOrderItem, pk=item_id)
    if item.sample_status != 'pending':
        return Response({'error': 'Sample already collected or rejected'}, status=400)

    item.sample_status = 'collected'
    item.result_status = 'in_progress'
    item.save(update_fields=['sample_status', 'result_status'])

    SampleCollection.objects.create(
        item           = item,
        collected_by   = request.user,
        sample_type    = request.data.get('sample_type', ''),
        sample_volume  = request.data.get('sample_volume', ''),
        container_type = request.data.get('container_type', ''),
        condition      = request.data.get('condition', 'acceptable'),
    )

    # Mark parent order in_progress if still 'ordered'
    order = item.order
    if order.status == 'ordered':
        order.status = 'in_progress'
        order.save(update_fields=['status'])

    return Response({'success': True, 'sample_id': item.sample_id})


# ═══════════════════════════════════════════════════════
# RESULT ENTRY
# ═══════════════════════════════════════════════════════
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def enter_result(request, item_id):
    item = get_object_or_404(LabOrderItem, pk=item_id)
    if item.result_status in ['completed', 'approved']:
        return Response({'error': 'Result already finalised'}, status=400)

    previous_value = item.result_value

    item.result_value         = request.data.get('result_value', '')
    item.result_numeric       = request.data.get('result_numeric') or None
    item.reference_range_low  = request.data.get('reference_range_low') or None
    item.reference_range_high = request.data.get('reference_range_high') or None
    item.unit                 = request.data.get('unit', item.test.unit)
    item.remarks              = request.data.get('remarks', '')
    item.performed_by         = request.user
    item.result_status        = 'completed'
    item.completed_at         = timezone.now()

    # Auto-flag
    item.flag = item.compute_flag()
    item.save()

    LabResultHistory.objects.create(
        item           = item,
        previous_value = previous_value,
        new_value      = item.result_value,
        changed_by     = request.user,
        action         = 'result_entry' if not previous_value else 'amendment',
    )

    return Response(LabOrderItemSerializer(item).data)


# ═══════════════════════════════════════════════════════
# RESULT APPROVAL
# ═══════════════════════════════════════════════════════
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def approve_result(request, item_id):
    item = get_object_or_404(LabOrderItem, pk=item_id)
    if item.result_status != 'completed':
        return Response({'error': 'Result must be completed before approval'}, status=400)

    item.result_status = 'approved'
    item.approved_by   = request.user
    item.approved_at   = timezone.now()
    item.save(update_fields=['result_status', 'approved_by', 'approved_at'])

    LabResultHistory.objects.create(
        item       = item,
        new_value  = item.result_value,
        changed_by = request.user,
        action     = 'approval',
    )

    # signal in signals.py handles inventory + order completion
    return Response(LabOrderItemSerializer(item).data)


# ═══════════════════════════════════════════════════════
# WORKLISTS
# ═══════════════════════════════════════════════════════
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def pending_worklist(request):
    """Items with sample collected but result not yet approved."""
    items = (LabOrderItem.objects
             .filter(sample_status='collected',
                     result_status__in=['pending', 'in_progress', 'completed'])
             .select_related('test', 'order__patient', 'order__doctor',
                             'collection', 'performed_by', 'approved_by')
             .prefetch_related('history')
             .order_by('order__priority', 'created_at'))
    return Response(LabOrderItemSerializer(items, many=True).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def awaiting_collection(request):
    """Items not yet collected."""
    items = (LabOrderItem.objects
             .filter(sample_status='pending')
             .select_related('test', 'order__patient', 'order__doctor')
             .order_by('order__priority', 'created_at'))
    return Response(LabOrderItemSerializer(items, many=True).data)


# ═══════════════════════════════════════════════════════
# BILLING
# ═══════════════════════════════════════════════════════
class LabBillListView(generics.ListAPIView):
    serializer_class   = LabBillSerializer
    permission_classes = [IsAuthenticated]
    filter_backends    = [DjangoFilterBackend, SearchFilter]
    filterset_fields   = ['status', 'payment_method', 'patient']
    search_fields      = ['bill_number', 'patient__first_name',
                          'patient__last_name', 'order__order_number']

    def get_queryset(self):
        return (LabBill.objects.all()
                .select_related('patient', 'order')
                .prefetch_related('line_items__test', 'payments'))


class LabBillDetailView(generics.RetrieveUpdateAPIView):
    serializer_class   = LabBillSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return LabBill.objects.prefetch_related('line_items__test', 'payments')


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def pay_bill(request, bill_id):
    """
    Post a payment against a lab bill.
    Body: { amount, method, reference?, discount?, insurance_cover? }
    """
    from .service import record_payment
    bill = get_object_or_404(LabBill, pk=bill_id)
    if bill.status == 'paid':
        return Response({'error': 'Bill already fully paid'}, status=400)

    # Apply discount / insurance first (one-time adjustment)
    if 'discount' in request.data:
        bill.discount = float(request.data['discount'])
    if 'insurance_cover' in request.data:
        bill.insurance_cover = float(request.data['insurance_cover'])
    if bill.discount or bill.insurance_cover:
        bill.total   = max(0, float(bill.subtotal) - float(bill.discount) - float(bill.insurance_cover))
        bill.balance = max(0, float(bill.total) - float(bill.amount_paid))
        bill.save(update_fields=['discount', 'insurance_cover', 'total', 'balance'])

    amount = float(request.data.get('amount', bill.balance))
    bill   = record_payment(
        bill,
        amount      = amount,
        method      = request.data.get('method', 'cash'),
        received_by = request.data.get('received_by', request.user.get_full_name()),
        reference   = request.data.get('reference', ''),
    )
    return Response(LabBillSerializer(bill).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def waive_bill(request, bill_id):
    bill = get_object_or_404(LabBill, pk=bill_id)
    bill.status  = 'waived'
    bill.balance = 0
    bill.notes   = request.data.get('reason', 'Waived by staff')
    bill.save()
    return Response({'detail': 'Bill waived'})


# ═══════════════════════════════════════════════════════
# SERVICE INVENTORY
# ═══════════════════════════════════════════════════════
class ServiceInventoryListView(generics.ListAPIView):
    serializer_class   = ServiceInventorySerializer
    permission_classes = [IsAuthenticated]
    filter_backends    = [DjangoFilterBackend]
    filterset_fields   = ['date', 'test', 'test__category']

    def get_queryset(self):
        qs    = ServiceInventoryEntry.objects.select_related('test')
        start = self.request.query_params.get('start')
        end   = self.request.query_params.get('end')
        if start: qs = qs.filter(date__gte=start)
        if end:   qs = qs.filter(date__lte=end)
        return qs


class ServiceSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .service import get_financial_summary
        period = request.query_params.get('period', 'today')
        today  = date.today()

        if   period == 'today':  start, end = today, today
        elif period == 'week':   start, end = today - timedelta(days=6), today
        elif period == 'month':  start, end = today.replace(day=1), today
        elif period == 'year':   start, end = today.replace(month=1, day=1), today
        else:
            start = date.fromisoformat(request.query_params.get('start', str(today)))
            end   = date.fromisoformat(request.query_params.get('end',   str(today)))

        summary = get_financial_summary(start, end)
        summary.update({
            'period':     period,
            'start_date': str(start),
            'end_date':   str(end),
        })
        return Response(summary)


# ═══════════════════════════════════════════════════════
# DASHBOARD
# ═══════════════════════════════════════════════════════
class LabDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today  = date.today()
        orders = LabOrder.objects.all()
        bills  = LabBill.objects.all()

        today_orders  = orders.filter(created_at__date=today)
        today_bills   = bills.filter(created_at__date=today)

        billed_today    = today_bills.aggregate(v=Sum('total'))['v']       or 0
        collected_today = today_bills.filter(status='paid').aggregate(
                            v=Sum('amount_paid'))['v']                       or 0
        outstanding     = bills.filter(status__in=['unpaid','part_paid']).aggregate(
                            v=Sum('balance'))['v']                           or 0

        top_tests_today = list(
            ServiceInventoryEntry.objects.filter(date=today)
            .values('test__name','test__category')
            .annotate(count=Sum('count'), revenue=Sum('revenue'))
            .order_by('-count')[:8]
        )

        return Response({
            'orders': {
                'today':           today_orders.count(),
                'ordered':         orders.filter(status='ordered').count(),
                'in_progress':     orders.filter(status='in_progress').count(),
                'completed_today': today_orders.filter(status='completed').count(),
            },
            'samples': {
                'awaiting_collection': LabOrderItem.objects.filter(
                    sample_status='pending').count(),
                'in_lab': LabOrderItem.objects.filter(
                    sample_status='collected',
                    result_status__in=['in_progress','pending']).count(),
                'awaiting_approval': LabOrderItem.objects.filter(
                    result_status='completed').count(),
            },
            'billing': {
                'billed_today':    float(billed_today),
                'collected_today': float(collected_today),
                'outstanding':     float(outstanding),
                'unpaid_bills':    bills.filter(status='unpaid').count(),
                'part_paid_bills': bills.filter(status='part_paid').count(),
            },
            'top_tests_today': top_tests_today,
        })

