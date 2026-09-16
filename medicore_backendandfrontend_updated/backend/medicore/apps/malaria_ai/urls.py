# apps/malaria_ai/urls.py
from django.urls import path
from . import views

urlpatterns = [
    path('status/',                    views.ai_service_status),
    path('screens/',                   views.MalariaScreenListView.as_view()),
    path('screens/upload/',            views.screen_image),           # generic now — accepts test_type
    path('screens/<uuid:pk>/boxes/',   views.list_boxes_for_screen),  # detect-kind only
    path('screens/<uuid:pk>/review/',  views.submit_box_review),      # detect-kind only
    path('screens/<uuid:pk>/confirm/', views.confirm_screen),         # classify-kind only
]
