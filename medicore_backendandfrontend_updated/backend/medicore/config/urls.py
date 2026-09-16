from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.urls import re_path
from django.views.generic import TemplateView
from django.views.static import serve as media_serve
#from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerUIView

urlpatterns = [
    path('admin/', admin.site.urls),

    # API schema & docs
    #path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    #path('api/docs/', SpectacularSwaggerUIView.as_view(url_name='schema'), name='swagger-ui'),

    # App routes
    path('api/v1/auth/',         include('apps.accounts.urls')),
    path('api/v1/patients/',     include('apps.patients.urls')),
    path('api/v1/appointments/', include('apps.appointments.urls')),
    path('api/v1/telemedicine/', include('apps.telemedicine.urls')),
    path('api/v1/billing/',      include('apps.billing.urls')),
    path('api/v1/pharmacy/',     include('apps.pharmacy.urls')),
    path('api/v1/lab/',          include('apps.lab.urls')),
    path('api/v1/nursing/',      include('apps.nursing.urls')),
    path('api/v1/ipd/',          include('apps.ipd.urls')),
    path('api/v1/notifications/', include('apps.notifications.urls')),
    path('api/v1/maternity/', include('apps.maternity.urls')),
    path('api/v1/malaria/', include('apps.malaria_ai.urls')),   # FIXED: was 'api/malaria/' — every other app uses 'api/v1/<name>/'
    path('api/v1/ai-screening/', include('apps.ai_screening.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)


urlpatterns += [
    # media (lab attachments) — fine at this scale; move to object storage later
    re_path(r'^media/(?P<path>.*)$', media_serve, {'document_root': settings.MEDIA_ROOT}),
    # SPA catch-all: anything that isn't api/admin/media/ws gets index.html
    re_path(r'^(?!api/|admin/|media/|ws/|static/).*$',
            TemplateView.as_view(template_name='index.html')),
]