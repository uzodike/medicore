from rest_framework import serializers
from .models import ANCEnrollment, ANCVisit, Delivery


class ANCVisitSerializer(serializers.ModelSerializer):
    ga_at_visit_weeks = serializers.ReadOnlyField()
    seen_by_name = serializers.CharField(source='seen_by.get_full_name', read_only=True, default='')

    class Meta:
        model = ANCVisit
        fields = '__all__'
        read_only_fields = ['id', 'seen_by', 'created_at', 'updated_at']


class DeliverySerializer(serializers.ModelSerializer):
    conducted_by_name = serializers.CharField(source='conducted_by.get_full_name', read_only=True, default='')
    patient_name = serializers.CharField(source='enrollment.patient.full_name', read_only=True)

    class Meta:
        model = Delivery
        fields = '__all__'
        read_only_fields = ['id', 'conducted_by', 'created_at', 'updated_at']


class ANCEnrollmentSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    patient_pid = serializers.CharField(source='patient.patient_id', read_only=True, default='')
    patient_age = serializers.IntegerField(source='patient.age', read_only=True, default=None)
    doctor_name = serializers.CharField(source='doctor.get_full_name', read_only=True, default='')
    edd = serializers.ReadOnlyField()
    gestational_age_weeks = serializers.ReadOnlyField()
    visits = ANCVisitSerializer(many=True, read_only=True)
    deliveries = DeliverySerializer(many=True, read_only=True)
    visit_count = serializers.SerializerMethodField()

    class Meta:
        model = ANCEnrollment
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_visit_count(self, obj):
        return obj.visits.count()
