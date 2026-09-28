from django.urls import path, include
from rest_framework.routers import DefaultRouter
from support.views import SupportTicketViewSet

router = DefaultRouter()
router.trailing_slash = '/?'
router.register(r"support", SupportTicketViewSet, basename="support")

urlpatterns = [
    path('', include(router.urls)),
]
