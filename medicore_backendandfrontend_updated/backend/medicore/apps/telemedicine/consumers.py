import json
from channels.generic.websocket import AsyncWebsocketConsumer

class TeleConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for real-time telemedicine signaling.
    Handles WebRTC offer/answer/ICE candidate exchange.
    """
    async def connect(self):
        self.room_name = self.scope['url_route']['kwargs']['room_name']
        self.room_group = f'tele_{self.room_name}'
        await self.channel_layer.group_add(self.room_group, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.room_group, self.channel_name)
        await self.channel_layer.group_send(self.room_group, {
            'type': 'peer.left',
            'message': {'type': 'peer-left'},
        })

    async def receive(self, text_data):
        data = json.loads(text_data)
        msg_type = data.get('type')

        # Relay WebRTC signaling to the other peer in the room
        if msg_type in ('ready', 'offer', 'answer', 'ice-candidate', 'chat', 'mute', 'video-toggle'):
            await self.channel_layer.group_send(self.room_group, {
                'type': 'relay.message',
                'message': data,
                'sender_channel': self.channel_name,
            })

    async def relay_message(self, event):
        # Don't relay back to the sender
        if event.get('sender_channel') != self.channel_name:
            await self.send(text_data=json.dumps(event['message']))

    async def peer_left(self, event):
        await self.send(text_data=json.dumps(event['message']))
