from django.contrib import admin
from .models import MalariaScreen


@admin.register(MalariaScreen)
class MalariaScreenAdmin(admin.ModelAdmin):
    list_display = ['patient', 'ai_label', 'ai_confidence', 'status', 'confirmed_by', 'created_at']
    list_filter = ['status', 'ai_label']
    search_fields = ['patient__first_name', 'patient__last_name']
