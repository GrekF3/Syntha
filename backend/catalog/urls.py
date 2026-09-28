from django.urls import path, include
from rest_framework.routers import DefaultRouter
from catalog.views import ModelViewSet

router = DefaultRouter()
router.trailing_slash = '/?'
router.register(r"models", ModelViewSet, basename="model")

urlpatterns = [
    path('', include(router.urls)),
]
