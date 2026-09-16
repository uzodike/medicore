from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import Invoice, InvoiceItem
from .serializers import InvoiceSerializer, InvoiceCreateSerializer, InvoiceItemSerializer

class InvoiceListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    filterset_fields = ['status','payment_method','patient']
    search_fields = ['invoice_number','patient__first_name','patient__last_name']
    ordering_fields = ['created_at','total_amount']

    def get_queryset(self):
        return Invoice.objects.filter(is_deleted=False).select_related('patient')

    def get_serializer_class(self):
        return InvoiceCreateSerializer if self.request.method == 'POST' else InvoiceSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

class InvoiceDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = InvoiceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Invoice.objects.filter(is_deleted=False)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def post_payment(request, pk):
    from decimal import Decimal, InvalidOperation
    try:
        invoice = Invoice.objects.get(pk=pk, is_deleted=False)
    except Invoice.DoesNotExist:
        return Response({'error': 'Invoice not found'}, status=404)
    try:
        amount = Decimal(str(request.data.get('amount_paid', 0)))
    except (InvalidOperation, TypeError):
        return Response({'error': 'Invalid amount'}, status=400)
    if amount <= 0:
        return Response({'error': 'Amount must be positive'}, status=400)
    method = request.data.get('payment_method', 'cash')
    invoice.amount_paid += amount
    invoice.payment_method = method
    if invoice.amount_paid >= invoice.total_amount:
        invoice.status = 'paid'
    elif invoice.amount_paid > 0:
        invoice.status = 'partial'
    invoice.save()
    return Response(InvoiceSerializer(invoice).data)