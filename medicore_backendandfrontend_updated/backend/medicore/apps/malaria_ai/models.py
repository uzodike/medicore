# apps/malaria_ai/models.py
#
# GENERALIZED. This app started as malaria-only (hence the folder/app
# name) and is now the single home for AI-assisted microscopy screening
# across every test in ai-services/registry.py — malaria, sickle_cell,
# tb_smear, microfilariae, and whatever gets added later. The app_label
# stays 'malaria_ai' for historical continuity (renaming a live Django
# app label touches migration history + ContentType records — real
# risk for a purely cosmetic gain); everything else here is generic.
#
# apps/ai_screening — a separate, parallel app built earlier while this
# generalization hadn't happened yet — is now abandoned. Don't deploy
# it; delete the folder whenever convenient. This file is the one
# source of truth going forward.
from django.db import models
from django.conf import settings
from core.models import TimeStampedModel


class MalariaScreen(TimeStampedModel):
    """
    One AI-assisted image screen, for ANY test_type in registry.py —
    not just malaria despite the historical class/app name. AI fields
    are ALWAYS advisory, never written to the patient's official lab
    result. A lab scientist must explicitly confirm before this counts
    as anything clinical.
    """
    STATUS_CHOICES = [
        ('pending', 'Awaiting confirmation'),
        ('confirmed_positive', 'Confirmed: Positive'),
        ('confirmed_negative', 'Confirmed: Negative'),
        ('overridden', 'Overridden by scientist'),
        ('inconclusive', 'Inconclusive'),
    ]

    # Every row that predates this field is a malaria screen —
    # default='malaria' backfills existing history with zero data loss.
    test_type = models.CharField(max_length=40, default='malaria')

    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE,
                                related_name='malaria_screens')
    order_item = models.ForeignKey('lab.LabOrderItem', on_delete=models.SET_NULL,
                                   null=True, blank=True, related_name='malaria_screens')
    image = models.ImageField(upload_to='malaria_screens/%Y/%m/')

    # ── AI suggestion — advisory only ──
    ai_label = models.CharField(max_length=40, blank=True)
    ai_confidence = models.FloatField(null=True, blank=True)
    ai_model_version = models.CharField(max_length=100, blank=True)
    ai_raw_response = models.JSONField(null=True, blank=True)

    # ── Human sign-off — this is what actually counts clinically ──
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    confirmed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                     null=True, blank=True, related_name='malaria_confirmations')
    confirmed_at = models.DateTimeField(null=True, blank=True)
    scientist_notes = models.TextField(blank=True)

    class Meta:
        db_table = 'malaria_ai_screens'   # unchanged — no table rename needed
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.test_type} screen — {self.patient} ({self.status})"

    @property
    def ai_and_human_agree(self):
        """True/False/None — did the scientist's confirmation match the AI suggestion?"""
        if self.status not in ('confirmed_positive', 'confirmed_negative') or not self.ai_label:
            return None
        from .registry import get_config
        try:
            config = get_config(self.test_type)
        except KeyError:
            return None
        ai_says_positive = self.ai_label != config.classes[0]   # classes[0] = negative/background
        human_says_positive = self.status == 'confirmed_positive'
        return human_says_positive == ai_says_positive


class MalariaScreenBox(models.Model):
    """
    One bounding box on a detect-kind screen (tb_smear, microfilariae).
    Classify-kind screens (malaria, sickle_cell) never create rows here
    — they go straight to a whole-image positive/negative via ai_label,
    confirmed through confirm_screen() rather than box review.

    A box only counts as usable clinically/for retraining once
    confirmed=True and rejected=False — a human actually looked at it
    and agreed it's real.
    """
    SOURCE_CHOICES = [('ai', 'AI proposed'), ('human', 'Human added')]

    screen = models.ForeignKey(MalariaScreen, on_delete=models.CASCADE, related_name='boxes')
    x1 = models.FloatField()   # pixel coordinates — see ai-services/service.py
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
        db_table = 'malaria_ai_screen_boxes'

    def __str__(self):
        state = 'rejected' if self.rejected else ('confirmed' if self.confirmed else 'unreviewed')
        return f'{self.predicted_class} ({self.source}, {state}) on screen {self.screen_id}'