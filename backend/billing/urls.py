from django.urls import path, include, re_path
from rest_framework.routers import DefaultRouter
from billing.views import subscribe_activate, subscribe_cancel

router = DefaultRouter()
router.trailing_slash = '/?'

urlpatterns = [
    path('', include(router.urls)),
    re_path(r'^subscription/activate/?$', subscribe_activate, name='subscription_activate'),
    re_path(r'^subscription/cancel/?$', subscribe_cancel, name='subscription_cancel'),
]
