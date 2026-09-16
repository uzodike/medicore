from django.db import models
from django.conf import settings
from core.models import TimeStampedModel


class Notification(TimeStampedModel):
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                  related_name='notifications')
    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE,
                                null=True, blank=True, related_name='notifications')
    title = models.CharField(max_length=200)
    message = models.TextField(blank=True)
    category = models.CharField(max_length=30, blank=True)   # lab / pharmacy / admission / billing …
    link = models.CharField(max_length=200, blank=True)
    is_read = models.BooleanField(default=False)

    class Meta:
        db_table = 'notifications'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.recipient} — {self.title}"
