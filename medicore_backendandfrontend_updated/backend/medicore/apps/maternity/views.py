from datetime import timedelta
from rest_framework import generics
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.utils import timezone

from .models import ANCEnrollment, ANCVisit, Delivery
from .serializers import ANCEnrollmentSerializer, ANCVisitSerializer, DeliverySerializer


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def maternity_dashboard(request):
    today = timezone.localdate()
    month_start = today.replace(day=1)
    active = ANCEnrollment.objects.filter(status='active', is_deleted=False)
    # Due this month: EDD = LMP + 280d falls in current month
    lmp_lo = month_start - timedelta(days=280)
    lmp_hi = (month_start + timedelta(days=31)).replace(day=1) - timedelta(days=280 + 1)
    return Response({
        'active_pregnancies': active.count(),
        'high_risk': active.filter(risk_level='high').count(),
        'due_this_month': active.filter(lmp__gte=lmp_hi, lmp__lte=month_start - timedelta(days=280 - 31)).count(),
        'deliveries_this_month': Delivery.objects.filter(
            delivery_datetime__date__gte=month_start, is_deleted=False).count(),
        'visits_today': ANCVisit.objects.filter(visit_date=today, is_deleted=False).count(),
    })


class EnrollmentListCreateView(generics.ListCreateAPIView):
    serializer_class = ANCEnrollmentSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['status', 'risk_level', 'patient']
    search_fields = ['patient__first_name', 'patient__last_name']

    def get_queryset(self):
        return (ANCEnrollment.objects.filter(is_deleted=False)
                .select_related('patient', 'doctor')
                .prefetch_related('visits', 'deliveries'))

    def perform_create(self, serializer):
        enrollment = serializer.save()
        # Notify the assigned doctor about high-risk bookings
        if enrollment.risk_level == 'high' and enrollment.doctor:
            try:
                from apps.notifications.utils import notify
                notify(enrollment.doctor, patient=enrollment.patient,
                       title='High-risk ANC booking',
                       message=f'{enrollment.patient.full_name} booked for ANC — flagged high risk. {enrollment.risk_factors or ""}'.strip(),
                       category='maternity', link='/maternity')
            except Exception:
                pass


class EnrollmentDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = ANCEnrollmentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ANCEnrollment.objects.filter(is_deleted=False)


class VisitListCreateView(generics.ListCreateAPIView):
    serializer_class = ANCVisitSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['enrollment']

    def get_queryset(self):
        return ANCVisit.objects.filter(is_deleted=False).select_related('enrollment__patient', 'seen_by')

    def perform_create(self, serializer):
        visit = serializer.save(seen_by=self.request.user)
        # Pre-eclampsia red flag: high BP + proteinuria → flag enrollment high risk + notify
        try:
            enr = visit.enrollment
            hypertensive = (visit.systolic_bp or 0) >= 140 or (visit.diastolic_bp or 0) >= 90
            proteinuria = visit.urine_protein in ('1+', '2+', '3+')
            if hypertensive and proteinuria and enr.risk_level != 'high':
                enr.risk_level = 'high'
                enr.risk_factors = (enr.risk_factors + '\n' if enr.risk_factors else '') + \
                    f'Auto-flag {visit.visit_date}: BP {visit.systolic_bp}/{visit.diastolic_bp} + urine protein {visit.urine_protein} (possible pre-eclampsia)'
                enr.save(update_fields=['risk_level', 'risk_factors'])
                if enr.doctor:
                    from apps.notifications.utils import notify
                    notify(enr.doctor, patient=enr.patient,
                           title='⚠ Possible pre-eclampsia',
                           message=f'{enr.patient.full_name}: BP {visit.systolic_bp}/{visit.diastolic_bp} with proteinuria {visit.urine_protein} at ANC visit.',
                           category='maternity', link='/maternity')
        except Exception:
            pass


class DeliveryListCreateView(generics.ListCreateAPIView):
    serializer_class = DeliverySerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['enrollment', 'mode', 'outcome']

    def get_queryset(self):
        return Delivery.objects.filter(is_deleted=False).select_related('enrollment__patient', 'conducted_by')

    def perform_create(self, serializer):
        delivery = serializer.save(conducted_by=self.request.user)
        # Close out the pregnancy
        enr = delivery.enrollment
        if enr.status != 'delivered':
            enr.status = 'delivered'
            enr.save(update_fields=['status'])
        try:
            from apps.notifications.utils import notify
            if enr.doctor:
                notify(enr.doctor, patient=enr.patient,
                       title='Delivery recorded',
                       message=f'{enr.patient.full_name} delivered ({delivery.get_mode_display()}, {delivery.get_outcome_display()}).',
                       category='maternity', link='/maternity')
        except Exception:
            pass
