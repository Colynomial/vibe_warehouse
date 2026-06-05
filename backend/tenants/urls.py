from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    MyTenantsView,
    PlatformTenantViewSet,
    PlatformMembershipViewSet,
    PlatformAppViewSet,
)

router = DefaultRouter()
router.register('platform/tenants', PlatformTenantViewSet, basename='platform-tenants')
router.register('platform/memberships', PlatformMembershipViewSet, basename='platform-memberships')
router.register('platform/apps', PlatformAppViewSet, basename='platform-apps')

urlpatterns = [
    path('mine/', MyTenantsView.as_view(), name='my-tenants'),
    path('', include(router.urls)),
]
