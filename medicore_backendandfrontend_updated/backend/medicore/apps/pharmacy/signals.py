from django.db.models.signals import pre_save
from django.dispatch import receiver
from django.core.mail import send_mail
from .models import Drug, StockAlert
from datetime import date, timedelta

@receiver(pre_save, sender=Drug)
def check_stock_and_expiry(sender, instance, **kwargs):
    if instance.pk:  # update only
        old = Drug.objects.get(pk=instance.pk)
        # Low stock detection
        if old.current_stock > old.reorder_level and instance.current_stock <= instance.reorder_level:
            msg = f"{instance.name} is low on stock ({instance.current_stock} left)"
            StockAlert.objects.create(drug=instance, alert_type='low_stock', message=msg)
            send_mail('Low Stock Alert', msg, 'pharmacy@example.com', ['manager@example.com'])
        # Expiry alerts
        if instance.expiry_date:
            days_left = (instance.expiry_date - date.today()).days
            if 0 < days_left <= 30:
                msg = f"{instance.name} expires in {days_left} days"
                StockAlert.objects.get_or_create(drug=instance, alert_type='expiring_soon', message=msg)
            elif days_left <= 0:
                msg = f"{instance.name} has expired!"
                StockAlert.objects.get_or_create(drug=instance, alert_type='expired', message=msg)