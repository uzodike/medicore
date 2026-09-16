from rest_framework import serializers
from .models import TeleSession, SessionMessage, EPrescription
from apps.patients.serializers import PatientListSerializer
from apps.accounts.serializers import UserSerializer

class SessionMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = SessionMessage
        fields = ['id','sender','sender_label','message','created_at']
        read_only_fields = ['id','sender','created_at']

class TeleSessionSerializer(serializers.ModelSerializer):
    patient_detail = PatientListSerializer(source='patient', read_only=True)
    doctor_detail = UserSerializer(source='doctor', read_only=True)
    duration_minutes = serializers.ReadOnlyField()
    messages = SessionMessageSerializer(many=True, read_only=True)

    class Meta:
        model = TeleSession
        fields = '__all__'
        read_only_fields = ['id','session_id','room_name','created_at','updated_at','booked_by']

class TeleSessionWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = TeleSession
        exclude = ['session_id','room_name','booked_by','is_deleted']

class EPrescriptionSerializer(serializers.ModelSerializer):
    doctor_name = serializers.SerializerMethodField()
    patient_name = serializers.SerializerMethodField()

    class Meta:
        model = EPrescription
        fields = '__all__'
        read_only_fields = ['id','sent_at','created_at']

    def get_doctor_name(self, obj):
        return obj.doctor.get_full_name()

    def get_patient_name(self, obj):
        return obj.patient.get_full_name()
