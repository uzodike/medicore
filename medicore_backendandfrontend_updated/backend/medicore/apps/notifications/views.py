from rest_framework import generics
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.utils import timezone
from datetime import datetime, timedelta

from .models import Notification
from .serializers import NotificationSerializer


class NotificationListView(generics.ListAPIView):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Notification.objects.filter(recipient=self.request.user)
        patient = self.request.query_params.get('patient')
        if patient:
            qs = qs.filter(patient_id=patient)
        if self.request.query_params.get('unread') == '1':
            qs = qs.filter(is_read=False)
        return qs[:50]


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def unread_count(request):
    return Response({'count': Notification.objects.filter(recipient=request.user, is_read=False).count()})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_read(request, pk):
    Notification.objects.filter(pk=pk, recipient=request.user).update(is_read=True)
    return Response({'success': True})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_all_read(request):
    n = Notification.objects.filter(recipient=request.user, is_read=False).update(is_read=True)
    return Response({'success': True, 'marked': n})


# ── Director: hospital-wide activity feed with date range ─────────────────────
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def activity_feed(request):
    """
    All hospital activities in one stream. Params: from=YYYY-MM-DD to=YYYY-MM-DD
    (default: last 7 days).
    """
    try:
        d_to = datetime.strptime(request.query_params.get('to', ''), '%Y-%m-%d').date()
    except ValueError:
        d_to = timezone.localdate()
    try:
        d_from = datetime.strptime(request.query_params.get('from', ''), '%Y-%m-%d').date()
    except ValueError:
        d_from = d_to - timedelta(days=7)

    events = []

    def add(ts, category, title, detail, amount=None):
        events.append({'at': ts, 'category': category, 'title': title,
                       'detail': detail, 'amount': str(amount) if amount is not None else None})

    rng = dict(created_at__date__gte=d_from, created_at__date__lte=d_to)

    try:
        from apps.ipd.models import Admission
        for a in Admission.objects.filter(is_deleted=False, **rng).select_related('patient', 'doctor', 'bed__ward')[:300]:
            add(a.created_at, 'admission',
                'Patient admitted' if a.status == 'active' else f'Admission {a.get_status_display().lower()}',
                f'{a.patient.full_name} — Dr. {a.doctor.get_full_name() if a.doctor else "—"}'
                + (f' · {a.bed.ward.name}/{a.bed.bed_number}' if a.bed else ''))
    except Exception:
        pass

    try:
        from apps.lab.models import LabOrder
        for o in LabOrder.objects.filter(is_deleted=False, **rng).select_related('patient', 'doctor')[:300]:
            add(o.created_at, 'lab', f'Lab order {o.order_number} ({o.get_status_display()})',
                f'{o.patient.full_name} — Dr. {o.doctor.get_full_name() if o.doctor else "—"}')
    except Exception:
        pass

    try:
        from apps.pharmacy.models import Prescription, StockTransaction
        for p in Prescription.objects.filter(is_deleted=False, **rng).select_related('patient')[:300]:
            add(p.created_at, 'pharmacy', 'Prescription issued', f'{p.patient.full_name}')
        for t in StockTransaction.objects.filter(**rng).select_related('drug')[:300]:
            add(t.created_at, 'pharmacy', f'Stock {t.get_transaction_type_display().lower()}',
                f'{t.drug.name} × {abs(t.quantity)}' + (f' — {t.patient_name}' if t.patient_name else ''))
    except Exception:
        pass

    try:
        from apps.billing.models import Invoice, InvoiceItem
        for inv in Invoice.objects.filter(is_deleted=False, **rng).select_related('patient'):
            add(inv.created_at, 'billing', f'Invoice {inv.invoice_number} raised ({inv.get_status_display()})',
                f'{inv.patient.full_name}', inv.total_amount)
        # IPD charges as first-class activities
        for it in (InvoiceItem.objects.filter(category='room', **rng)
                   .select_related('invoice__patient')[:300]):
            add(it.created_at, 'admission', 'IPD bed-day billed',
                f'{it.invoice.patient.full_name} — {it.description}', it.total_price)
        for it in (InvoiceItem.objects.filter(category='pharmacy',
                                              description__icontains='ward administration', **rng)
                   .select_related('invoice__patient')[:300]):
            add(it.created_at, 'admission', 'IPD drug billed',
                f'{it.invoice.patient.full_name} — {it.description}', it.total_price)
    except Exception:
        pass

    try:
        from apps.appointments.models import Appointment
        for ap in Appointment.objects.filter(is_deleted=False, **rng).select_related('patient', 'doctor')[:300]:
            add(ap.created_at, 'appointment', f'Appointment ({ap.status})',
                f'{ap.patient.full_name} — Dr. {ap.doctor.get_full_name() if ap.doctor else "—"}')
    except Exception:
        pass

    events.sort(key=lambda e: e['at'], reverse=True)
    return Response({'from': d_from, 'to': d_to, 'count': len(events), 'events': events[:600]})
