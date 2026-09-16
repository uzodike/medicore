from celery import shared_task
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)

@shared_task(bind=True, max_retries=3)
def send_session_notification(self, session_id):
    """
    Async task: send email/SMS/WhatsApp notification when session scheduled.
    Retries up to 3 times on failure.
    """
    from .models import TeleSession
    
    try:
        session = TeleSession.objects.get(id=session_id)
    except TeleSession.DoesNotExist:
        logger.error(f"Session {session_id} not found")
        return
    
    patient = session.patient
    if not patient.email:
        logger.warning(f"Patient {patient.id} has no email")
        return
    
    try:
        # Build email context
        context = {
            'patient_name': patient.get_full_name(),
            'session_id': session.session_id,
            'scheduled_at': session.scheduled_at.strftime('%d %b %Y, %I:%M %p'),
            'consult_type': session.get_consult_type_display(),
            'chief_complaint': session.chief_complaint or '(Not specified)',
            'doctor_name': session.doctor.get_full_name() if session.doctor else 'To be assigned',
            'join_url': session.join_url,
        }
        
        # ── EMAIL ──────────────────────────────────────
        if session.notify_via in ['sms_email', 'email']:
            try:
                html_message = render_to_string('telemedicine/session_email.html', context)
                send_mail(
                    subject=f"Your Telemedicine Session Scheduled — {session.session_id}",
                    message=f"Join your telemedicine session: {session.join_url}",
                    from_email='noreply@medicore.ng',
                    recipient_list=[patient.email],
                    html_message=html_message,
                    fail_silently=False,
                )
                logger.info(f"Email sent for session {session.session_id} to {patient.email}")
            except Exception as e:
                logger.error(f"Email failed for {session.session_id}: {str(e)}")
                raise
        
        # ── SMS (using Twilio) ─────────────────────────
        if session.notify_via in ['sms_email', 'sms']:
            try:
                send_sms_notification.delay(session_id, patient.phone)
            except Exception as e:
                logger.error(f"SMS task failed for {session.session_id}: {str(e)}")
        
        # ── WhatsApp (using Twilio) ────────────────────
        if session.notify_via == 'whatsapp':
            try:
                send_whatsapp_notification.delay(session_id, patient.phone)
            except Exception as e:
                logger.error(f"WhatsApp task failed for {session.session_id}: {str(e)}")
        
        # Mark as sent
        session.email_sent_at = timezone.now()
        session.save(update_fields=['email_sent_at'])
        
    except Exception as exc:
        logger.error(f"Notification failed for session {session_id}: {str(exc)}")
        # Retry with exponential backoff
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))


@shared_task(bind=True, max_retries=3)
def send_sms_notification(self, session_id, phone_number):
    """Send SMS via Twilio."""
    from .models import TeleSession
    from twilio.rest import Client
    from django.conf import settings
    
    try:
        session = TeleSession.objects.get(id=session_id)
        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        
        message_body = (
            f"Your telemedicine session ({session.session_id}) is scheduled for "
            f"{session.scheduled_at.strftime('%d %b, %I:%M %p')}. "
            f"Join here: {session.join_url}"
        )
        
        client.messages.create(
            body=message_body,
            from_=settings.TWILIO_PHONE_NUMBER,
            to=phone_number
        )
        logger.info(f"SMS sent for session {session.session_id} to {phone_number}")
        
    except Exception as exc:
        logger.error(f"SMS failed for session {session_id}: {str(exc)}")
        raise self.retry(exc=exc, countdown=60)


@shared_task(bind=True, max_retries=3)
def send_whatsapp_notification(self, session_id, phone_number):
    """Send WhatsApp message via Twilio."""
    from .models import TeleSession
    from twilio.rest import Client
    from django.conf import settings
    
    try:
        session = TeleSession.objects.get(id=session_id)
        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        
        message_body = (
            f"🏥 *Your MediCore Session Scheduled*\n\n"
            f"Session: {session.session_id}\n"
            f"When: {session.scheduled_at.strftime('%d %b, %I:%M %p')}\n"
            f"Type: {session.get_consult_type_display()}\n\n"
            f"👉 [Join Now]({session.join_url})"
        )
        
        client.messages.create(
            body=message_body,
            from_=f"whatsapp:{settings.TWILIO_WHATSAPP_NUMBER}",
            to=f"whatsapp:{phone_number}"
        )
        logger.info(f"WhatsApp sent for session {session.session_id} to {phone_number}")
        
    except Exception as exc:
        logger.error(f"WhatsApp failed for session {session_id}: {str(exc)}")
        raise self.retry(exc=exc, countdown=60)