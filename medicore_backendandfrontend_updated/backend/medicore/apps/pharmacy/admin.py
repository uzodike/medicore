from django.contrib import admin
from .models import Drug, DrugBatch


class BatchInline(admin.TabularInline):
    model = DrugBatch
    extra = 0


@admin.register(Drug)
class DrugAdmin(admin.ModelAdmin):
    list_display = ['name', 'generic_name', 'category', 'unit_price', 'reorder_level']
    list_editable = ['unit_price', 'reorder_level']
    list_filter = ['category']
    search_fields = ['name', 'generic_name']
    inlines = [BatchInline]
