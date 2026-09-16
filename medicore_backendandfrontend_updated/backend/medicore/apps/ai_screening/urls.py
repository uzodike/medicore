# apps/ai_screening/urls.py
from django.urls import path
from . import views

urlpatterns = [
    path('status/',                       views.ai_service_status),
    path('screens/',                      views.AIScreenListView.as_view()),
    # MUST come before screens/<uuid:pk>/... — otherwise Django tries to
    # parse "adhoc-upload" as a UUID for the pk converter and 404s.
    path('screens/adhoc-upload/',         views.screen_image_adhoc),
    path('screens/<uuid:pk>/upload/',     views.upload_screen_image),
    path('screens/<uuid:pk>/boxes/',      views.list_boxes_for_screen),
    path('screens/<uuid:pk>/review/',     views.submit_box_review),
    path('screens/<uuid:pk>/confirm/',    views.confirm_screen),
]