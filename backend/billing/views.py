from datetime import timedelta

from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response


@api_view(["POST"])  # activate mock subscription (30 days)
@permission_classes([IsAuthenticated])
def subscribe_activate(request):
    user = request.user
    user.plan = "pro"
    until = getattr(user, "subscription_until", None)
    now = timezone.now()
    base = until if until and until > now else now
    new_until = base + timedelta(days=30)
    try:
        user.subscription_until = new_until
        user.save(update_fields=["plan", "subscription_until"])
    except Exception:
        user.save(update_fields=["plan"])
    return Response({"plan": user.plan, "until": new_until.isoformat()})


@api_view(["POST"])  # cancel subscription
@permission_classes([IsAuthenticated])
def subscribe_cancel(request):
    user = request.user
    user.plan = "free"
    try:
        user.subscription_until = None
        user.save(update_fields=["plan", "subscription_until"])
    except Exception:
        user.save(update_fields=["plan"])
    return Response({"plan": user.plan})

