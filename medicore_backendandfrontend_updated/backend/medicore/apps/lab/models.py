from django.db import models
from core.models import TimeStampedModel
from django.conf import settings
from django.utils import timezone
import uuid


# ═══════════════════════════════════════════════════════
# TEST CATALOGUE
# ═══════════════════════════════════════════════════════
class LabTest(TimeStampedModel):
    CATEGORY_CHOICES = [
        ('hematology',      'Hematology'),
        ('biochemistry',    'Biochemistry'),
        ('microbiology',    'Microbiology'),
        ('serology',        'Serology/Immunology'),
        ('urinalysis',      'Urinalysis'),
        ('histopathology',  'Histopathology'),
        ('imaging',         'Imaging/Radiology'),
        ('ecg',             'ECG/Cardiology'),
        ('other',           'Other'),
    ]
    SPECIMEN_CHOICES = [
        ('blood_edta',      'Blood (EDTA)'),
        ('blood_plain',     'Blood (Plain)'),
        ('blood_fluoride',  'Blood (Fluoride Oxalate)'),
        ('urine',           'Urine'),
        ('stool',           'Stool'),
        ('sputum',          'Sputum'),
        ('swab',            'Swab'),
        ('csf',             'CSF'),
        ('tissue',          'Tissue/Biopsy'),
        ('none',            'None (ECG/Scan)'),
    ]

    name                  = models.CharField(max_length=200)
    short_name            = models.CharField(max_length=50, blank=True)
    description           = models.TextField(blank=True)
    category              = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    specimen_type         = models.CharField(max_length=20, choices=SPECIMEN_CHOICES, default='blood_edta')
    unit                  = models.CharField(max_length=30, blank=True, help_text='e.g. g/dL, mmol/L, ×10³/µL')
    price                 = models.DecimalField(max_digits=10, decimal_places=2, default=False)
    is_active             = models.BooleanField(default=True)
    turnaround_time_hours = models.PositiveIntegerField(default=24)
    requires_fasting      = models.BooleanField(default=False)
    reference_range_low   = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    reference_range_high  = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    reference_note        = models.CharField(max_length=200, blank=True,
                            help_text='e.g. Adult Male: 13.5–17.5, Female: 12–16')
    # Inventory counter — incremented every time this test is performed
    times_performed       = models.PositiveIntegerField(default=0, editable=False)
    ai_test_type = models.CharField(max_length=40, blank=True,
                            help_text='Matches a Model.')

    class Meta:
        db_table = 'lab_tests'
        ordering = ['category', 'name']

    def __str__(self):
        return f'{self.name} (₦{self.price})'


# ═══════════════════════════════════════════════════════
# LAB ORDER
# ═══════════════════════════════════════════════════════
class LabOrder(TimeStampedModel):
    STATUS_CHOICES = [
        ('ordered',      'Ordered'),
        ('in_progress',  'In Progress'),
        ('completed',    'Completed'),
        ('cancelled',    'Cancelled'),
    ]
    PRIORITY_CHOICES = [
        ('routine',   'Routine'),
        ('urgent',    'Urgent'),
        ('stat',      'STAT — Immediate'),
    ]
    report_file = models.FileField(upload_to='lab_reports/%Y/%m/', null=True, blank=True)


    order_number = models.CharField(max_length=20, unique=True, blank=True)
    patient      = models.ForeignKey('patients.Patient', on_delete=models.CASCADE,
                                      related_name='lab_orders')
    doctor       = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                      related_name='lab_orders')
    priority     = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='routine')
    order_date   = models.DateTimeField(auto_now_add=True)
    status       = models.CharField(max_length=15, choices=STATUS_CHOICES, default='ordered')
    clinical_info = models.TextField(blank=True)
    notes        = models.TextField(blank=True)

    class Meta:
        db_table = 'lab_orders'
        ordering = ['-order_date']

    def __str__(self):
        return f'{self.order_number} — {self.patient}'

    def save(self, *args, **kwargs):
        if not self.order_number:
            from datetime import date
            count = LabOrder.objects.filter(
                created_at__year=date.today().year).count() + 1
            self.order_number = f'LAB-{date.today().year}-{str(count).zfill(4)}'
        super().save(*args, **kwargs)


# ═══════════════════════════════════════════════════════
# LAB ORDER ITEM
# ═══════════════════════════════════════════════════════
class LabOrderItem(TimeStampedModel):
    SAMPLE_STATUS_CHOICES = [
        ('pending',   'Pending Collection'),
        ('collected', 'Collected'),
        ('rejected',  'Rejected'),
    ]
    RESULT_STATUS_CHOICES = [
        ('pending',     'Pending'),
        ('in_progress', 'In Progress'),
        ('completed',   'Completed'),
        ('approved',    'Approved'),
    ]

    order                 = models.ForeignKey(LabOrder, on_delete=models.CASCADE, related_name='items')
    test                  = models.ForeignKey(LabTest, on_delete=models.CASCADE)
    sample_id             = models.CharField(max_length=36, unique=True,
                                              default=uuid.uuid4, editable=False)
    sample_status         = models.CharField(max_length=15, choices=SAMPLE_STATUS_CHOICES,
                                              default='pending')
    result_status         = models.CharField(max_length=15, choices=RESULT_STATUS_CHOICES,
                                              default='pending')
    result_value          = models.TextField(blank=True)
    result_numeric        = models.DecimalField(max_digits=10, decimal_places=2,
                                                 null=True, blank=True)
    reference_range_low   = models.DecimalField(max_digits=10, decimal_places=2,
                                                  null=True, blank=True)
    reference_range_high  = models.DecimalField(max_digits=10, decimal_places=2,
                                                  null=True, blank=True)
    unit                  = models.CharField(max_length=30, blank=True)
    flag                  = models.CharField(max_length=10, blank=True,
                            choices=[('','Normal'),('H','High'),('L','Low'),
                                     ('HH','Critical High'),('LL','Critical Low'),
                                     ('A','Abnormal'),('P','Positive'),('N','Negative')])
    remarks               = models.TextField(blank=True)
    approved_by           = models.ForeignKey(settings.AUTH_USER_MODEL,
                                               on_delete=models.SET_NULL,
                                               null=True, blank=True,
                                               related_name='approved_results')
    performed_by          = models.ForeignKey(settings.AUTH_USER_MODEL,
                                               on_delete=models.SET_NULL,
                                               null=True, blank=True,
                                               related_name='performed_tests')
    completed_at          = models.DateTimeField(null=True, blank=True)
    approved_at           = models.DateTimeField(null=True, blank=True)
    paid = models.BooleanField(default=False)

    class Meta:
        db_table = 'lab_order_items'

    def __str__(self):
        return f'{self.test.name} — {self.sample_id}'

    def compute_flag(self):
        """Auto-compute flag from numeric value vs reference range."""
        if self.result_numeric is None:
            return ''
        lo = self.reference_range_low
        hi = self.reference_range_high
        val = self.result_numeric
        if lo is not None and hi is not None:
            if val < lo * 0.8:  return 'LL'
            if val > hi * 1.2:  return 'HH'
            if val < lo:        return 'L'
            if val > hi:        return 'H'
        return ''


# ═══════════════════════════════════════════════════════
# SAMPLE COLLECTION
# ═══════════════════════════════════════════════════════
class SampleCollection(TimeStampedModel):
    item           = models.OneToOneField(LabOrderItem, on_delete=models.CASCADE,
                                           related_name='collection')
    collected_by   = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                        null=True, blank=True)
    collected_at   = models.DateTimeField(auto_now_add=True)
    sample_type    = models.CharField(max_length=50)
    sample_volume  = models.CharField(max_length=20, blank=True)
    container_type = models.CharField(max_length=50, blank=True)
    condition      = models.CharField(max_length=20, blank=True,
                     choices=[('acceptable','Acceptable'),('haemolyzed','Haemolyzed'),
                               ('lipemic','Lipemic'),('rejected','Rejected')])

    class Meta:
        db_table = 'sample_collections'


# ═══════════════════════════════════════════════════════
# RESULT AUDIT TRAIL
# ═══════════════════════════════════════════════════════
class LabResultHistory(TimeStampedModel):
    item           = models.ForeignKey(LabOrderItem, on_delete=models.CASCADE, related_name='history')
    previous_value = models.TextField(blank=True)
    new_value      = models.TextField()
    changed_by     = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    action         = models.CharField(max_length=20, default='result_entry',
                     choices=[('result_entry','Result Entry'),('amendment','Amendment'),
                               ('approval','Approval'),('rejection','Rejection')])

    class Meta:
        db_table = 'lab_result_history'
        ordering = ['-created_at']


# ═══════════════════════════════════════════════════════
# LAB BILL (own billing module — independent)
# ═══════════════════════════════════════════════════════
class LabBill(TimeStampedModel):
    STATUS_CHOICES = [
        ('unpaid',    'Unpaid'),
        ('part_paid', 'Part Paid'),
        ('paid',      'Paid'),
        ('waived',    'Waived'),
        ('insurance', 'Insurance'),
    ]
    METHOD_CHOICES = [
        ('cash',      'Cash'),
        ('pos',       'POS / Card'),
        ('transfer',  'Bank Transfer'),
        ('nhis',      'NHIS / HMO'),
        ('waived',    'Waived'),
    ]

    invoice = models.OneToOneField(
        'billing.Invoice', 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='lab_bill_link'
    )

    bill_number     = models.CharField(max_length=20, unique=True)
    order           = models.OneToOneField(LabOrder, on_delete=models.CASCADE,
                                            related_name='bill', null=True, blank=True)
    patient         = models.ForeignKey('patients.Patient', on_delete=models.CASCADE,
                                         related_name='lab_bills')
    subtotal        = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount        = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    insurance_cover = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total           = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    amount_paid     = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    balance         = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    status          = models.CharField(max_length=10, choices=STATUS_CHOICES, default='unpaid')
    payment_method  = models.CharField(max_length=10, choices=METHOD_CHOICES, blank=True)
    paid_at         = models.DateTimeField(null=True, blank=True)
    collected_by    = models.CharField(max_length=100, blank=True)
    notes           = models.TextField(blank=True)

    class Meta:
        db_table = 'lab_bills'
        ordering = ['-created_at']


    def save(self, *args, **kwargs):
        if not self.bill_number:
            from django.utils import timezone
            year = timezone.now().year
            count = LabBill.objects.filter(created_at__year=year).count() + 1
            self.bill_number = f"LAB-{year}-{str(count).zfill(5)}"
        super().save(*args, **kwargs)

    def recalculate(self):
        """Update totals from order items."""
        items = self.order.items.all()
        self.subtotal = sum(item.test.price for item in items)
        self.total = self.subtotal - self.discount - self.insurance_cover
        self.balance = self.total - self.amount_paid
        # Auto-update status
        if self.balance <= 0 and self.amount_paid > 0:
            self.status = 'paid'
        elif self.amount_paid > 0:
            self.status = 'part_paid'
        else:
            self.status = 'pending'
        self.save()

    def __str__(self):
        return f'{self.bill_number} — {self.patient} — ₦{self.total}'


class LabBillItem(models.Model):
    bill       = models.ForeignKey(LabBill, on_delete=models.CASCADE, related_name='line_items')
    test       = models.ForeignKey(LabTest, on_delete=models.PROTECT)
    quantity   = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    total      = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        db_table = 'lab_bill_items'


class LabPayment(TimeStampedModel):
    """Individual payment transactions against a bill (supports part-payments)."""
    bill          = models.ForeignKey(LabBill, on_delete=models.CASCADE, related_name='payments')
    amount        = models.DecimalField(max_digits=10, decimal_places=2)
    method        = models.CharField(max_length=10, choices=LabBill.METHOD_CHOICES)
    received_by   = models.CharField(max_length=100, blank=True)
    reference     = models.CharField(max_length=100, blank=True)  # POS receipt / transfer ref

    class Meta:
        db_table = 'lab_payments'
        ordering = ['-created_at']


# ═══════════════════════════════════════════════════════
# SERVICE INVENTORY (daily roll-up per test)
# ═══════════════════════════════════════════════════════
class ServiceInventoryEntry(TimeStampedModel):
    """One row per (test, date) — updated atomically when a result is approved."""
    test       = models.ForeignKey(LabTest, on_delete=models.CASCADE,
                                    related_name='inventory_entries')
    date       = models.DateField()
    count      = models.PositiveIntegerField(default=0)
    revenue    = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        db_table   = 'lab_service_inventory'
        unique_together = [('test', 'date')]
        ordering   = ['-date', 'test__category']

    def __str__(self):
        return f'{self.date} | {self.test.name} × {self.count}'