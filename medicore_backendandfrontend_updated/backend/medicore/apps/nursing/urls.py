from django.urls import path
from . import views
urlpatterns = [
    path('vitals/',  views.VitalRecordListCreateView.as_view(), name='vitals'),
    path('mar/',     views.MARListCreateView.as_view(),          name='mar'),
]
