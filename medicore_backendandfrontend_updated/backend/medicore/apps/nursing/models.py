from django.db import models
from core.models import TimeStampedModel
from django.conf import settings

class VitalRecord(TimeStampedModel):
    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='vitals')
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    systolic_bp = models.PositiveIntegerField(null=True, blank=True)
    diastolic_bp = models.PositiveIntegerField(null=True, blank=True)
    heart_rate = models.PositiveIntegerField(null=True, blank=True)
    temperature = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    respiratory_rate = models.PositiveIntegerField(null=True, blank=True)
    spo2 = models.PositiveIntegerField(null=True, blank=True)
    weight_kg = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    blood_sugar = models.PositiveIntegerField(null=True, blank=True)
    pain_score = models.PositiveIntegerField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'vital_records'
        ordering = ['-created_at']

class MedicationAdministration(TimeStampedModel):
    STATUS_CHOICES = [('given','Given'),('pending','Pending'),('refused','Refused'),('held','Held')]
    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='mar')
    prescription_item = models.ForeignKey('pharmacy.PrescriptionItem', on_delete=models.CASCADE,
                                           related_name='mar_entries')
    scheduled_at = models.DateTimeField()
    administered_at = models.DateTimeField(null=True, blank=True)
    administered_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'medication_administrations'
        ordering = ['scheduled_at']
