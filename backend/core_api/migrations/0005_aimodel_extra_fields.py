from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core_api', '0004_chat_uuid'),
    ]

    operations = [
        migrations.AddField(
            model_name='aimodel',
            name='age',
            field=models.PositiveSmallIntegerField(null=True, blank=True),
        ),
        migrations.AddField(
            model_name='aimodel',
            name='fetishes',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='aimodel',
            name='avatar',
            field=models.URLField(default='/girl.jpg'),
        ),
        migrations.AddField(
            model_name='aimodel',
            name='is_public',
            field=models.BooleanField(default=False),
        ),
    ]

