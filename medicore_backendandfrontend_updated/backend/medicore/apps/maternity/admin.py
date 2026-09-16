from django.contrib import admin
from .models import ANCEnrollment, ANCVisit, Delivery


@admin.register(ANCEnrollment)
class ANCEnrollmentAdmin(admin.ModelAdmin):
    list_display = ['patient', 'lmp', 'edd', 'gravida', 'para', 'risk_level', 'status']
    list_filter = ['status', 'risk_level']
    search_fields = ['patient__first_name', 'patient__last_name']


@admin.register(ANCVisit)
class ANCVisitAdmin(admin.ModelAdmin):
    list_display = ['enrollment', 'visit_date', 'systolic_bp', 'diastolic_bp', 'urine_protein']


@admin.register(Delivery)
class DeliveryAdmin(admin.ModelAdmin):
    list_display = ['enrollment', 'delivery_datetime', 'mode', 'outcome', 'birth_weight_kg']
    list_filter = ['mode', 'outcome']
