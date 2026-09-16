from django.core.management.base import BaseCommand
from django.core.mail import send_mail
from pharmacy.models import Drug

class Command(BaseCommand):
    help = 'Send low-stock reorder suggestions'

    def handle(self, *args, **options):
        low_drugs = Drug.objects.filter(is_deleted=False, current_stock__lte=models.F('reorder_level'))
        if low_drugs.exists():
            lines = "\n".join(f"- {d.name} (stock: {d.current_stock})" for d in low_drugs)
            send_mail('Reorder Suggested', f'The following drugs need restocking:\n{lines}', 
                      'pharmacy@example.com', ['manager@example.com'])