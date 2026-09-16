from rest_framework import serializers
from .models import Invoice, InvoiceItem
from apps.patients.serializers import PatientListSerializer

class InvoiceItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceItem
        fields = '__all__'
        read_only_fields = ['id','total_price','created_at', 'invoice']

class InvoiceSerializer(serializers.ModelSerializer):
    items = InvoiceItemSerializer(many=True, read_only=True)
    patient_detail = PatientListSerializer(source='patient', read_only=True)
    balance_due = serializers.ReadOnlyField()

    class Meta:
        model = Invoice
        fields = '__all__'
        read_only_fields = ['id','invoice_number','total_amount','created_at','created_by', 'invoice']

class InvoiceCreateSerializer(serializers.ModelSerializer):
    items = InvoiceItemSerializer(many=True)

    class Meta:
        model = Invoice
        exclude = ['invoice_number','total_amount','created_by','is_deleted']

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        invoice = Invoice.objects.create(**validated_data)
        subtotal = 0
        for item_data in items_data:
            item = InvoiceItem.objects.create(invoice=invoice, **item_data)
            subtotal += item.total_price
        invoice.subtotal = subtotal
        invoice.save()
        return invoice
