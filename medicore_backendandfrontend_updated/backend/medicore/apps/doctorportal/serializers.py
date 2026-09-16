from rest_framework import serializers
from apps.patients.models import Patient
from apps.appointments.models import Appointment
from apps.pharmacy.models import Prescription, PrescriptionItem, Drug
from apps.appointments.models import ClinicalNote


# ── Clinical Note ──────────────────────────────────────────────────
#class ClinicalNoteSerializer(serializers.ModelSerializer):
    #doctor_name = serializers.CharField(source='doctor.get_full_name', read_only=True)
    #patient_name = serializers.CharField(source='patient.full_name', read_only=True)

    #class Meta:
     #   model  = ClinicalNote
      #  fields = '__all__'
       # read_only_fields = ['id', 'doctor', 'created_at', 'updated_at']


# ── Prescription ───────────────────────────────────────────────────
class PrescriptionItemWriteSerializer(serializers.Serializer):
    """
    Accepts free-text drug_name from doctor.
    Attempts to link to Drug registry; if not found, stores name as text.
    """
    drug_name          = serializers.CharField()
    dose               = serializers.CharField()
    frequency          = serializers.CharField(default='BD')
    duration_days      = serializers.IntegerField(default=7)
    quantity_prescribed = serializers.IntegerField(default=0)
    instructions       = serializers.CharField(default='', allow_blank=True)
    dispense_source    = serializers.ChoiceField(choices=['pharmacy', 'external'], default='pharmacy')
    
    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        # Try to find a matching drug in the registry (case-insensitive)
        drug_qs = Drug.objects.filter(name__icontains=value['drug_name'])
        value['drug_obj'] = drug_qs.first()   # may be None — that's ok
        return value


class DoctorPrescriptionSerializer(serializers.ModelSerializer):
    items        = serializers.SerializerMethodField()
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    doctor_name  = serializers.CharField(source='doctor.get_full_name', read_only=True)
    prescription_id = serializers.CharField(read_only=True)

    class Meta:
        model  = Prescription
        fields = ['id', 'prescription_id', 'patient', 'patient_name',
                  'doctor', 'doctor_name', 'status', 'notes', 'items',
                  'created_at']
        read_only_fields = ['id', 'prescription_id', 'created_at', 'status', 'doctor']

    def get_items(self, obj):
        return [
            {
                'drug_name': item.drug.name if item.drug_id else item.drug_name_free,
                'dose': item.dose,
                'frequency': item.frequency,
                'duration_days': item.duration_days,
                'dispense_source': item.dispense_source,
                'quantity_dispensed': item.quantity_dispensed,
                'is_dispensed': item.is_dispensed,
            }
            for item in obj.items.all()
        ]

    def create(self, validated_data):
        items_data = self.initial_data.get('items', [])
        item_ser = PrescriptionItemWriteSerializer(data=items_data, many=True)
        item_ser.is_valid(raise_exception=True)

        prescription = Prescription.objects.create(
            patient=validated_data['patient'],
            doctor=self.context['request'].user,
            notes=validated_data.get('notes', ''),
        )
        for item in item_ser.validated_data:
            PrescriptionItem.objects.create(
                prescription=prescription,
                drug=item.get('drug_obj'),
                drug_name_free=item['drug_name'],
                dose=item['dose'],
                frequency=item['frequency'],
                duration_days=item['duration_days'],
                quantity_prescribed=item['quantity_prescribed'],
                instructions=item['instructions'],
                dispense_source=item['dispense_source'],
            )
        return prescription


# ── Patient & Appointment (for queue) ─────────────────────────────
class QueuePatientSerializer(serializers.ModelSerializer):
    full_name  = serializers.CharField(read_only=True)
    patient_id = serializers.CharField(source='pid', read_only=True)
    insurance_display = serializers.CharField(
        source='get_insurance_provider_display', read_only=True
    )

    class Meta:
        model  = Patient
        fields = ['id', 'patient_id', 'full_name', 'first_name', 'last_name',
                  'date_of_birth', 'gender', 'phone', 'allergies',
                  'blood_group', 'genotype', 'insurance_provider', 'insurance_id',
                  'insurance_display', 'hmo_plan', 'age']


class QueueAppointmentSerializer(serializers.ModelSerializer):
    patient_detail = QueuePatientSerializer(source='patient', read_only=True)
    patient_name   = serializers.CharField(source='patient.full_name', read_only=True)
    tele           = serializers.SerializerMethodField()

    class Meta:
        model  = Appointment
        fields = '__all__'

    def get_tele(self, obj):
        try:
            ts = obj.tele_session
        except Exception:
            return None
        if not ts:
            return None
        return {
            'id':           str(ts.id),
            'session_id':   ts.session_id,
            'join_token':   ts.join_token,
            'join_path':    f'/telemedicine/join/{ts.join_token}',
            'room_name':    ts.room_name,
            'status':       ts.status,
            'consult_type': ts.consult_type,
        }