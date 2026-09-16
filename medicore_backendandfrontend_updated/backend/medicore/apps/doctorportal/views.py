from django.utils import timezone
from django.db.models import Q
from rest_framework import generics
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from apps.appointments.models import ClinicalNote
from apps.patients.models import Patient
from apps.appointments.models import Appointment
from apps.pharmacy.models import Drug, Prescription
from apps.nursing.models import VitalRecord
from .serializers import ( DoctorPrescriptionSerializer,
                           QueueAppointmentSerializer, QueuePatientSerializer)
from apps.appointments.serializers import ClinicalNoteSerializer
from django.db.models import Q, Sum


# ═══════════════════════════════════════════════════════
# QUEUE  — GET /appointments/queue/
# ═══════════════════════════════════════════════════════
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def queue(request):
    """
    Returns today's appointment queue.
    Filters by doctor_id if provided; otherwise returns all waiting.
    """
    from datetime import date
    today = date.today()
    qs = (Appointment.objects
          .filter(
              Q(status__in=['scheduled', 'confirmed', 'in_progress']),
              scheduled_at__date=today,
          )
          .select_related('patient')
          .order_by('triage', 'scheduled_at'))

    doctor_id = request.query_params.get('doctor_id')
    if doctor_id:
        qs = qs.filter(doctor_id=doctor_id)

    serializer = QueueAppointmentSerializer(qs, many=True)
    return Response(serializer.data)


# ═══════════════════════════════════════════════════════
# DASHBOARD  — GET /appointments/doctor-dashboard/
# ═══════════════════════════════════════════════════════
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def doctor_dashboard(request):
    from datetime import date
    today = date.today()
    appts = Appointment.objects.filter(scheduled_at__date=today)
    notes_today = ClinicalNote.objects.filter(
        doctor=request.user, created_at__date=today).count()

    return Response({
        'total_today': appts.count(),
        'waiting':     appts.filter(status__in=['scheduled', 'confirmed']).count(),
        'consulting':  appts.filter(status='in_progress').count(),
        'completed':   appts.filter(status='completed').count(),
        'notes_today': notes_today,
    })


# ═══════════════════════════════════════════════════════
# APPOINTMENT STATUS  — PATCH /appointments/{id}/status/
# ═══════════════════════════════════════════════════════
@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def update_appointment_status(request, pk):
    try:
        appt = Appointment.objects.get(pk=pk)
    except Appointment.DoesNotExist:
        return Response({'detail': 'Not found'}, status=404)
    new_status = request.data.get('status')
    if not new_status:
        return Response({'detail': 'status is required'}, status=400)
    appt.status = new_status
    appt.save(update_fields=['status', 'updated_at'])
    return Response(QueueAppointmentSerializer(appt).data)


# ═══════════════════════════════════════════════════════
# PATIENT CONSULTATION SUMMARY
# GET /appointments/patients/{patient_id}/consultation/
# ═══════════════════════════════════════════════════════
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def patient_consultation(request, patient_id):
    """
    One-call aggregation of everything a doctor needs:
    patient info, vitals, clinical notes, prescriptions, lab orders, admissions.
    """
    try:
        patient = Patient.objects.get(pk=patient_id)
    except Patient.DoesNotExist:
        return Response({'detail': 'Patient not found'}, status=404)

    # ── Vitals (most recent 5) ──────────────────────────
    vitals_qs = VitalRecord.objects.filter(patient=patient).order_by('-created_at')[:5]
    vitals = []
    for v in vitals_qs:
        sys_bp = v.systolic_bp
        dia_bp = v.diastolic_bp
        vitals.append({
            'systolic':    sys_bp,
            'diastolic':   dia_bp,
            'heart_rate':  v.heart_rate,
            'temperature': str(v.temperature) if v.temperature else None,
            'spo2':        v.spo2,
            'weight':      str(v.weight_kg) if v.weight_kg else None,
            'blood_sugar': v.blood_sugar,
            'pain_score':  v.pain_score,
            'notes':       v.notes,
            'recorded_at': v.created_at.isoformat(),
            'bp_status':   ('high' if sys_bp and sys_bp > 140
                            else 'low' if sys_bp and sys_bp < 90
                            else 'normal'),
            'hr_status':   ('high' if v.heart_rate and v.heart_rate > 100
                            else 'low' if v.heart_rate and v.heart_rate < 60
                            else 'normal'),
            'temp_status': ('elevated' if v.temperature and float(v.temperature) > 37.5
                            else 'normal'),
            'spo2_status': ('low' if v.spo2 and v.spo2 < 95 else 'normal'),
            'sugar_status':('high' if v.blood_sugar and v.blood_sugar > 140 else 'normal'),
        })

    # ── Clinical notes ─────────────────────────────────
    notes = ClinicalNote.objects.filter(patient=patient).select_related('doctor').order_by('-created_at')[:10]
    notes_data = [{
        'doctor_name': n.doctor.get_full_name() if n.doctor else 'Unknown',
        'subjective':  n.subjective,
        'objective':   n.objective,
        'assessment':  n.assessment,
        'plan':        n.plan,
        'created_at':  n.created_at.isoformat(),
    } for n in notes]

    # ── Prescriptions ───────────────────────────────────
    rxs = (Prescription.objects.filter(patient=patient)
           .prefetch_related('items__drug')
           .select_related('doctor')
           .order_by('-created_at')[:10])
    rx_data = []
    for rx in rxs:
        rx_data.append({
            'id':              rx.id,
            'prescription_id': rx.prescription_id,
            'doctor_name':     rx.doctor.get_full_name() if rx.doctor else 'Unknown',
            'status':          rx.status,
            'notes':           rx.notes,
            'created_at':      rx.created_at.isoformat(),
            'items': [{
                'drug_name':    item.drug.name if item.drug_id else 'Unknown drug',
                'dose':         item.dose,
                'frequency':    item.frequency,
                'duration_days':item.duration_days,
            } for item in rx.items.all()],
        })

    # ── Lab orders ──────────────────────────────────────
    lab_orders = []
    try:
        from apps.lab.models import LabOrder
        lo_qs = (LabOrder.objects.filter(patient=patient)
                 .prefetch_related('items__test')
                 .order_by('-order_date')[:10])
        for lo in lo_qs:
            lab_orders.append({
                'id':         lo.id,
                'order_num':  lo.order_number,
                'status':     lo.status,
                'created_at': lo.order_date.isoformat(),
                'tests': [{'name': item.test.name} for item in lo.items.all()],
            })
    except Exception:
        pass

    # ── Admissions ──────────────────────────────────────
    admissions = []
    try:
        from apps.ipd.models import Admission
        adm_qs = Admission.objects.filter(patient=patient).select_related('bed').order_by('-admitted_at')[:5]
        for a in adm_qs:
            days = (timezone.now() - a.admitted_at).days if a.status == 'active' else None
            admissions.append({
                'id':           str(a.id),
                'bed_number':   a.bed.bed_number if a.bed else '—',
                'diagnosis':    a.admitting_diagnosis,
                'status':       a.status,
                'admitted_at':  a.admitted_at.isoformat(),
                'days_admitted':days,
            })
    except Exception:
        pass

    return Response({
        'patient':       QueuePatientSerializer(patient).data,
        'vitals':        vitals,
        'notes':         notes_data,
        'prescriptions': rx_data,
        'lab_orders':    lab_orders,
        'admissions':    admissions,
    })


# ═══════════════════════════════════════════════════════
# CLINICAL NOTES CRUD
# GET/POST /appointments/clinical-notes/
# PATCH    /appointments/clinical-notes/{id}/
# ═══════════════════════════════════════════════════════
class ClinicalNoteListCreateView(generics.ListCreateAPIView):
    serializer_class   = ClinicalNoteSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = ClinicalNote.objects.select_related('doctor', 'patient', 'appointment')
        patient_id = self.request.query_params.get('patient')
        appt_id    = self.request.query_params.get('appointment')
        if patient_id: qs = qs.filter(patient_id=patient_id)
        if appt_id:    qs = qs.filter(appointment_id=appt_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(doctor=self.request.user)


class ClinicalNoteDetailView(generics.RetrieveUpdateAPIView):
    serializer_class   = ClinicalNoteSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ClinicalNote.objects.all()

    def perform_update(self, serializer):
        serializer.save(is_signed=True)


# ═══════════════════════════════════════════════════════
# PRESCRIPTION  — POST /appointments/prescriptions/
# ═══════════════════════════════════════════════════════
class PrescriptionCreateView(generics.CreateAPIView):
    serializer_class   = DoctorPrescriptionSerializer
    permission_classes = [IsAuthenticated]


class PrescriptionListView(generics.ListAPIView):
    serializer_class   = DoctorPrescriptionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Prescription.objects.select_related('doctor', 'patient').prefetch_related('items__drug')
        patient_id = self.request.query_params.get('patient')
        if patient_id: qs = qs.filter(patient_id=patient_id)
        return qs.order_by('-created_at')


# ═══════════════════════════════════════════════════════
# DRUG SEARCH  — GET /appointments/drugs/search/?q=...
# ═══════════════════════════════════════════════════════
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def drug_search(request):
    """
    Returns drugs from the pharmacy registry matching a search query.
    Used for drug autocomplete in the prescription writer.
    """
    q = request.query_params.get('q', '').strip()
    if len(q) < 2:
        return Response([])
    drugs = Drug.objects.filter(
        Q(name__icontains=q) | Q(generic_name__icontains=q),
        is_deleted=False,
    ).annotate(stock=Sum('batches__quantity'))[:15]
    result = [{
        'id':            str(d.id),
        'name':          d.name,
        'generic_name':  d.generic_name,
        'strength':      '',          # not tracked on Drug
        'dosage_form':   d.unit,      # closest equivalent on the model
        'unit_price':    float(d.unit_price),
        'stock':         d.stock or 0,
        'requires_prescription': True,
    } for d in drugs]
    return Response(result)

# ═══════════════════════════════════════════════════════════════════
# DOCTOR-RAISED CHARGE (e.g. consultation fee) → billing
# POST /appointments/charges/
# body: { patient, amount, description?, category?, appointment? }
# ═══════════════════════════════════════════════════════════════════
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def raise_charge(request):
    from decimal import Decimal, InvalidOperation
    from django.db.models import Sum as _Sum
    from apps.billing.models import Invoice, InvoiceItem

    patient_id = request.data.get('patient')
    if not patient_id:
        return Response({'detail': 'patient is required'}, status=400)
    try:
        amount = Decimal(str(request.data.get('amount')))
    except (InvalidOperation, TypeError):
        return Response({'detail': 'a valid amount is required'}, status=400)
    if amount <= 0:
        return Response({'detail': 'amount must be greater than zero'}, status=400)

    description = (request.data.get('description') or 'Consultation fee').strip()
    category    = request.data.get('category') or 'consultation'
    appt_id     = request.data.get('appointment')

    try:
        patient = Patient.objects.get(pk=patient_id)
    except Patient.DoesNotExist:
        return Response({'detail': 'Patient not found'}, status=404)

    invoice = (Invoice.objects.filter(patient=patient, status__in=['draft', 'pending', 'partial'])
               .order_by('-created_at').first())
    if not invoice:
        invoice = Invoice.objects.create(
            patient=patient,
            appointment_id=appt_id or None,
            status='pending',
            created_by=request.user,
        )

    InvoiceItem.objects.create(
        invoice=invoice,
        description=description,
        category=category if category in dict(InvoiceItem.CATEGORY_CHOICES) else 'other',
        quantity=1,
        unit_price=amount,
    )

    invoice.subtotal = invoice.items.aggregate(s=_Sum('total_price'))['s'] or 0
    invoice.save()

    return Response({
        'invoice_number': invoice.invoice_number,
        'description':    description,
        'amount':         float(amount),
        'invoice_total':  float(invoice.total_amount),
        'balance_due':    float(invoice.balance_due),
    }, status=201)