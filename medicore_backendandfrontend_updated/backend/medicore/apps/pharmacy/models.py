from django.db import models
from django.db.models import Sum               # needed for aggregation
from django.conf import settings
from datetime import date                      # needed for DrugBatch.is_expired
from core.models import TimeStampedModel


class Drug(TimeStampedModel):
    CATEGORY_CHOICES = [
        ('antibiotic', 'Antibiotic'),
        ('antihypertensive', 'Antihypertensive'),
        ('antidiabetic', 'Antidiabetic'),
        ('analgesic', 'Analgesic'),
        ('antiplatelet', 'Antiplatelet'),
        ('iv_fluid', 'IV Fluid'),
        ('other', 'Other'),
    ]

    name = models.CharField(max_length=200)
    generic_name = models.CharField(max_length=200, blank=True)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    unit = models.CharField(max_length=30, default='tablet')
    reorder_level = models.PositiveIntegerField(default=50)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    expiry_date = models.DateField(null=True, blank=True)       # optional – batches may override
    batch_number = models.CharField(max_length=50, blank=True)  # legacy field, you may keep or drop
    supplier = models.CharField(max_length=150, blank=True)

    # ── Added: fields the Pharmacy UI has always collected but the model never stored ──
    barcode = models.CharField(max_length=64, blank=True)
    dosage_form = models.CharField(max_length=30, blank=True, default='tablet')
    strength = models.CharField(max_length=50, blank=True)          # e.g. "500mg"
    rx_required = models.BooleanField(default=False)                # prescription-only flag
    interactions = models.TextField(blank=True)                     # known drug interactions

    class Meta:
        db_table = 'drugs'
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.current_stock} {self.unit})"

    @property
    def current_stock(self):
        """Total stock across all non‑expired batches (or all batches if you prefer)"""
        return self.batches.aggregate(
            total=Sum('quantity', filter=~models.Q(expiry_date__lt=date.today()))
        )['total'] or 0

    @property
    def stock_status(self):
        if self.current_stock <= 0:
            return 'out_of_stock'
        if self.current_stock <= self.reorder_level * 0.3:
            return 'critical'
        if self.current_stock <= self.reorder_level:
            return 'low'
        return 'good'

    @property
    def nearest_expiry(self):
        """
        The expiry date that actually matters day-to-day: the earliest-expiring
        batch with stock left — i.e. the FEFO batch, the one dispensed next.
        Unlike the static `expiry_date` field (only ever set once, at creation,
        and never touched by later restocks) this is always current.
        """
        b = self.batches.filter(quantity__gt=0).order_by('expiry_date').first()
        return b.expiry_date if b else None


class DrugBatch(TimeStampedModel):
    drug = models.ForeignKey(Drug, on_delete=models.CASCADE, related_name='batches')
    batch_number = models.CharField(max_length=50)
    quantity = models.PositiveIntegerField()
    expiry_date = models.DateField()
    supplier = models.CharField(max_length=150, blank=True)

    class Meta:
        db_table = 'drug_batches'
        ordering = ['expiry_date']

    @property
    def is_expired(self):
        return self.expiry_date < date.today()

    def __str__(self):
        return f"{self.batch_number} ({self.quantity} × {self.drug.name})"


class StockTransaction(TimeStampedModel):
    TRANSACTION_TYPES = [
        ('dispense', 'Dispense'),
        ('restock', 'Restock'),
        ('adjust', 'Adjustment'),
        ('return', 'Return'),
        ('expired', 'Expired'),
        ('damaged', 'Damaged'),
    ]
    drug = models.ForeignKey(Drug, on_delete=models.CASCADE, related_name='transactions')
    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_TYPES)
    quantity = models.IntegerField()               # positive = in, negative = out
    patient_name = models.CharField(max_length=200, blank=True)
    reference = models.CharField(max_length=200, blank=True)    # Rx number, walk‑in, etc.
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='pharmacy_transactions'
    )
    notes = models.TextField(blank=True)
    # Snapshot of current_stock immediately after this transaction was applied.
    # Powers the "Balance" column in Stock History without recomputing on every
    # read. Null on rows created before this field existed.
    balance_after = models.IntegerField(null=True, blank=True)

    class Meta:
        db_table = 'stock_transactions'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.transaction_type} {abs(self.quantity)} × {self.drug.name}"


class Prescription(TimeStampedModel):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('dispensed', 'Dispensed'),
        ('partial', 'Partial'),
        ('rejected', 'Rejected'),
    ]
    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE,
                                related_name='prescriptions')
    doctor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                related_name='prescriptions')
    prescription_id = models.CharField(max_length=20, unique=True, editable=False)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    notes = models.TextField(blank=True)
    dispensed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                     null=True, blank=True,
                                     related_name='dispensed_prescriptions')

    class Meta:
        db_table = 'prescriptions'
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        if not self.prescription_id:
            from django.utils import timezone
            year = timezone.now().year
            count = Prescription.objects.filter(created_at__year=year).count() + 1
            self.prescription_id = f"RX-{year}-{str(count).zfill(5)}"
        super().save(*args, **kwargs)

    def __str__(self):
        return self.prescription_id


class PrescriptionItem(TimeStampedModel):
    DISPENSE_SOURCE = [
        ('pharmacy', 'In-house pharmacy'),
        ('external', 'Patient buys outside'),
    ]
    prescription = models.ForeignKey(Prescription, on_delete=models.CASCADE, related_name='items')
    drug = models.ForeignKey(Drug, on_delete=models.SET_NULL, null=True, blank=True)
    drug_name_free = models.CharField(max_length=200, blank=True)   # free-typed drug (not in registry)
    dose = models.CharField(max_length=100)
    frequency = models.CharField(max_length=50)
    duration_days = models.PositiveIntegerField(default=7)
    instructions = models.CharField(max_length=255, blank=True)
    dispense_source = models.CharField(max_length=10, choices=DISPENSE_SOURCE, default='pharmacy')
    quantity_prescribed = models.PositiveIntegerField(default=0)
    quantity_dispensed = models.PositiveIntegerField(default=0)
    is_dispensed = models.BooleanField(default=False)

    @property
    def display_name(self):
        return self.drug.name if self.drug_id else self.drug_name_free

    class Meta:
        db_table = 'prescription_items'


class StockAlert(TimeStampedModel):
    ALERT_TYPES = [
        ('low_stock', 'Low Stock'),
        ('expired', 'Expired'),
        ('expiring_soon', 'Expiring Soon'),
    ]
    drug = models.ForeignKey(Drug, on_delete=models.CASCADE)
    alert_type = models.CharField(max_length=20, choices=ALERT_TYPES)
    message = models.CharField(max_length=255)
    is_read = models.BooleanField(default=False)

    class Meta:
        db_table = 'stock_alerts'
        ordering = ['-created_at']