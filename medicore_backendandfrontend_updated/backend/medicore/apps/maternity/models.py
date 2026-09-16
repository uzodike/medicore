from datetime import timedelta
from django.db import models
from django.conf import settings
from django.utils import timezone
from core.models import TimeStampedModel


class ANCEnrollment(TimeStampedModel):
    """A pregnancy under antenatal care (one row per pregnancy)."""
    RISK_CHOICES = [('low', 'Low risk'), ('high', 'High risk')]
    STATUS_CHOICES = [('active', 'Active'), ('delivered', 'Delivered'), ('closed', 'Closed')]

    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='anc_enrollments')
    doctor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                               related_name='anc_patients')
    booking_date = models.DateField(default=timezone.localdate)
    lmp = models.DateField(help_text='Last menstrual period')
    gravida = models.PositiveIntegerField(default=1)
    para = models.PositiveIntegerField(default=0)
    risk_level = models.CharField(max_length=5, choices=RISK_CHOICES, default='low')
    risk_factors = models.TextField(blank=True)
    tt_doses = models.PositiveIntegerField(default=0)   # tetanus toxoid doses given
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='active')
    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'anc_enrollments'
        ordering = ['-created_at']

    def __str__(self):
        return f"ANC — {self.patient} ({self.status})"

    @property
    def edd(self):
        """Expected date of delivery: LMP + 280 days (Naegele)."""
        return self.lmp + timedelta(days=280) if self.lmp else None

    @property
    def gestational_age_weeks(self):
        if not self.lmp:
            return None
        days = (timezone.localdate() - self.lmp).days
        return round(days / 7, 1) if days >= 0 else None


class ANCVisit(TimeStampedModel):
    """A single antenatal clinic visit."""
    URINE_CHOICES = [('', '—'), ('neg', 'Negative'), ('trace', 'Trace'),
                     ('1+', '1+'), ('2+', '2+'), ('3+', '3+')]

    enrollment = models.ForeignKey(ANCEnrollment, on_delete=models.CASCADE, related_name='visits')
    visit_date = models.DateField(default=timezone.localdate)
    weight_kg = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    systolic_bp = models.PositiveIntegerField(null=True, blank=True)
    diastolic_bp = models.PositiveIntegerField(null=True, blank=True)
    fundal_height_cm = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    fetal_heart_rate = models.PositiveIntegerField(null=True, blank=True)
    urine_protein = models.CharField(max_length=6, choices=URINE_CHOICES, blank=True)
    complaints = models.TextField(blank=True)
    plan = models.TextField(blank=True)
    next_visit_date = models.DateField(null=True, blank=True)
    seen_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
                                related_name='anc_visits_seen')

    class Meta:
        db_table = 'anc_visits'
        ordering = ['-visit_date', '-created_at']

    @property
    def ga_at_visit_weeks(self):
        if self.enrollment.lmp and self.visit_date:
            days = (self.visit_date - self.enrollment.lmp).days
            return round(days / 7, 1) if days >= 0 else None
        return None


class Delivery(TimeStampedModel):
    """Delivery / birth register entry."""
    MODE_CHOICES = [('svd', 'SVD (vaginal)'), ('cs', 'Caesarean section'),
                    ('assisted', 'Assisted (vacuum/forceps)')]
    OUTCOME_CHOICES = [('live', 'Live birth'), ('stillbirth', 'Stillbirth')]
    SEX_CHOICES = [('male', 'Male'), ('female', 'Female')]

    enrollment = models.ForeignKey(ANCEnrollment, on_delete=models.CASCADE, related_name='deliveries')
    delivery_datetime = models.DateTimeField(default=timezone.now)
    mode = models.CharField(max_length=10, choices=MODE_CHOICES, default='svd')
    outcome = models.CharField(max_length=10, choices=OUTCOME_CHOICES, default='live')
    baby_sex = models.CharField(max_length=6, choices=SEX_CHOICES, blank=True)
    birth_weight_kg = models.DecimalField(max_digits=4, decimal_places=2, null=True, blank=True)
    apgar_1min = models.PositiveIntegerField(null=True, blank=True)
    apgar_5min = models.PositiveIntegerField(null=True, blank=True)
    complications = models.TextField(blank=True)
    conducted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
                                     related_name='deliveries_conducted')

    class Meta:
        db_table = 'deliveries'
        ordering = ['-delivery_datetime']
