@receiver(post_save, sender=TeleSession)
def notify_on_schedule(sender, instance, created, **kwargs):
    if created:
        try:
            send_session_notification.delay(instance.id)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Tele notification not queued: {e}")