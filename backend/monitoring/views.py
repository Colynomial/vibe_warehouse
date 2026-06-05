from datetime import timedelta

from django.db.models import Avg, Count, Q
from django.db.models.functions import TruncDay, TruncHour, TruncMonth
from django.utils import timezone
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import User
from tenants.models import Tenant, App
from warehouse.models import IngestionRun
from .models import APIRequestLog


class IsPlatformAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_platform_admin)


class MonitoringOverviewView(APIView):
    permission_classes = [IsPlatformAdmin]

    def get(self, request):
        range_key = request.query_params.get('range', '24h')
        tenant_id = request.query_params.get('tenant_id')
        user_id = request.query_params.get('user_id')
        app_id = request.query_params.get('app_id')

        # Apps are tenant-scoped. App filter resolves to tenant filter.
        if app_id and not tenant_id:
            app_tenant_id = App.objects.filter(id=app_id).values_list('tenant_id', flat=True).first()
            if app_tenant_id:
                tenant_id = str(app_tenant_id)

        now = timezone.now()
        if range_key == '7d':
            start = now - timedelta(days=7)
            trunc_fn = TruncDay
        elif range_key == '1y':
            start = now - timedelta(days=365)
            trunc_fn = TruncMonth
        else:
            start = now - timedelta(hours=24)
            trunc_fn = TruncHour

        logs = APIRequestLog.objects.filter(timestamp__gte=start)
        if tenant_id:
            logs = logs.filter(tenant_id=tenant_id)
        if user_id:
            logs = logs.filter(user_id=user_id)

        summary = logs.aggregate(
            requests=Count('id'),
            avg_duration_ms=Avg('duration_ms'),
            errors=Count('id', filter=Q(status_code__gte=400)),
        )

        total_requests = summary['requests'] or 0
        error_count = summary['errors'] or 0
        success_rate = round(((total_requests - error_count) / total_requests) * 100, 2) if total_requests else 100.0

        series_qs = (
            logs.annotate(bucket=trunc_fn('timestamp'))
            .values('bucket')
            .annotate(
                requests=Count('id'),
                errors=Count('id', filter=Q(status_code__gte=400)),
                avg_duration_ms=Avg('duration_ms'),
            )
            .order_by('bucket')
        )
        series = [
            {
                'bucket': row['bucket'].isoformat() if row['bucket'] else None,
                'requests': row['requests'],
                'errors': row['errors'],
                'avg_duration_ms': round(row['avg_duration_ms'] or 0, 2),
            }
            for row in series_qs
        ]

        top_endpoints = (
            logs.values('endpoint', 'method')
            .annotate(requests=Count('id'), avg_duration_ms=Avg('duration_ms'))
            .order_by('-requests')[:10]
        )

        runs = IngestionRun.objects.filter(started_at__gte=start, resource__connector__tenant__isnull=False)
        if tenant_id:
            runs = runs.filter(resource__connector__tenant_id=tenant_id)

        ingestion = runs.aggregate(
            total=Count('id'),
            running=Count('id', filter=Q(status='running')),
            failed=Count('id', filter=Q(status='failed')),
            success=Count('id', filter=Q(status='success')),
        )

        filters = {
            'tenants': list(Tenant.objects.order_by('name').values('id', 'name', 'slug')),
            'users': list(User.objects.order_by('email').values('id', 'email', 'first_name', 'last_name')),
            'apps': list(
                App.objects.filter(is_active=True)
                .select_related('tenant')
                .order_by('tenant__name', 'name')
                .values('id', 'name', 'slug', 'tenant_id', 'tenant__name')
            ),
        }

        return Response({
            'range': range_key,
            'start': start.isoformat(),
            'end': now.isoformat(),
            'summary': {
                'requests': total_requests,
                'avg_duration_ms': round(summary['avg_duration_ms'] or 0, 2),
                'errors': error_count,
                'success_rate': success_rate,
                'ingestion_runs': ingestion['total'] or 0,
                'ingestion_running': ingestion['running'] or 0,
                'ingestion_failed': ingestion['failed'] or 0,
                'ingestion_success': ingestion['success'] or 0,
            },
            'series': series,
            'top_endpoints': [
                {
                    'endpoint': row['endpoint'],
                    'method': row['method'],
                    'requests': row['requests'],
                    'avg_duration_ms': round(row['avg_duration_ms'] or 0, 2),
                }
                for row in top_endpoints
            ],
            'filters': filters,
        })
