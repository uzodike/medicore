from django.urls import path
from . import views

urlpatterns = [
    # Dashboard
    path('dashboard/',                     views.lab_dashboard,                     name='lab-dashboard'),

    # Test catalogue
    path('tests/',                         views.LabTestListCreateView.as_view(),   name='lab-tests'),
    path('tests/<uuid:pk>/',               views.LabTestDetailView.as_view(),       name='lab-test-detail'),

    # Orders
    path('orders/',                        views.LabOrderListCreateView.as_view(),  name='lab-orders'),
    path('orders/<uuid:pk>/attach/', views.attach_report, name='lab-attach'),
    path('orders/<uuid:pk>/',              views.LabOrderDetailView.as_view(),      name='lab-order-detail'),   # ✅ UUID

    # Sample collection / result / approval → use UUID
    path('items/<uuid:item_id>/collect/',  views.collect_sample,                    name='collect-sample'),
    path('items/<uuid:item_id>/result/',   views.enter_result,                      name='enter-result'),
    path('items/<uuid:item_id>/approve/',  views.approve_result,                    name='approve-result'),

    # Worklists
    path('pending/',                       views.pending_worklist,                  name='pending-worklist'),
    path('awaiting-collection/',           views.awaiting_collection,               name='awaiting-collection'),

    # Billing (these likely use integer PKs for LabBill, keep as <int:pk>)
    path('bills/',                         views.LabBillListView.as_view(),         name='lab-bills'),
    path('bills/<int:pk>/',                views.LabBillDetailView.as_view(),       name='lab-bill-detail'),
    path('bills/<int:bill_id>/pay/',       views.pay_bill,                          name='pay-lab-bill'),
    path('bills/<int:bill_id>/waive/',     views.waive_bill,                        name='waive-lab-bill'),

    # Service inventory
    path('inventory/',                     views.ServiceInventoryListView.as_view(), name='lab-inventory'),
    path('inventory/summary/',             views.ServiceSummaryView.as_view(),       name='lab-inventory-summary'),
]