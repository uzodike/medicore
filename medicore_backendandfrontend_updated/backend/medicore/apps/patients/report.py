"""
Full clinical record for a single patient — powers the printable Patient Report
that lives inside the Patients feature, plus the live tabs on the detail page.

One round-trip returns demographics, medical history, recent vitals,
consultations (SOAP notes), lab orders + results, prescriptions, admissions
and invoices. Each section is defensive so a missing module never 500s the
whole report.
"""
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Patient

INSURANCE_LABELS = {
    'none': 'None / Self-Pay', 'nhis': 'NHIS', 'axa': 'AXA Mansard',
    'hygeia': 'Hygeia HMO', 'aiico': 'AIICO', 'other': 'Other',
}


def _safe(fn, default=None):
    try:
        return fn()
    except Exception:
        return default


def _dt(d):
    if not d:
        return ''
    if hasattr(d, 'tzinfo'):          # datetime → localise; plain date → skip
        d = timezone.localtime(d)
    return d.strftime('%d %b %Y, %H:%M')


def _date(d):
    if not d:
        return ''
    if hasattr(d, 'tzinfo'):          # datetime → localise; plain date → skip
        d = timezone.localtime(d)
    return d.strftime('%d %b %Y')


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def patient_report(request, patient_id):
    patient = get_object_or_404(Patient, patient_id=patient_id, is_deleted=False)

    # ---- Demographics ---------------------------------------------------
    demographics = {
        'patient_id': patient.patient_id,
        'full_name': patient.get_full_name(),
        'first_name': patient.first_name,
        'last_name': patient.last_name,
        'age': patient.age,
        'gender': {'M': 'Male', 'F': 'Female', 'O': 'Other'}.get(patient.gender, patient.gender),
        'date_of_birth': _date(patient.date_of_birth) if patient.date_of_birth else '',
        'phone': patient.phone,
        'email': patient.email,
        'address': patient.address,
        'blood_group': patient.blood_group,
        'genotype': patient.genotype,
        'allergies': patient.allergies,
        'insurance_provider': patient.insurance_provider,
        'insurance_label': INSURANCE_LABELS.get(patient.insurance_provider, 'Self-Pay'),
        'insurance_id': patient.insurance_id,
        'hmo_plan': patient.hmo_plan,
        'emergency_name': patient.emergency_name,
        'emergency_relationship': patient.emergency_relationship,
        'emergency_phone': patient.emergency_phone,
        'registered_on': _date(patient.created_at),
    }

    # ---- Medical history ------------------------------------------------
    def _history():
        mh = getattr(patient, 'medical_history', None)
        if not mh:
            return None
        return {
            'chronic_conditions': mh.chronic_conditions,
            'past_surgeries': mh.past_surgeries,
            'family_history': mh.family_history,
            'current_medications': mh.current_medications,
            'vaccination_history': mh.vaccination_history,
            'notes': mh.notes,
        }
    medical_history = _safe(_history)

    # ---- Vitals (recent) ------------------------------------------------
    def _vitals():
        out = []
        for v in patient.vitals.all()[:10]:
            bp = f'{v.systolic_bp}/{v.diastolic_bp}' if v.systolic_bp and v.diastolic_bp else ''
            out.append({
                'recorded_at': _dt(v.created_at),
                'bp': bp,
                'heart_rate': v.heart_rate,
                'temperature': float(v.temperature) if v.temperature is not None else None,
                'respiratory_rate': v.respiratory_rate,
                'spo2': v.spo2,
                'weight_kg': float(v.weight_kg) if v.weight_kg is not None else None,
                'blood_sugar': v.blood_sugar,
                'pain_score': v.pain_score,
                'notes': v.notes,
                'recorded_by': v.recorded_by.get_full_name() if v.recorded_by else '',
            })
        return out
    vitals = _safe(_vitals, [])

    # ---- Consultations (SOAP notes) -------------------------------------
    def _consultations():
        out = []
        qs = patient.clinical_notes.select_related('doctor', 'appointment').all()[:25]
        for n in qs:
            out.append({
                'date': _dt(n.created_at),
                'doctor': n.doctor.get_full_name() if n.doctor else '',
                'subjective': n.subjective,
                'objective': n.objective,
                'assessment': n.assessment,
                'plan': n.plan,
                'chief_complaint': n.appointment.chief_complaint if n.appointment_id else '',
            })
        return out
    consultations = _safe(_consultations, [])

    # ---- Appointments ---------------------------------------------------
    def _appointments():
        out = []
        for a in patient.appointments.select_related('doctor').all()[:30]:
            out.append({
                'date': _dt(a.scheduled_at),
                'type': a.get_appointment_type_display(),
                'status': a.status,
                'status_label': a.get_status_display(),
                'triage': a.triage,
                'doctor': a.doctor.get_full_name() if a.doctor else 'Unassigned',
                'chief_complaint': a.chief_complaint,
            })
        return out
    appointments = _safe(_appointments, [])

    # ---- Lab orders + results -------------------------------------------
    def _lab():
        out = []
        qs = patient.lab_orders.prefetch_related('items__test').select_related('doctor').all()[:20]
        for o in qs:
            items = []
            for it in o.items.all():
                rng = ''
                if it.reference_range_low is not None and it.reference_range_high is not None:
                    rng = f'{it.reference_range_low}–{it.reference_range_high}'
                items.append({
                    'test': it.test.name if it.test_id else '',
                    'result': it.result_value,
                    'unit': it.unit,
                    'reference_range': rng,
                    'flag': it.flag,
                    'status': it.result_status,
                })
            out.append({
                'order_number': o.order_number,
                'date': _dt(o.order_date),
                'priority': o.priority,
                'status': o.status,
                'doctor': o.doctor.get_full_name() if o.doctor else '',
                'clinical_info': o.clinical_info,
                'items': items,
            })
        return out
    lab_orders = _safe(_lab, [])

    # ---- Prescriptions --------------------------------------------------
    def _rx():
        out = []
        qs = patient.prescriptions.prefetch_related('items__drug').select_related('doctor').all()[:20]
        for p in qs:
            items = []
            for it in p.items.all():
                items.append({
                    'drug': it.drug.name if it.drug_id else '',
                    'dose': it.dose,
                    'frequency': it.frequency,
                    'duration_days': it.duration_days,
                    'dispensed': it.is_dispensed,
                })
            out.append({
                'prescription_id': p.prescription_id,
                'date': _dt(p.created_at),
                'status': p.status,
                'doctor': p.doctor.get_full_name() if p.doctor else '',
                'notes': p.notes,
                'items': items,
            })
        return out
    prescriptions = _safe(_rx, [])

    # ---- Admissions -----------------------------------------------------
    def _admissions():
        out = []
        for ad in patient.admissions.select_related('bed', 'bed__ward', 'doctor').all()[:15]:
            ward = ad.bed.ward.name if (ad.bed_id and ad.bed.ward_id) else (ad.requested_ward_type or '')
            out.append({
                'date': _dt(ad.admitted_at),
                'status': ad.status,
                'type': ad.get_admission_type_display() if ad.admission_type else '',
                'ward': ward,
                'bed': ad.bed.bed_number if ad.bed_id else '',
                'diagnosis': ad.admitting_diagnosis,
                'doctor': ad.doctor.get_full_name() if ad.doctor_id else '',
                'discharge_summary': ad.discharge_summary,
            })
        return out
    admissions = _safe(_admissions, [])

    # ---- Invoices -------------------------------------------------------
    def _invoices():
        out = []
        for inv in patient.invoices.all()[:20]:
            out.append({
                'invoice_number': inv.invoice_number,
                'date': _date(inv.created_at),
                'status': inv.status,
                'total': float(inv.total_amount),
                'paid': float(inv.amount_paid),
                'balance': float(inv.balance_due),
            })
        return out
    invoices = _safe(_invoices, [])

    return Response({
        'generated_at': timezone.localtime(timezone.now()).strftime('%d %b %Y, %H:%M'),
        'demographics': demographics,
        'medical_history': medical_history,
        'vitals': vitals,
        'consultations': consultations,
        'appointments': appointments,
        'lab_orders': lab_orders,
        'prescriptions': prescriptions,
        'admissions': admissions,
        'invoices': invoices,
    })
