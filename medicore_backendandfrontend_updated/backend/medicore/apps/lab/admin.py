from django.contrib import admin
from .models import LabTest, LabOrder, LabBill


@admin.register(LabTest)
class LabTestAdmin(admin.ModelAdmin):
    list_display = ['name', 'category', 'specimen_type', 'price', 'turnaround_time_hours', 'is_active']
    list_editable = ['price', 'is_active']
    list_filter = ['category', 'is_active']
    search_fields = ['name', 'short_name']


@admin.register(LabOrder)
class LabOrderAdmin(admin.ModelAdmin):
    list_display = ['order_number', 'patient', 'doctor', 'priority', 'status', 'created_at']
    list_filter = ['status', 'priority']
    search_fields = ['order_number', 'patient__first_name', 'patient__last_name']


@admin.register(LabBill)
class LabBillAdmin(admin.ModelAdmin):
    list_display = ['bill_number', 'patient', 'total', 'amount_paid', 'status']
    list_filter = ['status']
