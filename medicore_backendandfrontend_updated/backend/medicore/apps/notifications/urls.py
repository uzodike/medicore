from django.urls import path
from . import views

urlpatterns = [
    path('',                 views.NotificationListView.as_view(), name='notifications'),
    path('unread-count/',    views.unread_count,                   name='notifications-unread'),
    path('<uuid:pk>/read/',  views.mark_read,                      name='notification-read'),
    path('read-all/',        views.mark_all_read,                  name='notifications-read-all'),
    path('activity/',        views.activity_feed,                  name='activity-feed'),
]
