import uuid
from django.utils import timezone

def generate_patient_id():
    """Generate unique patient ID like PT-2024-000001."""
    from apps.patients.models import Patient
    year = timezone.now().year
    count = Patient.objects.filter(created_at__year=year).count() + 1
    return f"PT-{year}-{str(count).zfill(6)}"

def generate_invoice_number():
    from apps.billing.models import Invoice
    year = timezone.now().year
    count = Invoice.objects.filter(created_at__year=year).count() + 1
    return f"INV-{year}-{str(count).zfill(6)}"

def generate_lab_order_number():
    from apps.lab.models import LabOrder
    year = timezone.now().year
    count = LabOrder.objects.filter(created_at__year=year).count() + 1
    return f"LAB-{year}-{str(count).zfill(6)}"
