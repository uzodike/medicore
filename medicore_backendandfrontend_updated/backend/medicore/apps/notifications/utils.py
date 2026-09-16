def notify(recipient, title, message='', category='', link='', patient=None):
    """Create an in-app notification. Safe no-op if recipient is missing."""
    if not recipient:
        return None
    from .models import Notification
    return Notification.objects.create(
        recipient=recipient, patient=patient, title=title,
        message=message, category=category, link=link,
    )
