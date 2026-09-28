from django.db import models


class AiModel(models.Model):
    class Meta:
        db_table = 'core_api_aimodel'
        managed = False

    name = models.CharField(max_length=128)
    gender = models.CharField(max_length=16, choices=[("female", "Female"), ("male", "Male"), ("anime", "Anime")])
    age = models.PositiveSmallIntegerField(null=True, blank=True)
    bio = models.TextField(blank=True)
    fetishes = models.TextField(blank=True)
    avatar = models.URLField(default="/girl.jpg")
    is_public = models.BooleanField(default=False)
    created_by = models.ForeignKey('core_api.User', on_delete=models.CASCADE, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
