from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Patient, MedicalHistory

@receiver(post_save, sender=Patient)
def create_medical_history(sender, instance, created, **kwargs):
    if created:
        MedicalHistory.objects.get_or_create(patient=instance)
