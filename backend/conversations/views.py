from rest_framework import viewsets
from rest_framework.serializers import ModelSerializer
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from conversations.models import Chat, Message
from django.db.models import OuterRef, Subquery
from catalog.models import AiModel
from django.utils import timezone
from django.http import StreamingHttpResponse
import time


class ChatSerializer(ModelSerializer):
    class Meta:
        model = Chat
        fields = "__all__"
        read_only_fields = ("owner", "created_at", "uuid", "archived")


class MessageSerializer(ModelSerializer):
    class Meta:
        model = Message
        fields = "__all__"
        read_only_fields = ("author", "created_at")


class ChatListSerializer(ModelSerializer):
    last_text = serializers.CharField(read_only=True, allow_null=True, allow_blank=True)
    last_image_url = serializers.CharField(read_only=True, allow_null=True, allow_blank=True)
    last_created_at = serializers.DateTimeField(read_only=True, allow_null=True)
    last_role = serializers.CharField(read_only=True, allow_null=True, allow_blank=True)
    last_kind = serializers.CharField(read_only=True, allow_null=True, allow_blank=True)

    class Meta:
        model = Chat
        fields = [
            "id",
            "uuid",
            "owner",
            "model",
            "title",
            "pinned",
            "created_at",
            # annotated preview fields
            "last_text",
            "last_image_url",
            "last_created_at",
            "last_role",
            "last_kind",
        ]


class ChatViewSet(viewsets.ModelViewSet):
    serializer_class = ChatSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = 'uuid'

    def get_queryset(self):
        user = self.request.user
        base = Chat.objects.filter(owner=user, archived=False)
        latest = Message.objects.filter(chat_id=OuterRef('pk')).order_by('-created_at')
        qs = base.annotate(
            last_text=Subquery(latest.values('text')[:1]),
            last_image_url=Subquery(latest.values('image_url')[:1]),
            last_created_at=Subquery(latest.values('created_at')[:1]),
            last_role=Subquery(latest.values('role')[:1]),
            last_kind=Subquery(latest.values('kind')[:1]),
        ).order_by('-pinned', '-last_created_at', '-created_at')
        return qs

    def get_serializer_class(self):
        if getattr(self, 'action', None) == 'list':
            return ChatListSerializer
        return super().get_serializer_class()

    def destroy(self, request, *args, **kwargs):
        # Soft-delete: hide chat from the user, keep data in DB
        instance = self.get_object()
        if instance.owner_id != request.user.id:
            return Response(status=403)
        instance.archived = True
        instance.save(update_fields=["archived"])
        return Response(status=204)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class MessageViewSet(viewsets.ModelViewSet):
    serializer_class = MessageSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = Message.objects.filter(chat__owner=user, chat__archived=False).order_by("created_at")
        chat_id = self.request.query_params.get("chat")
        if chat_id:
            qs = qs.filter(chat_id=chat_id)
        return qs

    def perform_create(self, serializer):
        # Force author to current user and role to 'me' if not provided
        role = self.request.data.get("role")
        if role not in ("me", "model"):
            role = "me"
        serializer.save(author=self.request.user, role=role)


def sse_chat(request, uuid):
    """Very simple SSE stub to establish streaming plumbing.
    For now emits a couple of keepalive events and closes.
    """
    def event_stream():
        yield "event: info\n".encode()
        yield "data: ready\n\n".encode()
        for i in range(2):
            time.sleep(10)
            yield f"event: keepalive\n".encode()
            yield f"data: {int(time.time())}\n\n".encode()
    resp = StreamingHttpResponse(event_stream(), content_type='text/event-stream')
    resp['Cache-Control'] = 'no-cache'
    return resp
