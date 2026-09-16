from django.urls import path
from apps.doctorportal import views as doctorportal_views
from . import views as appointments_views

urlpatterns = [
    # ── Appointments app endpoints ───────────────────────────────────────────
    path('',          appointments_views.AppointmentListCreateView.as_view()),
    path('<uuid:pk>/', appointments_views.AppointmentDetailView.as_view()),
    path('today/',    appointments_views.today_appointments),

    # Doctor queue & dashboard (from doctorportal)
    path('queue/',                              doctorportal_views.queue,                       name='doctor-queue'),
    path('doctor-dashboard/',                   doctorportal_views.doctor_dashboard,            name='doctor-dashboard'),
    path('charges/',                            doctorportal_views.raise_charge,               name='doctor-raise-charge'),
 
    # Appointment status patch (from doctorportal)
    path('<uuid:pk>/status/',                    doctorportal_views.update_appointment_status,   name='appointment-status'),

    # Patient consultation summary (from doctorportal)
    path('patients/<uuid:patient_id>/consultation/', doctorportal_views.patient_consultation,  name='patient-consultation'),
 
    # Clinical notes (from doctorportal)
    path('clinical-notes/',                     doctorportal_views.ClinicalNoteListCreateView.as_view(), name='clinical-notes'),
    path('clinical-notes/<int:pk>/',            doctorportal_views.ClinicalNoteDetailView.as_view(),     name='clinical-note-detail'),
 
    # Prescriptions (from doctorportal)
    path('prescriptions/',                      doctorportal_views.PrescriptionListView.as_view(),       name='doctor-prescriptions'),
    path('prescriptions/create/',               doctorportal_views.PrescriptionCreateView.as_view(),     name='doctor-create-prescription'),
 
    # Drug search autocomplete (from doctorportal)
    path('drugs/search/',                       doctorportal_views.drug_search,                 name='drug-search'),

]
