from django.urls import path, include
from rest_framework.routers import DefaultRouter
from moderation.views import ReportViewSet

router = DefaultRouter()
router.trailing_slash = '/?'
router.register(r"reports", ReportViewSet, basename="report")

urlpatterns = [
    path('', include(router.urls)),
]
