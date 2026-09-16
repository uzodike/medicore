from django.urls import path
from . import views

urlpatterns = [
    path('drugs/', views.DrugListCreateView.as_view()),
    path('drugs/<uuid:pk>/', views.DrugDetailView.as_view()),
    path('drugs/low-stock/', views.low_stock_drugs),
    path('prescriptions/', views.PrescriptionListCreateView.as_view()),
    path('prescriptions/<uuid:pk>/', views.PrescriptionDetailView.as_view()),
    path('receive/', views.receive_stock),
    path('dispense/', views.dispense_multiple),
    path('walkin/', views.process_walkin),
    path('stock-history/', views.StockHistoryView.as_view()),
    path('patient-usage/', views.patient_usage),
    path('drugs/<uuid:pk>/detail/', views.drug_detail),
    path('drugs/<uuid:pk>/writeoff-expired/', views.writeoff_expired),
]