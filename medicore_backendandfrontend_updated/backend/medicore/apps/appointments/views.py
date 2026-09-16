# appointments/views.py
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.utils import timezone
from django.db.models import Q

from .models import Appointment, ClinicalNote
from .serializers import (
    AppointmentSerializer, AppointmentWriteSerializer,
    ClinicalNoteSerializer, ClinicalNoteWriteSerializer,
)

def _ensure_tele_session(appt, request):
    """
    Create a linked TeleSession the first time an appointment is (or becomes)
    a telemedicine appointment. Idempotent — never creates a second one.
    """
    if appt.appointment_type != 'telemedicine':
        return
    try:
        existing = appt.tele_session
    except Exception:
        existing = None
    if existing:
        ts = existing
        changed = False
        if ts.scheduled_at != appt.scheduled_at:
            ts.scheduled_at = appt.scheduled_at; changed = True
        if appt.doctor_id and ts.doctor_id != appt.doctor_id:
            ts.doctor = appt.doctor; changed = True
        if changed:
            ts.save()
        return
    from apps.telemedicine.models import TeleSession
    consult_type = (request.data.get('consult_type') or 'video') if request else 'video'
    if consult_type not in ('video', 'voice', 'async'):
        consult_type = 'video'
    TeleSession.objects.create(
        appointment=appt,
        patient=appt.patient,
        doctor=appt.doctor,
        scheduled_at=appt.scheduled_at,
        chief_complaint=appt.chief_complaint or '',
        consult_type=consult_type,
        booked_by=getattr(request, 'user', None) if request else None,
    )

# ── Your existing views — UNCHANGED ──────────────────────────────────────────

class AppointmentListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    filterset_fields   = ['status', 'triage', 'appointment_type', 'doctor']
    search_fields      = ['patient__first_name', 'patient__last_name', 'patient__patient_id']
    ordering_fields    = ['scheduled_at', 'created_at']

    def get_queryset(self):
        qs = Appointment.objects.filter(is_deleted=False).select_related('patient', 'doctor')
        if self.request.user.role == 'doctor':
            qs = qs.filter(doctor=self.request.user)
        return qs

    def get_serializer_class(self):
        return AppointmentWriteSerializer if self.request.method == 'POST' else AppointmentSerializer

    def perform_create(self, serializer):
        serializer.save(booked_by=self.request.user)

    def perform_update(self, serializer):
        appt = serializer.save()
        _ensure_tele_session(appt, self.request)

    def perform_destroy(self, instance):
        instance.soft_delete()


class AppointmentDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Appointment.objects.filter(is_deleted=False)

    def get_serializer_class(self):
        return AppointmentWriteSerializer if self.request.method in ('PUT', 'PATCH') else AppointmentSerializer

    def perform_destroy(self, instance):
        instance.soft_delete()


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def today_appointments(request):
    today = timezone.now().date()
    qs = Appointment.objects.filter(
        scheduled_at__date=today, is_deleted=False
    ).select_related('patient', 'doctor')
    if request.user.role == 'doctor':
        qs = qs.filter(doctor=request.user)
    serializer = AppointmentSerializer(qs, many=True)
    return Response({'count': qs.count(), 'appointments': serializer.data})


# ── New: Doctor workbench endpoints ──────────────────────────────────────────

TRIAGE_ORDER = {'red': 0, 'yellow': 1, 'green': 2}


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def todays_queue(request):
    """
    Sorted queue for the doctor workbench.
    Uses your existing field names: scheduled_at, triage, chief_complaint, status.
    Excludes completed / cancelled.
    """
    today = timezone.now().date()
    qs = Appointment.objects.filter(
        scheduled_at__date=today,
        is_deleted=False,
    ).exclude(
        status__in=['completed', 'cancelled', 'no_show']
    ).select_related('patient', 'doctor')

    # Doctors only see their own; admins/nurses see all
    if hasattr(request.user, 'role') and request.user.role == 'doctor':
        qs = qs.filter(doctor=request.user)

    # Optional ?doctor_id= override for admin viewing a specific doctor's queue
    doctor_id = request.query_params.get('doctor_id')
    if doctor_id:
        qs = qs.filter(doctor_id=doctor_id)

    # Optional search
    search = request.query_params.get('search')
    if search:
        qs = qs.filter(
            Q(patient__first_name__icontains=search) |
            Q(patient__last_name__icontains=search)  |
            Q(patient__patient_id__icontains=search)
        )

    data = AppointmentSerializer(qs, many=True, context={'request': request}).data
    # Sort by triage severity in Python (avoids a CASE WHEN migration)
    data = sorted(data, key=lambda x: (TRIAGE_ORDER.get(x.get('triage', 'green'), 9), x.get('scheduled_at') or ''))
    return Response(data)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def update_appointment_status(request, pk):
    """Quick status update used by the workbench status buttons."""
    try:
        appt = Appointment.objects.get(pk=pk, is_deleted=False)
    except Appointment.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)

    new_status = request.data.get('status')
    valid = dict(Appointment.STATUS_CHOICES)
    if new_status not in valid:
        return Response({'detail': f'Invalid status. Choices: {list(valid)}'}, status=400)

    appt.status = new_status
    appt.save(update_fields=['status'])
    return Response(AppointmentSerializer(appt, context={'request': request}).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def doctor_dashboard(request):
    """Stat counts for the workbench header bar."""
    today  = timezone.now().date()
    doctor = request.user
    appts  = Appointment.objects.filter(
        doctor=doctor, scheduled_at__date=today, is_deleted=False
    )
    return Response({
        'total_today': appts.count(),
        'waiting':     appts.filter(status__in=['scheduled', 'confirmed']).count(),
        'consulting':  appts.filter(status='in_progress').count(),
        'completed':   appts.filter(status='completed').count(),
        'notes_today': ClinicalNote.objects.filter(
            doctor=doctor, created_at__date=today
        ).count(),
    })


def _safe_serialize(import_path, serializer_path, queryset_fn, many=True):
    """
    Import model + serializer by dotted path. Returns [] on any ImportError
    so one missing name never crashes the whole consultation endpoint.
    """
    try:
        mod_path, model_name = import_path.rsplit('.', 1)
        ser_path,  ser_name  = serializer_path.rsplit('.', 1)
        import importlib
        model      = getattr(importlib.import_module(mod_path), model_name)
        serializer = getattr(importlib.import_module(ser_path), ser_name)
        qs = queryset_fn(model)
        return serializer(qs, many=many).data
    except Exception:
        return []


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def patient_consultation_summary(request, patient_id):
    """
    Everything the workbench needs for one patient in a single API call.
    Each section is wrapped defensively — a wrong model/serializer name
    returns [] for that section instead of crashing the whole response.
    """
    from apps.patients.models import Patient
    from apps.patients.serializers import PatientListSerializer

    try:
        patient = Patient.objects.get(pk=patient_id, is_deleted=False)
    except Patient.DoesNotExist:
        return Response({'detail': 'Patient not found.'}, status=404)

    pid = patient.pk

    return Response({
        'patient': PatientListSerializer(patient).data,

        # ── Vitals ────────────────────────────────────────────────────────────
        'vitals': _safe_serialize(
            'apps.nursing.models.VitalRecord',
            'apps.nursing.serializers.VitalRecordSerializer',
            lambda m: m.objects.filter(patient_id=pid).order_by('-created_at')[:5],
        ),

        # ── SOAP notes ────────────────────────────────────────────────────────
        'notes': ClinicalNoteSerializer(
            ClinicalNote.objects.filter(patient_id=pid).order_by('-created_at')[:10],
            many=True
        ).data,

        # ── Prescriptions ─────────────────────────────────────────────────────
        'prescriptions': _safe_serialize(
            'apps.pharmacy.models.Prescription',
            'apps.pharmacy.serializers.PrescriptionSerializer',
            lambda m: m.objects.filter(patient_id=pid, is_deleted=False)
                       .prefetch_related('items').order_by('-created_at')[:10],
        ),

        # ── Lab orders ────────────────────────────────────────────────────────
        'lab_orders': _safe_serialize(
            'apps.lab.models.LabOrder',
            'apps.lab.serializers.LabOrderSerializer',
            lambda m: m.objects.filter(patient_id=pid, is_deleted=False)
                       .order_by('-created_at')[:10],
        ),

        # ── Admissions ────────────────────────────────────────────────────────
        'admissions': _safe_serialize(
            'apps.ipd.models.Admission',
            'apps.ipd.serializers.AdmissionSerializer',
            lambda m: m.objects.filter(patient_id=pid).order_by('-created_at')[:5],
        ),

        # ── Appointment history ───────────────────────────────────────────────
        'appointments': AppointmentSerializer(
            Appointment.objects.filter(
                patient_id=pid, is_deleted=False
            ).order_by('-scheduled_at')[:10],
            many=True
        ).data,
    })


# ── Clinical Notes CRUD ───────────────────────────────────────────────────────

class ClinicalNoteListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    filterset_fields   = ['patient', 'appointment']
    search_fields      = ['patient__first_name', 'patient__last_name', 'assessment']

    def get_queryset(self):
        qs = ClinicalNote.objects.select_related('patient', 'appointment', 'doctor')
        patient_id = self.request.query_params.get('patient_id')
        if patient_id:
            qs = qs.filter(patient_id=patient_id)
        return qs.order_by('-created_at')

    def get_serializer_class(self):
        return ClinicalNoteWriteSerializer if self.request.method == 'POST' else ClinicalNoteSerializer

    def perform_create(self, serializer):
        serializer.save(doctor=self.request.user)


class ClinicalNoteDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated]
    queryset = ClinicalNote.objects.all()

    def get_serializer_class(self):
        return ClinicalNoteWriteSerializer if self.request.method in ('PUT', 'PATCH') else ClinicalNoteSerializer