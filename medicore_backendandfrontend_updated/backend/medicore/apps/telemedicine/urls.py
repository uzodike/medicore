from django.urls import path
from . import views

urlpatterns = [
    path('',                    views.TeleSessionListCreateView.as_view(), name='tele-list'),
    path('<uuid:pk>/',          views.TeleSessionDetailView.as_view(),     name='tele-detail'),
    path('<uuid:pk>/start/',    views.start_session,                        name='tele-start'),
    path('<uuid:pk>/end/',      views.end_session,                          name='tele-end'),
    path('<uuid:session_pk>/messages/', views.SessionMessageListCreateView.as_view(), name='tele-messages'),
    path('live/',               views.live_sessions,                        name='tele-live'),
    path('eprescriptions/',     views.EPrescriptionListCreateView.as_view(),name='eprescriptions'),
    path('join/<str:join_token>/', views.join_session, name='tele-join'),
    path('appointments/<uuid:appointment_id>/session/', views.ensure_session, name='tele-ensure'),
]
