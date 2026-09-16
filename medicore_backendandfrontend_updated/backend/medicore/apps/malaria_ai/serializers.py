# apps/malaria_ai/serializers.py
from rest_framework import serializers
from .models import MalariaScreen, MalariaScreenBox


class MalariaScreenBoxSerializer(serializers.ModelSerializer):
    class Meta:
        model = MalariaScreenBox
        fields = ['id', 'x1', 'y1', 'x2', 'y2', 'predicted_class',
                  'source', 'ai_confidence', 'confirmed', 'rejected', 'created_at']


class MalariaScreenSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.full_name', read_only=True, default='')
    confirmed_by_name = serializers.CharField(source='confirmed_by.get_full_name',
                                              read_only=True, default='')
    ai_and_human_agree = serializers.ReadOnlyField()
    # empty for classify-kind screens (malaria, sickle_cell) — only
    # populated for detect-kind screens (tb_smear, microfilariae)
    boxes = MalariaScreenBoxSerializer(many=True, read_only=True)

    class Meta:
        model = MalariaScreen
        fields = '__all__'
        read_only_fields = ['id', 'ai_label', 'ai_confidence', 'ai_model_version',
                            'ai_raw_response', 'confirmed_by', 'confirmed_at',
                            'created_at', 'updated_at']