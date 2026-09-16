from django.db import models
from core.models import TimeStampedModel
from django.conf import settings
from django.utils import timezone

class Ward(TimeStampedModel):
    name = models.CharField(max_length=100)
    ward_type = models.CharField(max_length=50)
    total_beds = models.PositiveIntegerField(default=30)

    class Meta:
        db_table = 'wards'

    def __str__(self):
        return self.name


class Bed(TimeStampedModel):
    STATUS_CHOICES = [
        ('available', 'Available'),
        ('occupied', 'Occupied'),
        ('reserved', 'Reserved'),
        ('maintenance', 'Maintenance'),
    ]
    ward = models.ForeignKey(Ward, on_delete=models.CASCADE, related_name='beds')
    bed_number = models.CharField(max_length=10)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='available')
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0)  # daily bed-day rate

    class Meta:
        db_table = 'beds'
        unique_together = ['ward', 'bed_number']

    def __str__(self):
        return f"{self.ward.name} / {self.bed_number}"


class Admission(TimeStampedModel):
    STATUS_CHOICES = [
        ('requested', 'Requested'),           # ← new: doctor's request
        ('active', 'Active'),
        ('discharged', 'Discharged'),
        ('transferred', 'Transferred'),
        ('cancelled', 'Cancelled'),
    ]
    ADMISSION_TYPE_CHOICES = [
        ('emergency', 'Emergency'),
        ('elective', 'Elective'),
        ('transfer', 'Transfer'),
    ]

    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='admissions')
    bed = models.ForeignKey(Bed, on_delete=models.SET_NULL, null=True, blank=True, related_name='admissions')
    doctor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='admissions')
    admission_type = models.CharField(max_length=12, choices=ADMISSION_TYPE_CHOICES)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='requested')  # start as request
    requested_ward_type = models.CharField(max_length=50, blank=True)  # doctor can specify
    admitting_diagnosis = models.TextField()
    admitted_at = models.DateTimeField(auto_now_add=True)
    discharge_summary = models.TextField(blank=True)
    admitted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                    null=True, related_name='processed_admissions')

    class Meta:
        db_table = 'admissions'
        ordering = ['-admitted_at']
        db_table = 'admissions'
        ordering = ['-admitted_at']

    def __str__(self):
        return f"{self.patient} → {self.bed or 'No bed'} ({self.status})"


class RoomRecord(TimeStampedModel):
    """Nurse's shift record for an occupied admission"""
    admission = models.ForeignKey(Admission, on_delete=models.CASCADE, related_name='records')
    nurse = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    shift = models.CharField(max_length=10, choices=[
        ('morning', 'Morning'), ('afternoon', 'Afternoon'), ('night', 'Night')
    ])
    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'ipd_room_records'

    def __str__(self):
        return f"{self.admission} – {self.shift} ({self.nurse})"


class RoomMedication(TimeStampedModel):
    record = models.ForeignKey(RoomRecord, on_delete=models.CASCADE, related_name='medications')
    drug = models.ForeignKey('pharmacy.Drug', on_delete=models.CASCADE)
    quantity = models.PositiveIntegerField()
    administered_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'ipd_room_medications'