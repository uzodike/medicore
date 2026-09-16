from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('pharmacy', '0002_remove_drug_current_stock_drugbatch_stockalert_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='prescriptionitem',
            name='drug',
            field=models.ForeignKey(
                null=True, blank=True,
                on_delete=django.db.models.deletion.SET_NULL,
                to='pharmacy.drug',
            ),
        ),
        migrations.AlterField(
            model_name='prescriptionitem',
            name='duration_days',
            field=models.PositiveIntegerField(default=7),
        ),
        migrations.AddField(
            model_name='prescriptionitem',
            name='drug_name_free',
            field=models.CharField(blank=True, default='', max_length=200),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='prescriptionitem',
            name='instructions',
            field=models.CharField(blank=True, default='', max_length=255),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='prescriptionitem',
            name='dispense_source',
            field=models.CharField(
                choices=[('pharmacy', 'In-house pharmacy'), ('external', 'Patient buys outside')],
                default='pharmacy', max_length=10,
            ),
        ),
        migrations.AddField(
            model_name='prescriptionitem',
            name='quantity_prescribed',
            field=models.PositiveIntegerField(default=0),
        ),
    ]