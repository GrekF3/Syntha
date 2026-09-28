from rest_framework import viewsets, mixins, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from .models import User, AiModel, Chat, Message, GeneratedImage, Report, SupportTicket
from rest_framework.serializers import ModelSerializer
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.utils import timezone
from datetime import timedelta
from typing import Dict, Any, List

# JWT helpers and views
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.tokens import RefreshToken


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
            "is_active",
            "is_staff",
        ]


class AiModelSerializer(ModelSerializer):
    class Meta:
        model = AiModel
        fields = "__all__"


class ChatSerializer(ModelSerializer):
    class Meta:
        model = Chat
        fields = "__all__"


class MessageSerializer(ModelSerializer):
    class Meta:
        model = Message
        fields = "__all__"


class GeneratedImageSerializer(ModelSerializer):
    class Meta:
        model = GeneratedImage
        fields = "__all__"


class ReportSerializer(ModelSerializer):
    class Meta:
        model = Report
        fields = "__all__"


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by("id")
    serializer_class = UserSerializer

    @action(detail=False, methods=["get", "patch"], permission_classes=[IsAuthenticated])
    def me(self, request):
        if request.method.lower() == "patch":
            user = request.user
            display_name = request.data.get("display_name")
            nsfw_enabled = request.data.get("nsfw_enabled")
            changed_fields = []
            if display_name is not None:
                user.display_name = str(display_name)
                changed_fields.append("display_name")
            if nsfw_enabled is not None:
                # Accept truthy/falsey values
                user.nsfw_enabled = bool(nsfw_enabled in (True, "true", "1", 1))
                changed_fields.append("nsfw_enabled")
            if changed_fields:
                user.save(update_fields=changed_fields)
        return Response(self.get_serializer(request.user).data)

    @action(detail=True, methods=["post"])
    def toggle_nsfw(self, request, pk=None):
        user = self.get_object()
        user.nsfw_enabled = not user.nsfw_enabled
        user.save(update_fields=["nsfw_enabled"])
        return Response({"nsfw_enabled": user.nsfw_enabled})

    @action(detail=True, methods=["post"])
    def set_plan(self, request, pk=None):
        user = self.get_object()
        plan = request.data.get("plan")
        if plan not in ("free", "pro"):
            return Response({"detail": "invalid plan"}, status=status.HTTP_400_BAD_REQUEST)
        user.plan = plan
        user.save(update_fields=["plan"])
        return Response({"plan": user.plan})


class ModelViewSet(viewsets.ModelViewSet):
    queryset = AiModel.objects.all().order_by("-created_at")
    serializer_class = AiModelSerializer


class ChatViewSet(viewsets.ModelViewSet):
    queryset = Chat.objects.all().order_by("-created_at")
    serializer_class = ChatSerializer


class MessageViewSet(viewsets.ModelViewSet):
    queryset = Message.objects.all().order_by("-created_at")
    serializer_class = MessageSerializer


class ImageViewSet(viewsets.ModelViewSet):
    queryset = GeneratedImage.objects.all().order_by("-created_at")
    serializer_class = GeneratedImageSerializer

    @action(detail=True, methods=["post"])
    def mark_nsfw(self, request, pk=None):
        img = self.get_object()
        img.nsfw = True
        img.save(update_fields=["nsfw"])
        return Response({"nsfw": True})


class ReportViewSet(viewsets.ModelViewSet):
    queryset = Report.objects.all().order_by("-created_at")
    serializer_class = ReportSerializer


class SupportTicketSerializer(ModelSerializer):
    class Meta:
        model = SupportTicket
        fields = ["id", "user", "email", "subject", "message", "status", "created_at", "updated_at"]
        read_only_fields = ("status", "created_at", "updated_at")


class SupportTicketViewSet(viewsets.ModelViewSet):
    queryset = SupportTicket.objects.all().order_by("-created_at")
    serializer_class = SupportTicketSerializer

    def get_permissions(self):
        # Anyone can create; only staff can list/update/delete
        if self.action in ("create",):
            return [AllowAny()]
        return super().get_permissions()

    def list(self, request, *args, **kwargs):
        if not request.user.is_staff:
            return Response({"detail": "forbidden"}, status=status.HTTP_403_FORBIDDEN)
        return super().list(request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        if not request.user.is_staff:
            return Response({"detail": "forbidden"}, status=status.HTTP_403_FORBIDDEN)
        return super().retrieve(request, *args, **kwargs)

    def perform_create(self, serializer):
        user = self.request.user if self.request.user.is_authenticated else None
        serializer.save(user=user)

    def update(self, request, *args, **kwargs):
        if not request.user.is_staff:
            return Response({"detail": "forbidden"}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        if not request.user.is_staff:
            return Response({"detail": "forbidden"}, status=status.HTTP_403_FORBIDDEN)
        return super().partial_update(request, *args, **kwargs)

    @action(detail=False, methods=["get"], permission_classes=[IsAuthenticated])
    def mine(self, request):
        qs = SupportTicket.objects.filter(user=request.user).order_by("-created_at")
        return Response(SupportTicketSerializer(qs, many=True).data)


class RegisterSerializer(ModelSerializer):
    class Meta:
        model = User
        fields = ["username", "email", "password", "display_name"]
        extra_kwargs = {"password": {"write_only": True}}


@api_view(["POST"])
@permission_classes([AllowAny])
def register(request):
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    username = serializer.validated_data["username"]
    email = serializer.validated_data.get("email")
    password = serializer.validated_data["password"]
    display_name = serializer.validated_data.get("display_name", "")
    try:
        validate_password(password)
    except ValidationError as e:
        return Response({"password": e.messages}, status=status.HTTP_400_BAD_REQUEST)
    if User.objects.filter(username=username).exists():
        return Response({"username": ["already exists"]}, status=status.HTTP_400_BAD_REQUEST)
    user = User.objects.create_user(username=username, email=email, password=password)
    if display_name:
        user.display_name = display_name
        user.save(update_fields=["display_name"])
    return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([AllowAny])
def forgot_password(request):
    """Stub: accept email and pretend to send reset link."""
    email = request.data.get("email")
    if not email:
        return Response({"email": ["required"]}, status=status.HTTP_400_BAD_REQUEST)
    return Response({"detail": "reset link sent"})


@api_view(["POST"])
@permission_classes([AllowAny])
def reset_password(request):
    """Stub: accept token and new_password, validate and respond."""
    token = request.data.get("token")
    new_password = request.data.get("new_password")
    if not token or not new_password:
        return Response({"detail": "token and new_password required"}, status=status.HTTP_400_BAD_REQUEST)
    try:
        validate_password(new_password)
    except ValidationError as e:
        return Response({"new_password": e.messages}, status=status.HTTP_400_BAD_REQUEST)
    # In real impl: find user by token and set_password
    return Response({"detail": "password updated"})


# ------------------------
# In-memory stores (dev/mock)
# ------------------------
SESSIONS_STORE: Dict[int, List[Dict[str, Any]]] = {}
REVOKED_REFRESH_JTIS: set[str] = set()
DELETION_SCHEDULE: Dict[int, Dict[str, Any]] = {}


class MyTokenObtainPairView(TokenObtainPairView):
    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        try:
            data = response.data
            refresh = data.get("refresh")
            if not refresh:
                return response
            rt = RefreshToken(refresh)
            user_id = int(rt["user_id"]) if "user_id" in rt else None
            if not user_id:
                return response
            jti = str(rt["jti"]) if "jti" in rt else None
            ua = request.META.get("HTTP_USER_AGENT", "")
            ip = request.META.get("REMOTE_ADDR") or request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip()
            sess = {
                "id": jti,
                "device": ua[:64] or "Unknown",
                "ip": ip or "",
                "last_active": timezone.now().isoformat(),
            }
            SESSIONS_STORE.setdefault(user_id, [])
            # Remove existing with same id if any (unlikely)
            SESSIONS_STORE[user_id] = [s for s in SESSIONS_STORE[user_id] if s.get("id") != jti]
            SESSIONS_STORE[user_id].append(sess)
        except Exception:
            pass
        return response


class MyTokenRefreshView(TokenRefreshView):
    def post(self, request, *args, **kwargs):
        try:
            refresh = request.data.get("refresh")
            if refresh:
                rt = RefreshToken(refresh)
                jti = str(rt["jti"]) if "jti" in rt else None
                if jti and jti in REVOKED_REFRESH_JTIS:
                    return Response({"detail": "session revoked"}, status=status.HTTP_401_UNAUTHORIZED)
        except Exception:
            pass
        response = super().post(request, *args, **kwargs)
        # Update last_active if we can
        try:
            refresh = request.data.get("refresh")
            if refresh:
                rt = RefreshToken(refresh)
                jti = str(rt["jti"]) if "jti" in rt else None
                user_id = int(rt["user_id"]) if "user_id" in rt else None
                if user_id and jti and user_id in SESSIONS_STORE:
                    for s in SESSIONS_STORE.get(user_id, []):
                        if s.get("id") == jti:
                            s["last_active"] = timezone.now().isoformat()
                            break
        except Exception:
            pass
        return response


def _ensure_not_due_delete(user: User):
    # If deletion due, perform it lazily on access
    sched = DELETION_SCHEDULE.get(user.id)
    if not sched:
        return
    delete_at = sched.get("delete_at")
    if not delete_at or timezone.now() < delete_at:
        return
    # Check subscription_until if present
    sub_until = getattr(user, "subscription_until", None)
    if sub_until and timezone.now() < sub_until:
        # postpone until sub end
        sched["delete_at"] = sub_until
        return
    # Execute deletion: reassign Chats and GeneratedImages to placeholder user
    base_username = f"DeletedAccount_{user.username}"[:150]
    candidate = base_username
    n = 1
    while User.objects.filter(username=candidate).exists():
        suffix = f"_{n}"
        candidate = (base_username[: 150 - len(suffix)]) + suffix
        n += 1
    placeholder = User.objects.create(
        username=candidate,
        email="",
        is_active=False,
        display_name=candidate,
    )
    # Reassign objects
    Chat.objects.filter(owner=user).update(owner=placeholder)
    GeneratedImage.objects.filter(user=user).update(user=placeholder)
    # Finally delete the user and clear schedule
    user.delete()
    DELETION_SCHEDULE.pop(user.id, None)


@api_view(["GET"])  # list current user's sessions
@permission_classes([IsAuthenticated])
def sessions_list(request):
    user = request.user
    _ensure_not_due_delete(user)
    sessions = SESSIONS_STORE.get(user.id, [])
    ua = request.META.get("HTTP_USER_AGENT", "")
    ip = request.META.get("REMOTE_ADDR") or request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip()
    def is_current(s):
        # Approximate current session by UA and IP match
        return (s.get("device", "") in ua) and (not ip or s.get("ip") == ip)
    out = [
        {"id": s.get("id"), "device": s.get("device"), "ip": s.get("ip"), "lastActive": s.get("last_active"), "current": is_current(s)}
        for s in sessions
    ]
    return Response(out)


@api_view(["POST"])  # revoke by id
@permission_classes([IsAuthenticated])
def sessions_revoke(request, pk: str):
    user = request.user
    _ensure_not_due_delete(user)
    sessions = SESSIONS_STORE.get(user.id, [])
    found = None
    for s in sessions:
        if s.get("id") == pk:
            found = s
            break
    if not found:
        return Response({"detail": "not found"}, status=status.HTTP_404_NOT_FOUND)
    if pk:
        REVOKED_REFRESH_JTIS.add(pk)
    SESSIONS_STORE[user.id] = [s for s in sessions if s.get("id") != pk]
    return Response({"revoked": True})


@api_view(["POST"])  # revoke all except current
@permission_classes([IsAuthenticated])
def sessions_revoke_others(request):
    user = request.user
    _ensure_not_due_delete(user)
    sessions = SESSIONS_STORE.get(user.id, [])
    ua = request.META.get("HTTP_USER_AGENT", "")
    ip = request.META.get("REMOTE_ADDR") or request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip()
    keep = []
    revoke = []
    for s in sessions:
        if (s.get("device", "") in ua) and (not ip or s.get("ip") == ip):
            keep.append(s)
        else:
            revoke.append(s)
    for s in revoke:
        if s.get("id"):
            REVOKED_REFRESH_JTIS.add(s["id"])
    SESSIONS_STORE[user.id] = keep
    return Response({"revoked": len(revoke)})


@api_view(["POST"])  # change password
@permission_classes([IsAuthenticated])
def change_password(request):
    user = request.user
    _ensure_not_due_delete(user)
    current = request.data.get("current_password")
    new = request.data.get("new_password")
    if not current or not new:
        return Response({"detail": "current_password and new_password required"}, status=status.HTTP_400_BAD_REQUEST)
    if not user.check_password(current):
        return Response({"current_password": ["invalid"]}, status=status.HTTP_400_BAD_REQUEST)
    try:
        validate_password(new, user)
    except ValidationError as e:
        return Response({"new_password": e.messages}, status=status.HTTP_400_BAD_REQUEST)
    user.set_password(new)
    user.save(update_fields=["password"])
    return Response({"detail": "password changed"})


@api_view(["POST"])  # activate mock subscription (30 days)
@permission_classes([IsAuthenticated])
def subscribe_activate(request):
    user = request.user
    _ensure_not_due_delete(user)
    user.plan = "pro"
    # set or extend subscription_until for 30 days
    until = getattr(user, "subscription_until", None)
    now = timezone.now()
    base = until if until and until > now else now
    new_until = base + timedelta(days=30)
    # Persist: add field dynamically if exists
    try:
        user.subscription_until = new_until
        user.save(update_fields=["plan", "subscription_until"])
    except Exception:
        user.save(update_fields=["plan"])  # in case field doesn't exist yet
    return Response({"plan": user.plan, "until": new_until.isoformat()})


@api_view(["POST"])  # cancel subscription
@permission_classes([IsAuthenticated])
def subscribe_cancel(request):
    user = request.user
    _ensure_not_due_delete(user)
    user.plan = "free"
    try:
        user.subscription_until = None
        user.save(update_fields=["plan", "subscription_until"])
    except Exception:
        user.save(update_fields=["plan"])
    return Response({"plan": user.plan})


@api_view(["POST"])  # schedule account deletion
@permission_classes([IsAuthenticated])
def account_delete(request):
    user = request.user
    reason = request.data.get("reason", "")
    # compute deletion date: default +7d or end of subscription if later
    now = timezone.now()
    delete_at = now + timedelta(days=7)
    sub_until = getattr(user, "subscription_until", None)
    if sub_until and sub_until > delete_at:
        delete_at = sub_until
    DELETION_SCHEDULE[user.id] = {
        "scheduled_at": now,
        "delete_at": delete_at,
        "reason": reason,
    }
    return Response({"scheduled": True, "delete_at": delete_at.isoformat()})


@api_view(["POST"])  # cancel scheduled deletion
@permission_classes([IsAuthenticated])
def account_delete_cancel(request):
    user = request.user
    DELETION_SCHEDULE.pop(user.id, None)
    return Response({"cancelled": True})


@api_view(["GET"])  # status (also lazily execute if due)
@permission_classes([IsAuthenticated])
def account_delete_status(request):
    user = request.user
    _ensure_not_due_delete(user)
    sched = DELETION_SCHEDULE.get(user.id)
    if not sched:
        return Response({"scheduled": False})
    return Response({"scheduled": True, "delete_at": sched.get("delete_at").isoformat(), "scheduled_at": sched.get("scheduled_at").isoformat()})
