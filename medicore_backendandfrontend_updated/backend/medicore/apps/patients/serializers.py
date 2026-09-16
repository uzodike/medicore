from rest_framework import serializers
from .models import Patient, MedicalHistory

class MedicalHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = MedicalHistory
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at', 'patient']

class PatientSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    age = serializers.ReadOnlyField()
    medical_history = MedicalHistorySerializer(read_only=True)

    class Meta:
        model = Patient
        fields = '__all__'
        read_only_fields = ['id', 'patient_id', 'created_at', 'updated_at', 'registered_by']

    def get_full_name(self, obj):
        return obj.get_full_name()

class PatientListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views."""
    full_name = serializers.SerializerMethodField()
    age = serializers.ReadOnlyField()

    class Meta:
        model = Patient
        fields = ['first_name', 'last_name','id','patient_id','full_name','age','gender','phone','blood_group','insurance_provider','created_at']

    def get_full_name(self, obj):
        return obj.get_full_name()
