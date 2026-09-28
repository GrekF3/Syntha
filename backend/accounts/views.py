from datetime import timedelta
from typing import Any, Dict, List

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.serializers import ModelSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from accounts.serializers import UserSerializer, RegisterSerializer
from conversations.models import Chat
from imaging.models import GeneratedImage
from core_api.models import UserNotification, UserSession, ReferralCode, Referral
import secrets

User = get_user_model()


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by("id")
    serializer_class = UserSerializer

    def list(self, request, *args, **kwargs):
        if not request.user.is_staff:
            return Response({"detail": "forbidden"}, status=status.HTTP_403_FORBIDDEN)
        return super().list(request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        if not request.user.is_staff:
            return Response({"detail": "forbidden"}, status=status.HTTP_403_FORBIDDEN)
        return super().retrieve(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if not request.user.is_staff:
            return Response({"detail": "forbidden"}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        if not request.user.is_staff:
            return Response({"detail": "forbidden"}, status=status.HTTP_403_FORBIDDEN)
        return super().partial_update(request, *args, **kwargs)

    @action(detail=False, methods=["get", "patch"], permission_classes=[IsAuthenticated])
    def me(self, request):
        if request.method.lower() == "patch":
            user = request.user
            display_name = request.data.get("display_name")
            nsfw_enabled = request.data.get("nsfw_enabled")
            two_factor_enabled = request.data.get("two_factor_enabled")
            changed_fields = []
            if display_name is not None:
                user.display_name = str(display_name)
                changed_fields.append("display_name")
            if nsfw_enabled is not None:
                user.nsfw_enabled = bool(nsfw_enabled in (True, "true", "1", 1))
                changed_fields.append("nsfw_enabled")
            if two_factor_enabled is not None:
                user.two_factor_enabled = bool(two_factor_enabled in (True, "true", "1", 1))
                changed_fields.append("two_factor_enabled")
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


# In-memory stores (dev/mock)
SESSIONS_STORE: Dict[int, List[Dict[str, Any]]] = {}
REVOKED_REFRESH_JTIS: set[str] = set()
DELETION_SCHEDULE: Dict[int, Dict[str, Any]] = {}


def _execute_deletion_if_due(user: User): # type: ignore
    sched = DELETION_SCHEDULE.get(user.id)
    if not sched:
        return
    delete_at = sched.get("delete_at")
    if not delete_at or timezone.now() < delete_at:
        return
    # Respect active subscription end
    sub_until = getattr(user, "subscription_until", None)
    if sub_until and timezone.now() < sub_until:
        sched["delete_at"] = sub_until
        return
    # Create placeholder user
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
    # Delete original user and clear schedule
    user.delete()
    DELETION_SCHEDULE.pop(user.id, None)


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
            if not jti:
                return response
            ua = request.META.get("HTTP_USER_AGENT", "")
            ip = request.META.get("REMOTE_ADDR") or request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip()
            # Upsert session
            sess, _ = UserSession.objects.get_or_create(jti=jti, defaults={
                'user_id': user_id,
                'device': (ua[:128] or 'Unknown'),
                'ip': ip or '',
            })
            if sess.user_id != user_id:
                sess.user_id = user_id
            sess.device = ua[:128] or 'Unknown'
            sess.ip = ip or ''
            sess.revoked = False
            sess.save(update_fields=['user', 'device', 'ip', 'revoked', 'last_active'])
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
                if jti:
                    sess = UserSession.objects.filter(jti=jti).first()
                    if sess and sess.revoked:
                        return Response({"detail": "session revoked"}, status=status.HTTP_401_UNAUTHORIZED)
        except Exception:
            pass
        response = super().post(request, *args, **kwargs)
        try:
            refresh = request.data.get("refresh")
            if refresh:
                rt = RefreshToken(refresh)
                jti = str(rt["jti"]) if "jti" in rt else None
                if jti:
                    UserSession.objects.filter(jti=jti).update(last_active=timezone.now())
        except Exception:
            pass
        return response


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
    # Optional referral attach (accept from body or query params)
    ref = (
        (request.data.get("ref") if hasattr(request, 'data') else None)
        or (request.data.get("ref_code") if hasattr(request, 'data') else None)
        or (request.query_params.get("ref") if hasattr(request, 'query_params') else None)
        or (request.query_params.get("ref_code") if hasattr(request, 'query_params') else None)
        or ""
    )
    ref = str(ref).strip()
    if ref:
        try:
            code = ReferralCode.objects.get(code=ref)
            if code.user_id != user.id:
                Referral.objects.get_or_create(inviter_id=code.user_id, invitee=user)
        except ReferralCode.DoesNotExist:
            pass
    return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([AllowAny])
def forgot_password(request):
    email = request.data.get("email")
    if not email:
        return Response({"email": ["required"]}, status=status.HTTP_400_BAD_REQUEST)
    return Response({"detail": "reset link sent"})


@api_view(["POST"])
@permission_classes([AllowAny])
def reset_password(request):
    token = request.data.get("token")
    new_password = request.data.get("new_password")
    if not token or not new_password:
        return Response({"detail": "token and new_password required"}, status=status.HTTP_400_BAD_REQUEST)
    try:
        validate_password(new_password)
    except ValidationError as e:
        return Response({"new_password": e.messages}, status=status.HTTP_400_BAD_REQUEST)
    return Response({"detail": "password updated"})


@api_view(["GET"])  # list current user's sessions
@permission_classes([IsAuthenticated])
def sessions_list(request):
    user = request.user
    ua = request.META.get("HTTP_USER_AGENT", "")
    ip = request.META.get("REMOTE_ADDR") or request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip()
    sessions = UserSession.objects.filter(user=user, revoked=False).order_by('-last_active')
    def is_current(s: UserSession):
        return (s.device or "")[:64] in ua and (not ip or s.ip == ip)
    out = [
        {"id": s.jti, "device": s.device, "ip": s.ip, "lastActive": s.last_active.isoformat(), "current": is_current(s)}
        for s in sessions
    ]
    return Response(out)


@api_view(["POST"])  # revoke by id (jti)
@permission_classes([IsAuthenticated])
def sessions_revoke(request, pk: str):
    user = request.user
    sess = UserSession.objects.filter(user=user, jti=pk, revoked=False).first()
    if not sess:
        return Response({"detail": "not found"}, status=status.HTTP_404_NOT_FOUND)
    sess.revoked = True
    sess.save(update_fields=['revoked'])
    return Response({"revoked": True})


@api_view(["POST"])  # revoke all except current
@permission_classes([IsAuthenticated])
def sessions_revoke_others(request):
    user = request.user
    ua = request.META.get("HTTP_USER_AGENT", "")
    ip = request.META.get("REMOTE_ADDR") or request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip()
    qs = UserSession.objects.filter(user=user, revoked=False)
    kept = 0
    revoked = 0
    for s in qs:
        if (s.device or "")[:64] in ua and (not ip or s.ip == ip):
            kept += 1
            continue
        s.revoked = True
        s.save(update_fields=['revoked'])
        revoked += 1
    return Response({"revoked": revoked, "kept": kept})


@api_view(["POST"])  # change password
@permission_classes([IsAuthenticated])
def change_password(request):
    user = request.user
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


# Account deletion scheduling (kept here)
@api_view(["POST"])  # schedule account deletion
@permission_classes([IsAuthenticated])
def account_delete(request):
    user = request.user
    reason = request.data.get("reason", "")
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


@api_view(["GET"])  # status
@permission_classes([IsAuthenticated])
def account_delete_status(request):
    user = request.user
    _execute_deletion_if_due(user)
    sched = DELETION_SCHEDULE.get(user.id)
    if not sched:
        return Response({"scheduled": False})
    return Response({"scheduled": True, "delete_at": sched.get("delete_at").isoformat(), "scheduled_at": sched.get("scheduled_at").isoformat()})


# ----------------------------
# Notifications API
# ----------------------------

@api_view(["GET"])  # list my notifications
@permission_classes([IsAuthenticated])
def notifications_list(request):
    user = request.user
    qs = UserNotification.objects.filter(user=user).order_by("-created_at")
    out = [
        {
            "id": n.id,
            "title": n.title,
            "body": n.body,
            "created_at": n.created_at.isoformat(),
            "unread": n.unread,
            "action": ({"label": n.action_label, "href": n.action_href} if (n.action_label and n.action_href) else None),
        }
        for n in qs
    ]
    return Response(out)


@api_view(["POST"])  # mark as read
@permission_classes([IsAuthenticated])
def notifications_mark_read(request, pk: int):
    user = request.user
    try:
        n = UserNotification.objects.get(id=pk, user=user)
    except UserNotification.DoesNotExist:
        return Response({"detail": "not found"}, status=status.HTTP_404_NOT_FOUND)
    if n.unread:
        n.unread = False
        n.save(update_fields=["unread"])
    return Response({"ok": True})


@api_view(["DELETE"])  # delete
@permission_classes([IsAuthenticated])
def notifications_delete(request, pk: int):
    user = request.user
    try:
        n = UserNotification.objects.get(id=pk, user=user)
    except UserNotification.DoesNotExist:
        return Response({"detail": "not found"}, status=status.HTTP_404_NOT_FOUND)
    n.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])  # broadcast to all users
@permission_classes([IsAuthenticated])
def notifications_broadcast(request):
    user = request.user
    if not user.is_staff:
        return Response({"detail": "forbidden"}, status=status.HTTP_403_FORBIDDEN)
    title = (request.data.get("title") or "").strip()
    body = (request.data.get("body") or "").strip()
    action_label = (request.data.get("action_label") or "").strip()
    action_href = (request.data.get("action_href") or "").strip()
    if not title:
        return Response({"title": ["required"]}, status=status.HTTP_400_BAD_REQUEST)
    users = User.objects.filter(is_active=True).only("id")
    objs = [
        UserNotification(
            user=u,
            title=title,
            body=body,
            action_label=action_label if (action_label and action_href) else "",
            action_href=action_href if (action_label and action_href) else "",
        )
        for u in users
    ]
    UserNotification.objects.bulk_create(objs, batch_size=1000)
    return Response({"sent": len(objs)})


# ----------------------------
# Referrals API
# ----------------------------

@api_view(["GET"])  # get or create my referral code
@permission_classes([IsAuthenticated])
def referral_code(request):
    user = request.user
    code_obj = ReferralCode.objects.filter(user=user).first()
    if not code_obj:
        # generate unique code
        for _ in range(5):
            candidate = secrets.token_urlsafe(6).replace('-', '').replace('_', '')[:10]
            if not ReferralCode.objects.filter(code=candidate).exists():
                code_obj = ReferralCode.objects.create(user=user, code=candidate)
                break
        if not code_obj:
            return Response({"detail": "cannot generate code"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    return Response({"code": code_obj.code})


@api_view(["GET"])  # summary of my referrals (placeholder earnings)
@permission_classes([IsAuthenticated])
def referral_summary(request):
    user = request.user
    total = Referral.objects.filter(inviter=user).count()
    # Placeholder earnings until payments integration (TODO)
    earnings = 0
    return Response({"total": total, "earnings": earnings})


@api_view(["GET"])  # list my invitees
@permission_classes([IsAuthenticated])
def referral_invitees(request):
    user = request.user
    refs = Referral.objects.filter(inviter=user).select_related('invitee').order_by('-created_at')
    out = []
    for r in refs:
        inv = r.invitee
        email = inv.email or inv.username
        masked = email
        try:
            if '@' in email:
                name, dom = email.split('@', 1)
                masked = (name[:2] + '***@' + dom)
        except Exception:
            pass
        out.append({
            'id': inv.id,
            'email': masked,
            'created_at': r.created_at.isoformat(),
        })
    return Response(out)
