from django.db import migrations, models
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('core_api', '0003_user_subscription_until'),
    ]

    operations = [
        migrations.AddField(
            model_name='chat',
            name='uuid',
            field=models.UUIDField(default=uuid.uuid4, unique=True, editable=False),
        ),
    ]

