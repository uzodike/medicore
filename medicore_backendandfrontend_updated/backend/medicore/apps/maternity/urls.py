from django.urls import path
from . import views

urlpatterns = [
    path('dashboard/',              views.maternity_dashboard),
    path('enrollments/',            views.EnrollmentListCreateView.as_view()),
    path('enrollments/<uuid:pk>/',  views.EnrollmentDetailView.as_view()),
    path('visits/',                 views.VisitListCreateView.as_view()),
    path('deliveries/',             views.DeliveryListCreateView.as_view()),
]
