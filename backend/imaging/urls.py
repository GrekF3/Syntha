from django.urls import path, include, re_path
from rest_framework.routers import DefaultRouter
from imaging.views import ImageViewSet, generate, ImageJobViewSet

router = DefaultRouter()
router.trailing_slash = '/?'
router.register(r"images", ImageViewSet, basename="image")
router.register(r"image-jobs", ImageJobViewSet, basename="imagejob")

urlpatterns = [
    path('', include(router.urls)),
    re_path(r'^images/generate/?$', generate, name='images_generate'),
]
