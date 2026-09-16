# ══════════════════════════════════════════════════════════════════
# This REPLACES the full content of apps/ai_screening/models.py.
# Both classes are here together this time — nothing left to assemble.
# ══════════════════════════════════════════════════════════════════
from django.db import models
from django.conf import settings
from core.models import TimeStampedModel


class AIScreen(TimeStampedModel):
    """
    One AI-assisted image screen, for ANY registry.py test_type —
    malaria, sickle_cell, tb_smear, microfilariae, and whatever gets
    added later. AI fields are ALWAYS advisory, never written to the
    patient's official lab result. A lab scientist must explicitly
    confirm before this counts as anything clinical.
    """
    STATUS_CHOICES = [
        ('awaiting_image', 'Awaiting image upload'),   # auto-created when order is placed
        ('pending', 'Awaiting confirmation'),
        ('confirmed_positive', 'Confirmed: Positive'),
        ('confirmed_negative', 'Confirmed: Negative'),
        ('overridden', 'Overridden by scientist'),
        ('inconclusive', 'Inconclusive'),
    ]

    test_type = models.CharField(max_length=40)   # matches a key in ai-services/registry.py

    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE,
                                related_name='ai_screens')
    order_item = models.ForeignKey('lab.LabOrderItem', on_delete=models.SET_NULL,
                                   null=True, blank=True, related_name='ai_screens')
    image = models.ImageField(upload_to='ai_screens/%Y/%m/', null=True, blank=True)

    # ── AI suggestion — advisory only ──
    ai_label = models.CharField(max_length=40, blank=True)
    ai_confidence = models.FloatField(null=True, blank=True)
    ai_model_version = models.CharField(max_length=100, blank=True)
    ai_raw_response = models.JSONField(null=True, blank=True)

    # ── Human sign-off — this is what actually counts clinically ──
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='awaiting_image')
    confirmed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                     null=True, blank=True, related_name='ai_screen_confirmations')
    confirmed_at = models.DateTimeField(null=True, blank=True)
    scientist_notes = models.TextField(blank=True)

    class Meta:
        db_table = 'ai_screens'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.test_type} screen — {self.patient} ({self.status})"

    @property
    def ai_and_human_agree(self):
        """True/False/None — did the scientist's confirmation match the AI suggestion?"""
        if self.status not in ('confirmed_positive', 'confirmed_negative') or not self.ai_label:
            return None
        from ai_services.registry import get_config
        try:
            config = get_config(self.test_type)
        except KeyError:
            return None
        ai_says_positive = self.ai_label != config.classes[0]   # classes[0] = negative/background
        human_says_positive = self.status == 'confirmed_positive'
        return human_says_positive == ai_says_positive


class AIScreenBox(models.Model):
    """
    One bounding box on a detect-kind AIScreen (tb_smear, microfilariae).
    Without this, there's nothing valid to retrain a detector on — a
    whole-image 'positive/negative' confirm tells you THAT something
    was there, not WHERE.

    source='ai'    — the model's own proposal, created automatically
                      when upload_screen_image gets a detect response back.
    source='human' — added by the reviewer for something the AI missed.

    A box only counts as usable training data once confirmed=True and
    rejected=False — a human actually looked at it and agreed it's real.
    """
    SOURCE_CHOICES = [('ai', 'AI proposed'), ('human', 'Human added')]

    screen = models.ForeignKey(AIScreen, on_delete=models.CASCADE, related_name='boxes')
    x1 = models.FloatField()
    y1 = models.FloatField()
    x2 = models.FloatField()
    y2 = models.FloatField()
    predicted_class = models.CharField(max_length=40)   # e.g. 'bacillus', 'microfilaria'
    source = models.CharField(max_length=10, choices=SOURCE_CHOICES)
    ai_confidence = models.FloatField(null=True, blank=True)   # only meaningful if source='ai'
    confirmed = models.BooleanField(default=False)
    rejected = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'ai_screen_boxes'

    def __str__(self):
        state = 'rejected' if self.rejected else ('confirmed' if self.confirmed else 'unreviewed')
        return f'{self.predicted_class} ({self.source}, {state}) on screen {self.screen_id}'