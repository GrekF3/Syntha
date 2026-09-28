from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core_api', '0008_referrals'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='two_factor_enabled',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='user',
            name='two_factor_secret',
            field=models.CharField(blank=True, default='', max_length=64),
        ),
    ]

