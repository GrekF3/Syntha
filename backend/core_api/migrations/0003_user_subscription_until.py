from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core_api', '0002_user_display_name'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='subscription_until',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]

