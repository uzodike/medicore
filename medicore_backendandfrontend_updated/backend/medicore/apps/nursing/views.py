from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from .models import VitalRecord, MedicationAdministration
from .serializers import VitalRecordSerializer, MARSerializer
from core.permissions import IsDoctorOrNurse

class VitalRecordListCreateView(generics.ListCreateAPIView):
    serializer_class = VitalRecordSerializer
    permission_classes = [IsDoctorOrNurse]
    filterset_fields = ['patient']
    ordering_fields = ['created_at']

    def get_queryset(self):
        return VitalRecord.objects.filter(is_deleted=False).select_related('patient')

    def perform_create(self, serializer):
        vital = serializer.save(recorded_by=self.request.user)
        # Auto-triage today's open appointments from these vitals
        try:
            from django.utils import timezone as _tz
            from apps.appointments.models import Appointment
            level = compute_triage(vital)
            Appointment.objects.filter(
                patient=vital.patient,
                scheduled_at__date=_tz.localdate(),
                is_deleted=False,
            ).exclude(status__in=['completed', 'cancelled', 'no_show']).update(triage=level)
        except Exception:
            pass

class MARListCreateView(generics.ListCreateAPIView):
    serializer_class = MARSerializer
    permission_classes = [IsDoctorOrNurse]
    filterset_fields = ['patient','status']

    def get_queryset(self):
        return MedicationAdministration.objects.filter(is_deleted=False)

    def perform_create(self, serializer):
        serializer.save(administered_by=self.request.user)


def compute_triage(v):
    """Derive triage colour from a VitalRecord. Red > Yellow > Green."""
    def n(x):
        try: return float(x)
        except (TypeError, ValueError): return None
    sbp, hr, temp, rr, spo2, pain = (n(v.systolic_bp), n(v.heart_rate), n(v.temperature),
                                     n(v.respiratory_rate), n(v.spo2), n(v.pain_score))
    red = ((spo2 is not None and spo2 < 90) or
           (sbp is not None and (sbp < 90 or sbp >= 180)) or
           (hr is not None and (hr > 130 or hr < 40)) or
           (temp is not None and temp >= 39.5) or
           (rr is not None and (rr >= 30 or rr < 8)))
    if red:
        return 'red'
    yellow = ((spo2 is not None and spo2 < 94) or
              (sbp is not None and (90 <= sbp < 100 or 160 <= sbp < 180)) or
              (hr is not None and (110 < hr <= 130 or 40 <= hr < 50)) or
              (temp is not None and 38.0 <= temp < 39.5) or
              (rr is not None and 25 <= rr < 30) or
              (pain is not None and pain >= 8))
    return 'yellow' if yellow else 'green'
