from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import Patient, MedicalHistory
from .serializers import PatientSerializer, PatientListSerializer, MedicalHistorySerializer
from core.permissions import IsAdminOrReceptionist
from core.utils import generate_patient_id
from rest_framework.decorators import api_view, permission_classes


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def patient_search(request):
    q = request.query_params.get('q', '')
    if not q:
        return Response([])
    patients = Patient.objects.filter(
        full_name__icontains=q, is_deleted=False   # use the correct field
    )[:20]
    data = [{'id': p.id, 'name': p.full_name} for p in patients]
    return Response(data)

class PatientListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    filterset_fields = ['gender', 'blood_group', 'insurance_provider']
    search_fields = ['first_name', 'last_name', 'patient_id', 'phone', 'email']
    ordering_fields = ['created_at', 'first_name', 'last_name']

    def get_queryset(self):
        return Patient.objects.filter(is_deleted=False).select_related('medical_history')

    def get_serializer_class(self):
        if self.request.method == 'GET':
            return PatientListSerializer
        return PatientSerializer

    def perform_create(self, serializer):
        serializer.save(
            patient_id=generate_patient_id(),
            registered_by=self.request.user
        )

class PatientDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = PatientSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = 'patient_id'

    def get_queryset(self):
        return Patient.objects.filter(is_deleted=False)

    def perform_destroy(self, instance):
        instance.soft_delete()

class MedicalHistoryView(generics.RetrieveUpdateAPIView):
    serializer_class = MedicalHistorySerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        patient = Patient.objects.get(patient_id=self.kwargs['patient_id'])
        obj, _ = MedicalHistory.objects.get_or_create(patient=patient)
        return obj
