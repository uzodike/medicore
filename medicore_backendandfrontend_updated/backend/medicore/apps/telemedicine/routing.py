from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/tele/(?P<room_name>[^/]+)/$', consumers.TeleConsumer.as_asgi()),
]
