from rest_framework.serializers import ModelSerializer
from django.contrib.auth import get_user_model

User = get_user_model()


class UserSerializer(ModelSerializer):
    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "display_name",
            "plan",
            "nsfw_enabled",
            "two_factor_enabled",
            "is_active",
            "is_staff",
        ]


class RegisterSerializer(ModelSerializer):
    class Meta:
        model = User
        fields = ["username", "email", "password", "display_name"]
        extra_kwargs = {"password": {"write_only": True}}
