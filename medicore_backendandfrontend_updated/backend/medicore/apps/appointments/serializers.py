# appointments/serializers.py
from rest_framework import serializers
from .models import Appointment, ClinicalNote
from apps.patients.serializers import PatientListSerializer
from apps.accounts.serializers import UserSerializer


class AppointmentSerializer(serializers.ModelSerializer):
    patient_detail = PatientListSerializer(source='patient', read_only=True)
    doctor_detail  = UserSerializer(source='doctor', read_only=True)
    tele           = serializers.SerializerMethodField()

    class Meta:
        model  = Appointment
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at', 'booked_by']

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
            'join_url': ts.join_url,
        }


class AppointmentWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model   = Appointment
        exclude = ['booked_by', 'is_deleted']


# ── Clinical notes ────────────────────────────────────────────────────────────

class ClinicalNoteSerializer(serializers.ModelSerializer):
    doctor_name  = serializers.SerializerMethodField()
    patient_name = serializers.SerializerMethodField()

    class Meta:
        model  = ClinicalNote
        fields = [
            'id', 'patient', 'patient_name', 'appointment',
            'doctor', 'doctor_name',
            'subjective', 'objective', 'assessment', 'plan',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'doctor', 'created_at', 'updated_at']

    def get_doctor_name(self, obj):
        return obj.doctor.get_full_name() if obj.doctor else '—'

    def get_patient_name(self, obj):
        if obj.patient:
            return f"{obj.patient.first_name} {obj.patient.last_name}"
        return '—'


class ClinicalNoteWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ClinicalNote
        fields = ['id', 'patient', 'appointment', 'subjective', 'objective', 'assessment', 'plan']
        read_only_fields = ['id']