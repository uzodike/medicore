from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from . import views
from .dashboard import dashboard_stats

urlpatterns = [
    path('login/',           views.LoginView.as_view(),          name='login'),
    path('dashboard/',       dashboard_stats,                    name='dashboard-stats'),
    path('logout/',          views.LogoutView.as_view(),         name='logout'),
    path('token/refresh/',   TokenRefreshView.as_view(),         name='token-refresh'),
    path('register/',        views.RegisterView.as_view(),       name='register'),
    path('me/',              views.MeView.as_view(),             name='me'),
    path('users/',           views.UserListView.as_view(),       name='user-list'),
    path('change-password/', views.ChangePasswordView.as_view(), name='change-password'),
]
