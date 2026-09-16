# apps/lab/signals.py
from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import LabOrder, LabBill, LabPayment

@receiver(post_save, sender=LabBill)
def sync_lab_bill_to_invoice(sender, instance, created, **kwargs):
    """When LabBill changes, sync totals/status to its linked Invoice."""
    if not instance.invoice:
        return

    invoice = instance.invoice
    # Sync financials
    invoice.subtotal = instance.subtotal
    invoice.discount_amount = instance.discount
    invoice.insurance_deduction = instance.insurance_cover
    invoice.total_amount = instance.total
    invoice.amount_paid = instance.amount_paid
    
    # Sync statuses (map LabBill status to Invoice status)
    status_map = {
        'unpaid': 'pending',
        'part_paid': 'partial',
        'paid': 'paid',
        'waived': 'paid',  # Waived is considered settled
    }
    invoice.status = status_map.get(instance.status, 'pending')
    
    # Only update if the invoice hasn't been deleted externally
    invoice.save(update_fields=[
        'subtotal', 'discount_amount', 'insurance_deduction', 
        'total_amount', 'amount_paid', 'status'
    ])


@receiver(post_save, sender=LabPayment)
def sync_payment_to_invoice(sender, instance, **kwargs):
    """When a LabPayment is created, update the Invoice's amount_paid."""
    bill = instance.bill
    if not bill.invoice:
        return
    
    # Force a recalculation on the LabBill first (just in case)
    bill.recalculate() 
    
    # The post_save on LabBill will trigger `sync_lab_bill_to_invoice` automatically,
    # because we just saved the bill above. 
    # But we need to ensure the invoice amount_paid is exactly correct.
    invoice = bill.invoice
    invoice.amount_paid = bill.amount_paid
    invoice.save(update_fields=['amount_paid'])