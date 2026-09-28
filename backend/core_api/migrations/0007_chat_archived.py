from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core_api', '0006_chat_pinned'),
    ]

    operations = [
        migrations.AddField(
            model_name='chat',
            name='archived',
            field=models.BooleanField(default=False),
        ),
    ]

