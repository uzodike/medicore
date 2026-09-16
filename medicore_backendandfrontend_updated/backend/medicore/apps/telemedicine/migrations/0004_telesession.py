from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('appointments', '0001_initial'),
        ('telemedicine', '0003_remove_telesession_meeting_link_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='telesession',
            name='appointment',
            field=models.OneToOneField(
                blank=True, null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='tele_session',
                to='appointments.appointment',
            ),
        ),
    ]