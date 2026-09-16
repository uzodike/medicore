from rest_framework import serializers
from .models import Drug, Prescription, PrescriptionItem, StockTransaction, DrugBatch

class DrugBatchSerializer(serializers.ModelSerializer):
    is_expired = serializers.ReadOnlyField()

    class Meta:
        model = DrugBatch
        fields = ['id', 'batch_number', 'quantity', 'expiry_date', 'supplier', 'is_expired']


class DrugSerializer(serializers.ModelSerializer):
    stock_status = serializers.ReadOnlyField()
    current_stock = serializers.ReadOnlyField()
    nearest_expiry = serializers.ReadOnlyField()
    # Real per-batch breakdown, FEFO order (earliest expiry first — the
    # model's Meta.ordering already sorts DrugBatch this way). Read-only;
    # batches are created via /receive/, not through this serializer.
    batches = DrugBatchSerializer(many=True, read_only=True)
    initial_stock = serializers.IntegerField(write_only=True, required=False, default=0)
    initial_batch = serializers.CharField(write_only=True, required=False, allow_blank=True)
    initial_expiry = serializers.DateField(write_only=True, required=False, allow_null=True)
    initial_supplier = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = Drug
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at', 'expiry_date', 'batch_number', 'supplier']

    def to_internal_value(self, data):
        # The Add-Drug form submits initial_expiry: "" when no batch is entered
        # (adding a drug with zero starting stock). DRF's DateField treats an
        # empty JSON string as an invalid date, not as "no value" — so every
        # such submission was silently rejected with a 400. Coerce '' -> None
        # here so "add to formulary, receive stock later" works as intended.
        if hasattr(data, 'copy'):
            data = data.copy()
            if data.get('initial_expiry') == '':
                data['initial_expiry'] = None
        return super().to_internal_value(data)

    def create(self, validated_data):
        initial_stock = validated_data.pop('initial_stock', 0)
        initial_batch = validated_data.pop('initial_batch', '')
        initial_expiry = validated_data.pop('initial_expiry', None)
        initial_supplier = validated_data.pop('initial_supplier', '')

        drug = super().create(validated_data)

        if initial_expiry:
            drug.expiry_date = initial_expiry
            drug.save(update_fields=['expiry_date'])

        if initial_stock > 0:
            DrugBatch.objects.create(
                drug=drug,
                batch_number=initial_batch or f'INITIAL-{drug.id}',
                quantity=initial_stock,
                expiry_date=initial_expiry or '2099-12-31',
                supplier=initial_supplier,
            )
        return drug

class PrescriptionItemSerializer(serializers.ModelSerializer):
    drug_name = serializers.SerializerMethodField()

    class Meta:
        model = PrescriptionItem
        fields = ['id', 'drug', 'drug_name', 'drug_name_free', 'dose', 'frequency',
                  'duration_days', 'dispense_source', 'quantity_prescribed',
                  'quantity_dispensed', 'is_dispensed']
        extra_kwargs = {'drug': {'required': False, 'allow_null': True}}

    def get_drug_name(self, obj):
        return obj.drug.name if obj.drug_id else (obj.drug_name_free or 'Unknown drug')
class PrescriptionSerializer(serializers.ModelSerializer):
    items = PrescriptionItemSerializer(many=True)
    patient_name = serializers.CharField(source='patient.get_full_name', read_only=True)
    doctor_name = serializers.CharField(source='doctor.get_full_name', read_only=True)

    class Meta:
        model = Prescription
        fields = ['id', 'prescription_id', 'patient', 'patient_name', 'doctor',
                  'doctor_name', 'status', 'notes', 'items', 'created_at']
        read_only_fields = ['prescription_id', 'created_at']

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        prescription = Prescription.objects.create(**validated_data)
        for item_data in items_data:
            PrescriptionItem.objects.create(prescription=prescription, **item_data)
        return prescription

class StockTransactionSerializer(serializers.ModelSerializer):
    drug_name = serializers.CharField(source='drug.name', read_only=True)
    performed_by_name = serializers.CharField(source='performed_by.get_full_name',
                                              read_only=True)
    # The Stock Ledger UI reads tx.movement_type (icon lookup, +/- sign) —
    # mirror the real model field so those reads stop coming back undefined.
    movement_type = serializers.CharField(source='transaction_type', read_only=True)
    balance_after = serializers.ReadOnlyField()

    class Meta:
        model = StockTransaction
        fields = '__all__'