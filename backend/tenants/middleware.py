from django.utils.deprecation import MiddlewareMixin


class TenantMiddleware(MiddlewareMixin):
    """
    Resolves tenant from request.
    For local dev: uses X-Tenant-Slug header.
    For production: will use subdomain.
    """

    def process_request(self, request):
        from .models import Tenant

        # Try header first (local dev)
        tenant_slug = request.headers.get('X-Tenant-Slug')

        # Try subdomain
        if not tenant_slug:
            host = request.get_host().split(':')[0]
            parts = host.split('.')
            if len(parts) >= 3:
                tenant_slug = parts[0]

        request.tenant = None
        if tenant_slug:
            try:
                request.tenant = Tenant.objects.get(slug=tenant_slug, is_active=True)
            except Tenant.DoesNotExist:
                pass
