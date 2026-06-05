from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import TenantMembership
from .serializers import TenantSerializer


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
