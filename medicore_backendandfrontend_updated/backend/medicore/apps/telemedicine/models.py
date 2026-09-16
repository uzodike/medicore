from django.db import models
from core.models import TimeStampedModel
from django.conf import settings
import uuid
import secrets

class TeleSession(TimeStampedModel):
    STATUS_CHOICES = [
        ('scheduled','Scheduled'),('waiting','Waiting Room'),
        ('live','Live'),('ended','Ended'),('cancelled','Cancelled'),
    ]
    CONSULT_TYPE_CHOICES = [
        ('video','Video Call'),('voice','Voice Call'),('async','Async / Chat'),
    ]
    NOTIFY_CHOICES = [
        ('sms_email','SMS + Email'),('sms','SMS'),
        ('email','Email'),('whatsapp','WhatsApp'),
    ]

    session_id = models.CharField(max_length=20, unique=True, editable=False)
    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='tele_sessions')
    doctor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                related_name='tele_sessions', limit_choices_to={'role': 'doctor'})
    scheduled_at = models.DateTimeField()
    consult_type = models.CharField(max_length=10, choices=CONSULT_TYPE_CHOICES, default='video')
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default='scheduled')
    chief_complaint = models.TextField(blank=True)
    notify_via = models.CharField(max_length=15, choices=NOTIFY_CHOICES, default='sms_email')

    # Session lifecycle
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    room_name = models.CharField(max_length=100, blank=True)  # WebRTC room

    # ✅ ONLY THIS: Join token for email link
    join_token = models.CharField(max_length=64, unique=True, editable=False, blank=True)
    email_sent_at = models.DateTimeField(null=True, blank=True)

    # Clinical output
    clinical_notes = models.TextField(blank=True)
    outcome = models.CharField(max_length=100, blank=True)
    is_recorded = models.BooleanField(default=False)
    recording_url = models.URLField(blank=True)
    booked_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                   null=True, related_name='booked_sessions')
    appointment = models.OneToOneField('appointments.Appointment', on_delete=models.CASCADE,
                                       null=True, blank=True, related_name='tele_session')

    class Meta:
        db_table = 'tele_sessions'
        ordering = ['scheduled_at']

    def __str__(self):
        doc = self.doctor.get_full_name() if self.doctor else 'Unassigned'
        return f"{self.session_id} — {self.patient} with Dr. {doc}"

    @property
    def duration_minutes(self):
        if self.started_at and self.ended_at:
            return int((self.ended_at - self.started_at).total_seconds() / 60)
        return None

    @property
    def join_url(self):
        from django.conf import settings
        base = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
        return f"{base}/telemedicine/join/{self.join_token}"

    def save(self, *args, **kwargs):
        if not self.session_id:
            from django.utils import timezone
            year = timezone.now().year
            count = TeleSession.objects.filter(created_at__year=year).count() + 1
            self.session_id = f"TS-{year}-{str(count).zfill(5)}"
        if not self.room_name:
            self.room_name = f"room-{uuid.uuid4().hex[:12]}"
        if not self.join_token:
            self.join_token = secrets.token_urlsafe(48)
        super().save(*args, **kwargs)
        


class SessionMessage(TimeStampedModel):
    """In-session chat messages."""
    session = models.ForeignKey(TeleSession, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True)
    sender_label = models.CharField(max_length=20, choices=[('doctor','Doctor'),('patient','Patient')])
    message = models.TextField()

    class Meta:
        db_table = 'session_messages'
        ordering = ['created_at']


class EPrescription(TimeStampedModel):
    """E-prescriptions issued during or after a tele session."""
    STATUS_CHOICES = [('sent','Sent'),('viewed','Viewed'),('dispensed','Dispensed')]

    session = models.ForeignKey(TeleSession, on_delete=models.CASCADE,
                                 related_name='eprescriptions', null=True, blank=True)
    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE,
                                 related_name='eprescriptions')
    doctor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                related_name='eprescriptions')
    drugs = models.JSONField(default=list, help_text='[{name, dose, frequency, duration}]')
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default='sent')
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'eprescriptions'
