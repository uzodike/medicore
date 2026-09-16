from django.urls import path
from . import views

urlpatterns = [
    path('',              views.InvoiceListCreateView.as_view(), name='invoice-list'),
    path('<uuid:pk>/',    views.InvoiceDetailView.as_view(),     name='invoice-detail'),
    path('<uuid:pk>/pay/', views.post_payment,                   name='post-payment'),
]
