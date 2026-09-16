"""
Central dashboard data — powers the main dashboard view.

Returns everything the dashboard renders:
  - headline stat cards (OPD today, IPD occupancy, today's revenue, patients)
    each with a trend vs the comparable previous period
  - recent patient registrations
  - a live cross-module activity feed
  - per-ward bed occupancy

Every section is wrapped in a defensive _safe() so one missing migration or
empty table can never blank the whole dashboard. Designed to be polled on an
interval by the frontend for near-real-time updates.
"""
from datetime import timedelta

from django.db.models import Sum
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response


def _safe(fn, default=None):
    try:
        return fn()
    except Exception:
        return default


def _trend(current, previous):
    """Percentage change vs previous period, with direction."""
    current = current or 0
    previous = previous or 0
    if previous == 0:
        if current == 0:
            return {'pct': 0, 'dir': 'flat'}
        return {'pct': 100, 'dir': 'up'}
    pct = round((current - previous) / previous * 100)
    return {'pct': abs(pct), 'dir': 'up' if pct > 0 else ('down' if pct < 0 else 'flat')}


def _humanize(dt, now):
    """'Just now' / '5 min ago' / '3 h ago' / 'Mon 14:30'."""
    if not dt:
        return ''
    delta = now - dt
    secs = delta.total_seconds()
    if secs < 60:
        return 'Just now'
    if secs < 3600:
        return f'{int(secs // 60)} min ago'
    if secs < 86400:
        return f'{int(secs // 3600)} h ago'
    if secs < 7 * 86400:
        return f'{int(secs // 86400)} d ago'
    return timezone.localtime(dt).strftime('%d %b, %H:%M')


INSURANCE_LABELS = {
    'none': 'Self-Pay', 'nhis': 'NHIS', 'axa': 'AXA Mansard',
    'hygeia': 'Hygeia HMO', 'aiico': 'AIICO', 'other': 'Other',
}


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_stats(request):
    user = request.user
    role = getattr(user, 'role', None)
    now = timezone.now()
    today = now.date()
    yesterday = today - timedelta(days=1)
    last_week_same_day = today - timedelta(days=7)

    # ---- Models (imported lazily so import-time never fails) -------------
    from apps.patients.models import Patient
    from apps.appointments.models import Appointment
    from apps.ipd.models import Admission, Bed, Ward
    from apps.lab.models import LabOrder
    from apps.pharmacy.models import Prescription
    from apps.billing.models import Invoice
    from apps.telemedicine.models import TeleSession

    # ===== HEADLINE CARDS ================================================
    # OPD today + trend vs yesterday
    opd_today = _safe(lambda: Appointment.objects.filter(
        scheduled_at__date=today, appointment_type='opd').count(), 0)
    opd_yesterday = _safe(lambda: Appointment.objects.filter(
        scheduled_at__date=yesterday, appointment_type='opd').count(), 0)

    # IPD occupancy
    total_beds = _safe(lambda: Bed.objects.count(), 0)
    occupied_beds = _safe(lambda: Bed.objects.filter(status='occupied').count(), 0)
    occupancy_pct = round((occupied_beds / total_beds) * 100) if total_beds else 0

    # Revenue today + trend vs same day last week
    revenue_today = _safe(lambda: float(Invoice.objects.filter(
        created_at__date=today).aggregate(s=Sum('amount_paid'))['s'] or 0), 0)
    revenue_lastweek = _safe(lambda: float(Invoice.objects.filter(
        created_at__date=last_week_same_day).aggregate(s=Sum('amount_paid'))['s'] or 0), 0)

    total_patients = _safe(lambda: Patient.objects.filter(is_deleted=False).count(), 0)
    new_patients_week = _safe(lambda: Patient.objects.filter(
        is_deleted=False, created_at__gte=now - timedelta(days=7)).count(), 0)

    # Secondary numbers (kept for role-aware cards / other consumers)
    appts_today = _safe(lambda: Appointment.objects.filter(scheduled_at__date=today).count(), 0)
    appts_waiting = _safe(lambda: Appointment.objects.filter(
        scheduled_at__date=today, status__in=['scheduled', 'confirmed']).count(), 0)
    appts_in_progress = _safe(lambda: Appointment.objects.filter(status='in_progress').count(), 0)
    active_admissions = _safe(lambda: Admission.objects.filter(status='active').count(), 0)
    pending_admissions = _safe(lambda: Admission.objects.filter(status='requested').count(), 0)
    lab_pending = _safe(lambda: LabOrder.objects.filter(status__in=['ordered', 'in_progress']).count(), 0)
    lab_done_today = _safe(lambda: LabOrder.objects.filter(status='completed', updated_at__date=today).count(), 0)
    rx_pending = _safe(lambda: Prescription.objects.filter(status__in=['pending', 'partial']).count(), 0)
    rx_done_today = _safe(lambda: Prescription.objects.filter(status='dispensed', updated_at__date=today).count(), 0)
    outstanding = _safe(lambda: float(Invoice.objects.filter(
        status__in=['pending', 'partial']).aggregate(s=Sum('total_amount'))['s'] or 0), 0)
    paid_today = _safe(lambda: float(Invoice.objects.filter(
        status='paid', updated_at__date=today).aggregate(s=Sum('amount_paid'))['s'] or 0), 0)
    tele_today = _safe(lambda: TeleSession.objects.filter(scheduled_at__date=today).count(), 0)
    tele_live = _safe(lambda: TeleSession.objects.filter(status__in=['waiting', 'live']).count(), 0)

    cards = {
        'opd_today':    {'value': opd_today, 'trend': _trend(opd_today, opd_yesterday)},
        'occupancy':    {'pct': occupancy_pct, 'occupied': occupied_beds, 'total': total_beds},
        'revenue_today': {'value': revenue_today, 'trend': _trend(revenue_today, revenue_lastweek)},
        'patients_total': {'value': total_patients, 'new_this_week': new_patients_week},
    }

    # Grouped (used by role-aware secondary cards if needed)
    stats = {
        'patients': {'total': total_patients, 'new_this_week': new_patients_week},
        'appointments': {'today': appts_today, 'waiting': appts_waiting, 'in_progress': appts_in_progress},
        'ipd': {'active_admissions': active_admissions, 'pending_requests': pending_admissions,
                'total_beds': total_beds, 'occupied_beds': occupied_beds, 'occupancy_pct': occupancy_pct},
        'lab': {'pending': lab_pending, 'completed_today': lab_done_today},
        'pharmacy': {'pending': rx_pending, 'dispensed_today': rx_done_today},
        'billing': {'revenue_today': revenue_today, 'outstanding': outstanding, 'paid_today': paid_today},
        'telemedicine': {'today': tele_today, 'live': tele_live},
    }
    if role == 'doctor':
        stats['my_queue'] = _safe(lambda: Appointment.objects.filter(
            doctor=user, scheduled_at__date=today,
            status__in=['scheduled', 'confirmed', 'in_progress']).count(), 0)

    # ===== RECENT REGISTRATIONS ==========================================
    def _recent_patients():
        out = []
        qs = Patient.objects.filter(is_deleted=False).order_by('-created_at')[:6]
        for p in qs:
            out.append({
                'name': p.get_full_name(),
                'patient_id': p.patient_id,
                'insurance': p.insurance_provider,
                'insurance_label': INSURANCE_LABELS.get(p.insurance_provider, 'Self-Pay'),
                'date': timezone.localtime(p.created_at).strftime('%d %b %Y'),
            })
        return out
    recent_patients = _safe(_recent_patients, [])

    # ===== ACTIVITY FEED (merged, time-sorted) ===========================
    def _activity():
        events = []

        for p in _safe(lambda: list(Patient.objects.filter(is_deleted=False)
                                    .order_by('-created_at')[:8]), []) or []:
            events.append((p.created_at, 'g', f'New patient registered — {p.get_full_name()}'))

        for a in _safe(lambda: list(Appointment.objects.select_related('patient')
                                    .order_by('-created_at')[:8]), []) or []:
            pname = a.patient.get_full_name() if a.patient_id else 'Unknown'
            if a.status == 'completed':
                events.append((a.updated_at, 'g', f'Consultation completed — {pname}'))
            elif a.status == 'in_progress':
                events.append((a.updated_at, 'b', f'Consultation in progress — {pname}'))
            else:
                events.append((a.created_at, 'b', f'Appointment booked — {pname}'))

        for ad in _safe(lambda: list(Admission.objects.select_related('patient')
                                     .order_by('-created_at')[:6]), []) or []:
            pname = ad.patient.get_full_name() if ad.patient_id else 'Unknown'
            if ad.status == 'active':
                events.append((ad.updated_at, 'a', f'Patient admitted — {pname}'))
            elif ad.status == 'requested':
                events.append((ad.created_at, 'a', f'Admission requested — {pname}'))
            elif ad.status == 'discharged':
                events.append((ad.updated_at, 'g', f'Patient discharged — {pname}'))

        for lo in _safe(lambda: list(LabOrder.objects.select_related('patient')
                                     .order_by('-created_at')[:6]), []) or []:
            pname = lo.patient.get_full_name() if lo.patient_id else 'Unknown'
            if lo.status == 'completed':
                events.append((lo.updated_at, 'g', f'Lab results ready — {pname}'))
            else:
                events.append((lo.created_at, 'b', f'Lab order placed — {pname}'))

        for rx in _safe(lambda: list(Prescription.objects.select_related('patient')
                                     .order_by('-created_at')[:6]), []) or []:
            pname = rx.patient.get_full_name() if rx.patient_id else 'Unknown'
            if rx.status == 'dispensed':
                events.append((rx.updated_at, 'g', f'Prescription dispensed — {pname}'))
            else:
                events.append((rx.created_at, 'b', f'Prescription created — {pname}'))

        # newest first, drop any with no timestamp, cap at 12
        events = [e for e in events if e[0] is not None]
        events.sort(key=lambda e: e[0], reverse=True)
        return [{'dot': dot, 'title': title, 'time': _humanize(ts, now),
                 'timestamp': ts.isoformat()} for ts, dot, title in events[:12]]
    activity = _safe(_activity, [])

    # ===== DEPARTMENT / WARD OCCUPANCY ===================================
    def _wards():
        out = []
        for w in Ward.objects.all().order_by('name'):
            beds = w.beds.count()
            total = beds or w.total_beds or 0
            occ = w.beds.filter(status='occupied').count()
            pct = round((occ / total) * 100) if total else 0
            color = '#dc2626' if pct >= 90 else ('#d97706' if pct >= 75 else '#16a34a')
            out.append({'name': w.name, 'occupied': occ, 'total': total, 'pct': pct, 'color': color})
        return out
    wards = _safe(_wards, [])

    return Response({
        'role': role,
        'as_of': now.isoformat(),
        'cards': cards,
        'stats': stats,
        'recent_patients': recent_patients,
        'activity': activity,
        'wards': wards,
    })
