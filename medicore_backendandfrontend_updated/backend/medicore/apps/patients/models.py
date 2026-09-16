from django.db import models
from core.models import TimeStampedModel
from django.conf import settings

class Patient(TimeStampedModel):
    GENDER_CHOICES = [('M','Male'),('F','Female'),('O','Other')]
    BLOOD_GROUP_CHOICES = [
        ('A+','A+'),('A-','A-'),('B+','B+'),('B-','B-'),
        ('O+','O+'),('O-','O-'),('AB+','AB+'),('AB-','AB-'),
    ]
    GENOTYPE_CHOICES = [('AA','AA'),('AS','AS'),('SS','SS'),('AC','AC')]
    INSURANCE_CHOICES = [
        ('none','None / Self-Pay'),('nhis','NHIS'),('axa','AXA Mansard'),
        ('hygeia','Hygeia HMO'),('aiico','AIICO'),('other','Other'),
    ]

    patient_id = models.CharField(max_length=20, unique=True, editable=False)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    date_of_birth = models.DateField()
    gender = models.CharField(max_length=1, choices=GENDER_CHOICES)
    phone = models.CharField(max_length=20)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)

    blood_group = models.CharField(max_length=3, choices=BLOOD_GROUP_CHOICES, blank=True)
    genotype = models.CharField(max_length=2, choices=GENOTYPE_CHOICES, blank=True)
    allergies = models.TextField(blank=True, help_text="Comma-separated list of known allergies")

    insurance_provider = models.CharField(max_length=20, choices=INSURANCE_CHOICES, default='none')
    insurance_id = models.CharField(max_length=50, blank=True)
    hmo_plan = models.CharField(max_length=50, blank=True)

    # Emergency contact
    emergency_name = models.CharField(max_length=150, blank=True)
    emergency_relationship = models.CharField(max_length=50, blank=True)
    emergency_phone = models.CharField(max_length=20, blank=True)

    photo = models.ImageField(upload_to='patients/', null=True, blank=True)
    registered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name='registered_patients'
    )

    class Meta:
        db_table = 'patients'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.patient_id} — {self.first_name} {self.last_name}"

    def get_full_name(self):
        return f"{self.first_name} {self.last_name}"

    @property
    def age(self):
        from django.utils import timezone
        today = timezone.now().date()
        dob = self.date_of_birth
        return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


class MedicalHistory(TimeStampedModel):
    patient = models.OneToOneField(Patient, on_delete=models.CASCADE, related_name='medical_history')
    chronic_conditions = models.TextField(blank=True)
    past_surgeries = models.TextField(blank=True)
    family_history = models.TextField(blank=True)
    current_medications = models.TextField(blank=True)
    vaccination_history = models.TextField(blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'medical_histories'
        verbose_name_plural = 'Medical Histories'
