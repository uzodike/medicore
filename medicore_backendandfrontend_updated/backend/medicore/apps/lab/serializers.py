from rest_framework import serializers
from .models import (LabTest, LabOrder, LabOrderItem, SampleCollection,
                     LabResultHistory, LabBill, LabBillItem, LabPayment,
                     ServiceInventoryEntry)


class LabTestSerializer(serializers.ModelSerializer):
    class Meta:
        model  = LabTest
        fields = '__all__'


class SampleCollectionSerializer(serializers.ModelSerializer):
    collected_by_name = serializers.CharField(source='collected_by.get_full_name',
                                               read_only=True, default='')
    class Meta:
        model  = SampleCollection
        fields = '__all__'


class LabResultHistorySerializer(serializers.ModelSerializer):
    changed_by_name = serializers.CharField(source='changed_by.get_full_name',
                                             read_only=True, default='')
    class Meta:
        model  = LabResultHistory
        fields = '__all__'


class LabOrderItemSerializer(serializers.ModelSerializer):
    test_name            = serializers.CharField(source='test.name',     read_only=True)
    test_category        = serializers.CharField(source='test.category', read_only=True)
    test_specimen        = serializers.CharField(source='test.get_specimen_type_display',
                                                  read_only=True)
    patient_name   = serializers.CharField(source='order.patient.full_name', read_only=True)
    patient_pid    = serializers.CharField(source='order.patient.pid', read_only=True)
    order_number   = serializers.CharField(source='order.order_number', read_only=True)
    order_priority = serializers.CharField(source='order.priority', read_only=True)
    test_price           = serializers.DecimalField(source='test.price',
                           max_digits=10, decimal_places=2, read_only=True)
    test_ref_low         = serializers.DecimalField(source='test.reference_range_low',
                           max_digits=10, decimal_places=2, read_only=True, allow_null=True)
    test_ref_high        = serializers.DecimalField(source='test.reference_range_high',
                           max_digits=10, decimal_places=2, read_only=True, allow_null=True)
    test_ref_note        = serializers.CharField(source='test.reference_note', read_only=True)
    test_unit            = serializers.CharField(source='test.unit', read_only=True)
    collection           = SampleCollectionSerializer(read_only=True)
    history              = LabResultHistorySerializer(many=True, read_only=True)
    performed_by_name    = serializers.CharField(source='performed_by.get_full_name',
                                                  read_only=True, default='')
    approved_by_name     = serializers.CharField(source='approved_by.get_full_name',
                                                  read_only=True, default='')
    flag_display         = serializers.SerializerMethodField()

    class Meta:
        model  = LabOrderItem
        fields = '__all__'

    def get_flag_display(self, obj):
        flags = {'H':'High','L':'Low','HH':'Critical High','LL':'Critical Low',
                 'A':'Abnormal','P':'Positive','N':'Negative','':'Normal'}
        return flags.get(obj.flag, obj.flag)


class LabOrderWriteSerializer(serializers.ModelSerializer):
    """Slim serializer for creating orders (nested items as list of test IDs)."""
    test_ids = serializers.ListField(child=serializers.UUIDField(), write_only=True)

    class Meta:
        model  = LabOrder
        fields = ['patient', 'priority', 'clinical_info', 'notes', 'test_ids']

    def create(self, validated_data):
        test_ids = validated_data.pop('test_ids')
        order    = LabOrder.objects.create(**validated_data)
        tests    = LabTest.objects.filter(id__in=test_ids, is_active=True)
        for test in tests:
            LabOrderItem.objects.create(order=order, test=test)
        from .service import create_bill_for_order
        create_bill_for_order(order)
        return order


class LabOrderSerializer(serializers.ModelSerializer):
    items            = LabOrderItemSerializer(many=True, read_only=True)
    patient_name     = serializers.CharField(source='patient.full_name',   read_only=True)
    patient_pid      = serializers.CharField(source='patient.pid',          read_only=True)
    doctor_name      = serializers.CharField(source='doctor.get_full_name', read_only=True)
    doctor           = serializers.PrimaryKeyRelatedField(read_only=True)
    bill_number      = serializers.CharField(source='bill.bill_number',     read_only=True,
                                              default=None)
    bill_status      = serializers.CharField(source='bill.status',          read_only=True,
                                              default=None)
    bill_total       = serializers.DecimalField(source='bill.total', max_digits=10,
                       decimal_places=2, read_only=True, default=None)

    class Meta:
        model  = LabOrder
        fields = ['id', 'order_number', 'patient', 'patient_name', 'patient_pid',
                  'doctor', 'doctor_name', 'priority', 'order_date', 'status',
                  'clinical_info', 'notes', 'items', 'created_at',
                  'bill_number', 'bill_status', 'bill_total', 'report_file']
        read_only_fields = ['order_date', 'created_at', 'order_number']


# ── Billing serializers ────────────────────────────────────────────
class LabBillItemSerializer(serializers.ModelSerializer):
    test_name = serializers.CharField(source='test.name', read_only=True)
    class Meta:
        model  = LabBillItem
        fields = '__all__'


class LabPaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model  = LabPayment
        fields = '__all__'
        read_only_fields = ['id', 'created_at']


class LabBillSerializer(serializers.ModelSerializer):
    patient_name  = serializers.CharField(source='patient.full_name', read_only=True)
    patient_pid   = serializers.CharField(source='patient.pid',       read_only=True)
    order_number  = serializers.CharField(source='order.order_number', read_only=True,
                                           allow_null=True)
    line_items    = LabBillItemSerializer(many=True, read_only=True)
    payments      = LabPaymentSerializer(many=True, read_only=True)
    bill_number = serializers.CharField(read_only=True)

    class Meta:
        model  = LabBill
        fields = '__all__'
        read_only_fields = ['id', 'bill_number', 'created_at', 'updated_at']

    def get_line_items(self, obj):
        return [
            {'test_name': item.test.name, 'price': item.test.price}
            for item in obj.order.items.all()]


# ── Service inventory serializer ────────────────────────────────────
class ServiceInventorySerializer(serializers.ModelSerializer):
    test_name     = serializers.CharField(source='test.name',     read_only=True)
    test_category = serializers.CharField(source='test.category', read_only=True)
    test_price    = serializers.DecimalField(source='test.price',
                    max_digits=10, decimal_places=2, read_only=True)
    class Meta:
        model  = ServiceInventoryEntry
        fields = '__all__'