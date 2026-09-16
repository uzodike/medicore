from rest_framework import serializers
from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.full_name', read_only=True, default=None)

    class Meta:
        model = Notification
        fields = ['id', 'title', 'message', 'category', 'link', 'is_read',
                  'patient', 'patient_name', 'created_at']
