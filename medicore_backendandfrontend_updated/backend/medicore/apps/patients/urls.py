from django.urls import path
from . import views
from .report import patient_report

urlpatterns = [
    path('',                            views.PatientListCreateView.as_view(), name='patient-list'),
    path('search/', views.patient_search, name='patient-search'),
    path('<str:patient_id>/report/',    patient_report,                        name='patient-report'),
    path('<str:patient_id>/',           views.PatientDetailView.as_view(),     name='patient-detail'),
    path('<str:patient_id>/history/',   views.MedicalHistoryView.as_view(),    name='medical-history'),
]
