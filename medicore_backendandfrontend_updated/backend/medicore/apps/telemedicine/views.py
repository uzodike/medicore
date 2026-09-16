from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from django.utils import timezone
from .models import TeleSession, SessionMessage, EPrescription
from .serializers import (
    TeleSessionSerializer, TeleSessionWriteSerializer,
    EPrescriptionSerializer, SessionMessageSerializer
)
from core.permissions import IsDoctor
from rest_framework.permissions import IsAuthenticated, AllowAny

class TeleSessionListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    filterset_fields = ['status','consult_type','doctor']
    search_fields = ['patient__first_name','patient__last_name','session_id']
    ordering_fields = ['scheduled_at','created_at']

    def get_queryset(self):
        qs = TeleSession.objects.filter(is_deleted=False).select_related('patient','doctor')
        
        # Doctors see: sessions assigned to them OR unassigned sessions they can take
        if hasattr(self.request.user, 'role') and self.request.user.role == 'doctor':
            from django.db.models import Q
            qs = qs.filter(
                Q(doctor=self.request.user) |  # sessions they're assigned to
                Q(doctor__isnull=True)          # unassigned sessions
            )
        return qs

    def get_serializer_class(self):
        return TeleSessionWriteSerializer if self.request.method == 'POST' else TeleSessionSerializer

    def perform_create(self, serializer):
        # Auto-assign doctor if user is a doctor
        if hasattr(self.request.user, 'role') and self.request.user.role == 'doctor':
            serializer.save(booked_by=self.request.user, doctor=self.request.user)
        else:
            serializer.save(booked_by=self.request.user)
class TeleSessionDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return TeleSession.objects.filter(is_deleted=False)

    def get_serializer_class(self):
        return TeleSessionWriteSerializer if self.request.method in ('PUT','PATCH') else TeleSessionSerializer

    def perform_destroy(self, instance):
        instance.soft_delete()

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def start_session(request, pk):
    session = TeleSession.objects.get(pk=pk)
    session.status = 'live'
    session.started_at = timezone.now()
    session.save()
    return Response({'status': 'live', 'room_name': session.room_name})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def end_session(request, pk):
    session = TeleSession.objects.get(pk=pk)
    session.status = 'ended'
    session.ended_at = timezone.now()
    session.clinical_notes = request.data.get('clinical_notes', session.clinical_notes)
    session.outcome = request.data.get('outcome', '')
    session.save()
    return Response({'status': 'ended', 'duration_minutes': session.duration_minutes})

class EPrescriptionListCreateView(generics.ListCreateAPIView):
    serializer_class = EPrescriptionSerializer
    permission_classes = [IsDoctor]
    filterset_fields = ['status','patient']

    def get_queryset(self):
        return EPrescription.objects.filter(is_deleted=False, doctor=self.request.user)

    def perform_create(self, serializer):
        serializer.save(doctor=self.request.user)

class SessionMessageListCreateView(generics.ListCreateAPIView):
    serializer_class = SessionMessageSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return SessionMessage.objects.filter(session_id=self.kwargs['session_pk'])

    def perform_create(self, serializer):
        session = TeleSession.objects.get(pk=self.kwargs['session_pk'])
        role = self.request.user.role
        label = 'doctor' if role == 'doctor' else 'patient'
        serializer.save(session=session, sender=self.request.user, sender_label=label)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def live_sessions(request):
    qs = TeleSession.objects.filter(status='live', is_deleted=False).select_related('patient','doctor')
    serializer = TeleSessionSerializer(qs, many=True)
    return Response({'count': qs.count(), 'sessions': serializer.data})

@api_view(['GET'])
@permission_classes([AllowAny])
def join_session(request, join_token):
    """
    Validate token and return session details for joining.
    No authentication required — token acts as proof.
    """
    try:
        session = TeleSession.objects.get(join_token=join_token, is_deleted=False)
    except TeleSession.DoesNotExist:
        return Response({'detail': 'Invalid or expired join link.'}, status=404)
    
    # Check if session is still valid (not ended/cancelled)
    if session.status in ['ended', 'cancelled']:
        return Response({'detail': 'This session has ended.'}, status=400)
    
    return Response({
        'session': TeleSessionSerializer(session).data,
        'can_join': True,
        'room_name': session.room_name,
        'ws_url': f"ws://{request.get_host().split(':')[0]}:8080/ws/tele/{session.room_name}/",  # adjust to your domain
    })

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def ensure_session(request, appointment_id):
    """Get-or-create a TeleSession for a telemedicine appointment and optionally start it."""
    from apps.appointments.models import Appointment
    try:
        appt = Appointment.objects.get(pk=appointment_id)
    except Appointment.DoesNotExist:
        return Response({'detail': 'Appointment not found'}, status=404)

    try:
        ts = appt.tele_session
    except Exception:
        ts = None

    if not ts:
        consult = request.data.get('consult_type') or 'video'
        if consult not in ('video', 'voice', 'async'):
            consult = 'video'
        ts = TeleSession.objects.create(
            appointment     = appt,
            patient         = appt.patient,
            doctor          = appt.doctor or request.user,
            scheduled_at    = appt.scheduled_at,
            chief_complaint = appt.chief_complaint or '',
            consult_type    = consult,
            booked_by       = request.user,
        )

    if request.data.get('start') and ts.status != 'live':
        # Re-open ended/cancelled sessions so the call can resume after a drop
        ts.status = 'live'
        ts.started_at = timezone.now()
        ts.ended_at = None
        ts.save()

    return Response({
        'id':           str(ts.id),
        'session_id':   ts.session_id,
        'join_token':   ts.join_token,
        'join_path':    f'/telemedicine/join/{ts.join_token}',
        'room_name':    ts.room_name,
        'status':       ts.status,
        'consult_type': ts.consult_type,
        'join_url': ts.join_url,
    })