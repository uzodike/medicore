from django.contrib import admin
from .models import Invoice, InvoiceItem


class ItemInline(admin.TabularInline):
    model = InvoiceItem
    extra = 0


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ['invoice_number', 'patient', 'status', 'total_amount', 'amount_paid', 'created_at']
    list_filter = ['status', 'payment_method']
    search_fields = ['invoice_number', 'patient__first_name', 'patient__last_name']
    inlines = [ItemInline]
