from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core_api', '0005_aimodel_extra_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='chat',
            name='pinned',
            field=models.BooleanField(default=False),
        ),
    ]

