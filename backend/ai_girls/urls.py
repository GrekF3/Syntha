"""
URL configuration for ai_girls project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static

from rest_framework.routers import DefaultRouter

urlpatterns = [
    path('godjadmin/', admin.site.urls),
    # Versioned mounts only
    path('api/v1/', include('accounts.urls')),
    path('api/v1/', include('catalog.urls')),
    path('api/v1/', include('conversations.urls')),
    path('api/v1/', include('imaging.urls')),
    path('api/v1/', include('support.urls')),
    path('api/v1/', include('moderation.urls')),
    path('api/v1/', include('billing.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
