# appointments/models.py
from django.db import models
from django.conf import settings
from core.models import TimeStampedModel


# ── Your existing Appointment model — UNCHANGED ───────────────────────────────
class Appointment(TimeStampedModel):
    STATUS_CHOICES = [
        ('scheduled',   'Scheduled'),
        ('confirmed',   'Confirmed'),
        ('in_progress', 'In Progress'),
        ('completed',   'Completed'),
        ('cancelled',   'Cancelled'),
        ('no_show',     'No Show'),
    ]
    TYPE_CHOICES = [
        ('opd',          'OPD'),
        ('telemedicine', 'Telemedicine'),
        ('follow_up',    'Follow-Up'),
    ]
    TRIAGE_CHOICES = [
        ('green',  'Green'),
        ('yellow', 'Yellow'),
        ('red',    'Red'),
    ]

    patient          = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='appointments')
    doctor           = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                          null=True, blank=True, related_name='doctor_appointments')
    scheduled_at     = models.DateTimeField()
    duration_minutes = models.PositiveIntegerField(default=30)
    appointment_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='opd')
    status           = models.CharField(max_length=20, choices=STATUS_CHOICES, default='scheduled')
    triage           = models.CharField(max_length=10, choices=TRIAGE_CHOICES, default='green')
    chief_complaint  = models.TextField(blank=True)
    notes            = models.TextField(blank=True)
    booked_by        = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                          null=True, related_name='booked_appointments')

    class Meta:
        db_table = 'appointments'
        ordering = ['scheduled_at']

    def __str__(self):
        return f"{self.patient} → Dr. {self.doctor.get_full_name() if self.doctor else 'Unassigned'} @ {self.scheduled_at}"


# ── New: ClinicalNote (SOAP) ──────────────────────────────────────────────────
class ClinicalNote(TimeStampedModel):
    patient     = models.ForeignKey('patients.Patient', on_delete=models.CASCADE,
                                     related_name='clinical_notes')
    appointment = models.ForeignKey(Appointment, on_delete=models.SET_NULL,
                                     null=True, blank=True, related_name='clinical_notes')
    doctor      = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                     null=True, blank=True, related_name='clinical_notes')
    subjective  = models.TextField(blank=True)   # S — patient's own words
    objective   = models.TextField(blank=True)   # O — examination findings
    assessment  = models.TextField(blank=True)   # A — diagnosis / ICD codes
    plan        = models.TextField(blank=True)   # P — management plan

    class Meta:
        db_table = 'clinical_notes'
        ordering = ['-created_at']

    def __str__(self):
        return f"Note — {self.patient} by {self.doctor} on {self.created_at:%Y-%m-%d}"