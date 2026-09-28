from django.urls import path, include, re_path
from rest_framework.routers import DefaultRouter
from accounts.views import (
    UserViewSet,
    MyTokenObtainPairView,
    MyTokenRefreshView,
    register,
    forgot_password,
    reset_password,
    sessions_list,
    sessions_revoke,
    sessions_revoke_others,
    change_password,
    account_delete,
    account_delete_cancel,
    account_delete_status,
    notifications_list,
    notifications_mark_read,
    notifications_delete,
    notifications_broadcast,
    referral_code,
    referral_summary,
    referral_invitees,
)

router = DefaultRouter()
router.trailing_slash = '/?'
router.register(r"users", UserViewSet, basename="user")

urlpatterns = [
    path('', include(router.urls)),
    # JWT endpoints
    re_path(r'^token/?$', MyTokenObtainPairView.as_view(), name='token_obtain_pair'),
    re_path(r'^token/refresh/?$', MyTokenRefreshView.as_view(), name='token_refresh'),
    # Auth endpoints
    re_path(r'^auth/register/?$', register, name='auth_register'),
    re_path(r'^auth/forgot-password/?$', forgot_password, name='auth_forgot_password'),
    re_path(r'^auth/reset-password/?$', reset_password, name='auth_reset_password'),
    re_path(r'^auth/change-password/?$', change_password, name='auth_change_password'),
    re_path(r'^auth/sessions/?$', sessions_list, name='auth_sessions_list'),
    re_path(r'^auth/sessions/revoke-others/?$', sessions_revoke_others, name='auth_sessions_revoke_others'),
    re_path(r'^auth/sessions/(?P<pk>[^/]+)/revoke/?$', sessions_revoke, name='auth_sessions_revoke'),
    # Account deletion scheduling
    re_path(r'^account/delete/?$', account_delete, name='account_delete'),
    re_path(r'^account/delete/cancel/?$', account_delete_cancel, name='account_delete_cancel'),
    re_path(r'^account/delete/status/?$', account_delete_status, name='account_delete_status'),
    # Notifications
    re_path(r'^notifications/?$', notifications_list, name='notifications_list'),
    re_path(r'^notifications/(?P<pk>\d+)/read/?$', notifications_mark_read, name='notifications_mark_read'),
    re_path(r'^notifications/(?P<pk>\d+)/?$', notifications_delete, name='notifications_delete'),
    # Admin broadcast
    re_path(r'^admin/notifications/broadcast/?$', notifications_broadcast, name='notifications_broadcast'),
    # Referrals
    re_path(r'^referrals/code/?$', referral_code, name='referral_code'),
    re_path(r'^referrals/summary/?$', referral_summary, name='referral_summary'),
    re_path(r'^referrals/invitees/?$', referral_invitees, name='referral_invitees'),
]
