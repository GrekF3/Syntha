from django.db import models
import uuid


class Chat(models.Model):
    class Meta:
        db_table = 'core_api_chat'
        managed = False

    uuid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    owner = models.ForeignKey('core_api.User', on_delete=models.CASCADE, related_name='+')
    model = models.ForeignKey('catalog.AiModel', on_delete=models.CASCADE, related_name='+')
    title = models.CharField(max_length=200)
    pinned = models.BooleanField(default=False)
    archived = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)


class Message(models.Model):
    class Meta:
        db_table = 'core_api_message'
        managed = False

    chat = models.ForeignKey(Chat, on_delete=models.CASCADE, related_name='+')
    author = models.ForeignKey('core_api.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    role = models.CharField(max_length=16, choices=[("me", "Me"), ("model", "Model")])
    kind = models.CharField(max_length=16, choices=[("text", "Text"), ("image", "Image")], default="text")
    text = models.TextField(blank=True)
    image_url = models.URLField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
