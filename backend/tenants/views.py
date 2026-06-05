from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated, BasePermission

from .models import Tenant, TenantMembership, App
from .serializers import (
    TenantSerializer,
    TenantMembershipSerializer,
    PlatformAppSerializer,
)


class MyTenantsView(APIView):
    """Returns tenants the current user belongs to, with their apps."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        memberships = TenantMembership.objects.filter(
            user=request.user, is_active=True
        ).select_related('tenant')

        tenants_data = []
        for m in memberships:
            tenant_data = TenantSerializer(m.tenant).data
            tenant_data['role'] = m.tenant_role
            tenants_data.append(tenant_data)

        return Response(tenants_data)


class IsPlatformAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_platform_admin)


class PlatformTenantViewSet(viewsets.ModelViewSet):
    permission_classes = [IsPlatformAdmin]
    serializer_class = TenantSerializer
    queryset = Tenant.objects.order_by('name')


class PlatformMembershipViewSet(viewsets.ModelViewSet):
    permission_classes = [IsPlatformAdmin]
    serializer_class = TenantMembershipSerializer
    queryset = TenantMembership.objects.select_related('user', 'tenant').order_by('tenant__name', 'user__email')


class PlatformAppViewSet(viewsets.ModelViewSet):
    permission_classes = [IsPlatformAdmin]
    serializer_class = PlatformAppSerializer

    def get_queryset(self):
        queryset = App.objects.select_related('tenant').order_by('tenant__name', 'name')
        tenant_id = self.request.query_params.get('tenant_id')
        if tenant_id:
            queryset = queryset.filter(tenant_id=tenant_id)
        return queryset
