from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [('ipd', '0002_remove_admission_discharged_at_and_more')]
    operations = [
        migrations.AddField(
            model_name='bed', name='price',
            field=models.DecimalField(max_digits=10, decimal_places=2, default=0),
        ),
    ]