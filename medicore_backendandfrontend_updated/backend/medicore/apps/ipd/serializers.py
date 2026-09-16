from rest_framework import serializers
from .models import Ward, Bed, Admission, RoomRecord, RoomMedication


class BedSerializer(serializers.ModelSerializer):
    ward_name = serializers.CharField(source='ward.name', read_only=True)
    current_patient = serializers.SerializerMethodField()
    current_admission_id = serializers.SerializerMethodField()

    class Meta:
        model = Bed
        fields = ['id', 'ward', 'ward_name', 'bed_number', 'status', 'price',
                  'current_patient', 'current_admission_id', 'created_at', 'updated_at']

    def _active_admission(self, obj):
        # Tolerant of multiple historic admissions on the same bed;
        # works with or without prefetch_related('admissions__patient').
        try:
            for a in obj.admissions.all():
                if a.status == 'active' and not getattr(a, 'is_deleted', False):
                    return a
        except Exception:
            pass
        return None

    def get_current_patient(self, obj):
        a = self._active_admission(obj)
        if not a or not a.patient:
            return None
        # Patient.full_name is a property; fall back to first/last just in case
        return getattr(a.patient, 'full_name', None) or \
            f"{getattr(a.patient, 'first_name', '')} {getattr(a.patient, 'last_name', '')}".strip()

    def get_current_admission_id(self, obj):
        a = self._active_admission(obj)
        return str(a.id) if a else None


class WardSerializer(serializers.ModelSerializer):
    beds = BedSerializer(many=True, read_only=True)

    class Meta:
        model = Ward
        fields = ['id', 'name', 'ward_type', 'total_beds', 'beds', 'created_at', 'updated_at']


class RoomMedicationSerializer(serializers.ModelSerializer):
    drug_name = serializers.CharField(source='drug.name', read_only=True)

    class Meta:
        model = RoomMedication
        fields = '__all__'


class RoomRecordSerializer(serializers.ModelSerializer):
    medications = RoomMedicationSerializer(many=True, read_only=True)
    nurse_name = serializers.CharField(source='nurse.get_full_name', read_only=True, default='')

    class Meta:
        model = RoomRecord
        fields = '__all__'


class AdmissionSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    patient_pid = serializers.CharField(source='patient.patient_id', read_only=True, default='')
    doctor_name = serializers.CharField(source='doctor.get_full_name', read_only=True, default='')
    bed_detail = BedSerializer(source='bed', read_only=True)
    records = RoomRecordSerializer(many=True, read_only=True)

    class Meta:
        model = Admission
        fields = '__all__'
        read_only_fields = ['id', 'doctor', 'status', 'admitted_by',
                            'admitted_at', 'created_at', 'updated_at']