# apps/ai_screening/serializers.py
from rest_framework import serializers
from .models import AIScreen, AIScreenBox


class AIScreenBoxSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIScreenBox
        fields = ['id', 'x1', 'y1', 'x2', 'y2', 'predicted_class',
                  'source', 'ai_confidence', 'confirmed', 'rejected', 'created_at']


class AIScreenSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.full_name', read_only=True, default='')
    patient_pid = serializers.CharField(source='patient.pid', read_only=True, default='')
    confirmed_by_name = serializers.CharField(source='confirmed_by.get_full_name',
                                               read_only=True, default='')
    boxes = AIScreenBoxSerializer(many=True, read_only=True)
    # not a DB field — computed property on the model, exposed here so the
    # confirm UI can show "AI and scientist disagreed" without a second call
    ai_and_human_agree = serializers.ReadOnlyField()

    class Meta:
        model = AIScreen
        fields = [
            'id', 'test_type', 'patient', 'patient_name', 'patient_pid',
            'order_item', 'image',
            'ai_label', 'ai_confidence', 'ai_model_version', 'ai_raw_response',
            'status', 'confirmed_by', 'confirmed_by_name', 'confirmed_at',
            'scientist_notes', 'boxes', 'ai_and_human_agree',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'ai_label', 'ai_confidence', 'ai_model_version', 'ai_raw_response',
            'confirmed_by', 'confirmed_at', 'created_at', 'updated_at',
        ]