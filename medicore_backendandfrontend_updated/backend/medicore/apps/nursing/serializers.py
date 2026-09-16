from rest_framework import serializers
from .models import VitalRecord, MedicationAdministration

class VitalRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = VitalRecord
        fields = '__all__'
        read_only_fields = ['id','created_at','updated_at','recorded_by']

class MARSerializer(serializers.ModelSerializer):
    class Meta:
        model = MedicationAdministration
        fields = '__all__'
        read_only_fields = ['id','created_at','administered_by']
