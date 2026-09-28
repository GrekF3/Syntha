from django.contrib import admin
from .models import (
    User,
    AiModel,
    Chat,
    Message,
    GeneratedImage,
    Report,
    SupportTicket,
    UserNotification,
    UserSession,
    ReferralCode,
    Referral,
)


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ("id", "username", "email", "plan", "nsfw_enabled", "two_factor_enabled", "is_active", "is_staff")
    search_fields = ("username", "email")


@admin.register(AiModel)
class AiModelAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "gender", "age", "is_public", "created_by", "created_at")
    list_filter = ("gender", "is_public")
    search_fields = ("name", "bio")


@admin.register(Chat)
class ChatAdmin(admin.ModelAdmin):
    list_display = ("id", "uuid", "title", "owner", "model", "pinned", "archived", "created_at")
    list_filter = ("pinned", "archived")
    search_fields = ("title", "uuid")


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ("id", "chat", "author", "role", "kind", "created_at")
    search_fields = ("text",)


@admin.register(GeneratedImage)
class GeneratedImageAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "model", "nsfw", "created_at")
    list_filter = ("nsfw",)


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = ("id", "model", "reporter", "created_at")


@admin.register(SupportTicket)
class SupportTicketAdmin(admin.ModelAdmin):
    list_display = ("id", "subject", "email", "status", "created_at")
    list_filter = ("status",)
    search_fields = ("subject", "message", "email")


@admin.register(UserNotification)
class UserNotificationAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "title", "unread", "created_at")
    list_filter = ("unread",)
    search_fields = ("title", "body")


@admin.register(UserSession)
class UserSessionAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "jti", "device", "ip", "revoked", "last_active", "created_at")
    list_filter = ("revoked",)
    search_fields = ("jti", "device", "ip")


@admin.register(ReferralCode)
class ReferralCodeAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "code", "created_at")
    search_fields = ("code", "user__username", "user__email")


@admin.register(Referral)
class ReferralAdmin(admin.ModelAdmin):
    list_display = ("id", "inviter", "invitee", "created_at")
    search_fields = ("inviter__username", "inviter__email", "invitee__username", "invitee__email")
