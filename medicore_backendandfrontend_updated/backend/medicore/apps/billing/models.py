from django.db import models
from core.models import TimeStampedModel
from django.conf import settings

class Invoice(TimeStampedModel):
    STATUS_CHOICES = [('draft','Draft'),('pending','Pending'),('partial','Partial'),('paid','Paid'),('cancelled','Cancelled')]
    PAYMENT_METHOD_CHOICES = [('cash','Cash'),('pos','POS/Card'),('transfer','Bank Transfer'),('nhis','NHIS Claim'),('insurance','Insurance')]

    invoice_number = models.CharField(max_length=20, unique=True, editable=False)
    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='invoices')
    appointment = models.ForeignKey('appointments.Appointment', on_delete=models.SET_NULL, null=True, blank=True)
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default='pending')
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    insurance_deduction = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    payment_method = models.CharField(max_length=15, choices=PAYMENT_METHOD_CHOICES, blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)

    class Meta:
        db_table = 'invoices'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.invoice_number} — {self.patient}"

    @property
    def balance_due(self):
        return self.total_amount - self.amount_paid

    def save(self, *args, **kwargs):
        if not self.invoice_number:
            from core.utils import generate_invoice_number
            self.invoice_number = generate_invoice_number()
        self.total_amount = self.subtotal - self.insurance_deduction - self.discount_amount
        super().save(*args, **kwargs)


class InvoiceItem(TimeStampedModel):
    CATEGORY_CHOICES = [
        ('consultation','Consultation'),('lab','Lab Test'),('radiology','Radiology'),
        ('pharmacy','Pharmacy'),('procedure','Procedure'),('room','Room/Bed'),('other','Other'),
    ]
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='items')
    description = models.CharField(max_length=200)
    category = models.CharField(max_length=15, choices=CATEGORY_CHOICES)
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    total_price = models.DecimalField(max_digits=10, decimal_places=2, editable=False)

    class Meta:
        db_table = 'invoice_items'

    def save(self, *args, **kwargs):
        self.total_price = self.quantity * self.unit_price
        super().save(*args, **kwargs)
