from django.contrib import admin
from .models import Patient, MedicalHistory

class MedicalHistoryInline(admin.StackedInline):
    model = MedicalHistory
    extra = 0

@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = ['patient_id', 'get_full_name', 'gender', 'blood_group', 'insurance_provider', 'created_at']
    list_filter = ['gender', 'blood_group', 'insurance_provider']
    search_fields = ['patient_id', 'first_name', 'last_name', 'phone', 'email']
    inlines = [MedicalHistoryInline]
    readonly_fields = ['patient_id', 'created_at', 'updated_at']
