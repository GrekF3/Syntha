from django.urls import path, include
from rest_framework.routers import DefaultRouter
from conversations.views import ChatViewSet, MessageViewSet, sse_chat

router = DefaultRouter()
router.trailing_slash = '/?'
router.register(r"chats", ChatViewSet, basename="chat")
router.register(r"messages", MessageViewSet, basename="message")

urlpatterns = [
    path('', include(router.urls)),
    path('stream/chat/<uuid:uuid>/', sse_chat, name='sse_chat'),
]
