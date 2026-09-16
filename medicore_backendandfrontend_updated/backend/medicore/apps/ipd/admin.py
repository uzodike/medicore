from django.contrib import admin
from .models import Ward, Bed, Admission


class BedInline(admin.TabularInline):
    model = Bed
    extra = 0
    fields = ['bed_number', 'status', 'price']


@admin.register(Ward)
class WardAdmin(admin.ModelAdmin):
    list_display = ['name', 'ward_type', 'total_beds']
    inlines = [BedInline]


@admin.register(Bed)
class BedAdmin(admin.ModelAdmin):
    list_display = ['__str__', 'ward', 'status', 'price']
    list_editable = ['status', 'price']
    list_filter = ['ward', 'status']


@admin.register(Admission)
class AdmissionAdmin(admin.ModelAdmin):
    list_display = ['patient', 'bed', 'doctor', 'status', 'admitted_at']
    list_filter = ['status', 'admission_type']
    search_fields = ['patient__first_name', 'patient__last_name']
