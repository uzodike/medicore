# apps/ipd/urls.py
from django.urls import path
from . import views

urlpatterns = [
    # ── Dashboard ─────────────────────────────────────────────────────────────
    path('dashboard/',                              views.ipd_dashboard),

    # ── Wards & Beds ──────────────────────────────────────────────────────────
    path('wards/',                                  views.WardListView.as_view()),
    path('wards/<uuid:pk>/',                        views.WardDetailView.as_view()),
    path('beds/',                                   views.BedListCreateView.as_view()),
    path('beds/<uuid:pk>/',                         views.BedDetailView.as_view()),
    path('availability/',                           views.bed_availability),

    # ── Admission Requests (doctor creates, nurse assigns bed) ────────────────
    # IMPORTANT: 'requests/create/' must come BEFORE 'requests/<uuid:pk>/'
    path('requests/',                               views.AdmissionRequestListView.as_view()),
    path('requests/create/',                        views.AdmissionRequestCreateView.as_view()),
    path('requests/<uuid:pk>/',                     views.AdmissionRequestDetailView.as_view()),
    path('requests/<uuid:admission_id>/assign/',    views.assign_bed),

    # ── Active Admissions ─────────────────────────────────────────────────────
    # IMPORTANT: 'admissions/active/' must come BEFORE 'admissions/<uuid:pk>/'
    path('admissions/',                             views.AdmissionListView.as_view()),
    path('admissions/active/',                      views.active_admissions),
    path('admissions/<uuid:pk>/',                   views.AdmissionDetailView.as_view()),

    # ── Nurse Shifts / Room Records (med records) ─────────────────────────────
    path('shifts/',                                 views.ShiftListView.as_view()),
    path('shifts/create/',                          views.ShiftCreateView.as_view()),
    path('shifts/<uuid:pk>/',                       views.ShiftDetailView.as_view()),

    path('med-records/',                            views.MedRecordListView.as_view()),
    path('med-records/create/',                     views.create_med_record),
    path('med-records/<uuid:pk>/',                  views.MedRecordDetailView.as_view()),
    path('admissions/<uuid:admission_id>/bed-day/', views.post_bed_day),
]