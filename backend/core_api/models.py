from django.db import models
import uuid as _uuid
from django.contrib.auth.models import AbstractUser


class User(AbstractUser):
    plan = models.CharField(max_length=16, default="free")
    nsfw_enabled = models.BooleanField(default=False)
    # Display name shown in UI; can be any text (including Russian), not unique
    display_name = models.CharField(max_length=150, blank=True, default="")
    # Mock subscription end (for account deletion scheduling)
    subscription_until = models.DateTimeField(null=True, blank=True)
    # Two-factor auth (simple placeholder)
    two_factor_enabled = models.BooleanField(default=False)
    two_factor_secret = models.CharField(max_length=64, blank=True, default="")


class AiModel(models.Model):
    name = models.CharField(max_length=128)
    gender = models.CharField(max_length=16, choices=[("female", "Female"), ("male", "Male"), ("anime", "Anime")])
    age = models.PositiveSmallIntegerField(null=True, blank=True)
    bio = models.TextField(blank=True)
    fetishes = models.TextField(blank=True)  # comma-separated list
    avatar = models.URLField(default="/girl.jpg")
    is_public = models.BooleanField(default=False)
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name="models")
    created_at = models.DateTimeField(auto_now_add=True)


class Chat(models.Model):
    uuid = models.UUIDField(default=_uuid.uuid4, unique=True, editable=False)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="chats")
    model = models.ForeignKey(AiModel, on_delete=models.CASCADE, related_name="chats")
    title = models.CharField(max_length=200)
    pinned = models.BooleanField(default=False)
    archived = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)


class Message(models.Model):
    chat = models.ForeignKey(Chat, on_delete=models.CASCADE, related_name="messages")
    author = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    role = models.CharField(max_length=16, choices=[("me", "Me"), ("model", "Model")])
    kind = models.CharField(max_length=16, choices=[("text", "Text"), ("image", "Image")], default="text")
    text = models.TextField(blank=True)
    image_url = models.URLField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class GeneratedImage(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="images")
    model = models.ForeignKey(AiModel, on_delete=models.SET_NULL, null=True, blank=True)
    url = models.URLField()
    nsfw = models.BooleanField(default=False)
    prompt = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class Report(models.Model):
    reporter = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    model = models.ForeignKey(AiModel, on_delete=models.CASCADE)
    reason = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)


class SupportTicket(models.Model):
    STATUS_CHOICES = (
        ("new", "New"),
        ("in_progress", "In Progress"),
        ("resolved", "Resolved"),
    )
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    email = models.EmailField(blank=True)
    subject = models.CharField(max_length=200)
    message = models.TextField()
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="new")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class UserNotification(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notifications")
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    action_label = models.CharField(max_length=64, blank=True)
    action_href = models.URLField(blank=True)
    unread = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)


class UserSession(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="sessions")
    jti = models.CharField(max_length=64, unique=True)
    device = models.CharField(max_length=128, blank=True)
    ip = models.CharField(max_length=64, blank=True)
    last_active = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)
    revoked = models.BooleanField(default=False)


class ReferralCode(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="referral_codes")
    code = models.CharField(max_length=32, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)


class Referral(models.Model):
    inviter = models.ForeignKey(User, on_delete=models.CASCADE, related_name="referrals_sent")
    invitee = models.OneToOneField(User, on_delete=models.CASCADE, related_name="referral")
    created_at = models.DateTimeField(auto_now_add=True)
