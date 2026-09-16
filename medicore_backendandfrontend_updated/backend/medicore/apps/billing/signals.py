from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import InvoiceItem, Invoice

@receiver(post_save, sender=InvoiceItem)
def update_invoice_subtotal(sender, instance, **kwargs):
    invoice = instance.invoice
    subtotal = sum(i.total_price for i in invoice.items.all())
    Invoice.objects.filter(pk=invoice.pk).update(
        subtotal=subtotal,
        total_amount=subtotal - invoice.insurance_deduction - invoice.discount_amount
    )
