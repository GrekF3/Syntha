from rest_framework import viewsets
from rest_framework.serializers import ModelSerializer
from catalog.models import AiModel
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.conf import settings
import os, uuid, base64, re


class AiModelSerializer(ModelSerializer):
    class Meta:
        model = AiModel
        fields = "__all__"


class ModelViewSet(viewsets.ModelViewSet):
    serializer_class = AiModelSerializer

    def get_permissions(self):
        # Anyone can list/retrieve models (public list is filtered). Creation/updates require auth.
        if self.action in ("list", "retrieve"):
            return [AllowAny()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = AiModel.objects.all().order_by("-created_at")
        scope = self.request.query_params.get("scope")
        if scope == "public":
            qs = qs.filter(is_public=True)
        elif scope == "mine" and self.request.user.is_authenticated:
            qs = qs.filter(created_by_id=self.request.user.id)
        return qs

    def _save_data_url_image(self, data_url: str, subdir: str = 'avatars') -> str:
        m = re.match(r'^data:(image\/\w+);base64,(.+)$', data_url)
        if not m:
            return data_url
        mime, b64 = m.groups()
        ext = 'png'
        if mime.endswith('jpeg') or mime.endswith('jpg'):
            ext = 'jpg'
        elif mime.endswith('webp'):
            ext = 'webp'
        content = base64.b64decode(b64)
        name = f"{uuid.uuid4().hex}.{ext}"
        media_root = getattr(settings, 'MEDIA_ROOT', None) or os.path.join(settings.BASE_DIR, 'media')
        out_dir = os.path.join(media_root, subdir)
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, name)
        with open(out_path, 'wb') as f:
            f.write(content)
        base_url = getattr(settings, 'MEDIA_URL', '/media/')
        return f"{base_url.rstrip('/')}/{subdir}/{name}"

    def perform_create(self, serializer):
        user = self.request.user
        avatar = self.request.data.get('avatar')
        # If avatar is data URL, persist into MEDIA_ROOT and store a URL
        if isinstance(avatar, str) and avatar.startswith('data:image'):
            try:
                avatar = self._save_data_url_image(avatar, 'avatars')
            except Exception:
                pass
        serializer.save(created_by=user, avatar=avatar or serializer.validated_data.get('avatar'))
