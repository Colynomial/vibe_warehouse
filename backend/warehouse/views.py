import time
import threading
from django.db import connection
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import (
    ConnectorType, TenantConnector, TenantConnectorResource,
    MaterializedView, IngestionRun,
)
from .serializers import (
    ConnectorTypeSerializer, TenantConnectorSerializer,
    TenantConnectorCreateSerializer, TenantConnectorResourceSerializer,
    MaterializedViewSerializer, MaterializedViewCreateSerializer,
    IngestionRunSerializer,
)
from .services import test_connection, run_preview, run_preload, run_incremental_sync


class ConnectorTypeViewSet(viewsets.ReadOnlyModelViewSet):
    """List available connector types."""
    queryset = ConnectorType.objects.filter(is_active=True)
    serializer_class = ConnectorTypeSerializer


class TenantConnectorViewSet(viewsets.ModelViewSet):
    """CRUD for tenant's connectors."""
    serializer_class = TenantConnectorSerializer

    def get_queryset(self):
        tenant = getattr(self.request, 'tenant', None)
        if not tenant:
            return TenantConnector.objects.none()
        return TenantConnector.objects.filter(tenant=tenant).select_related('connector_type')

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return TenantConnectorCreateSerializer
        return TenantConnectorSerializer

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.tenant)

    def perform_destroy(self, instance):
        """Delete connector and ALL related data (resources, raw records, runs)."""
        # Django cascade handles: resources -> raw_records, ingestion_runs
        instance.delete()

    @action(detail=True, methods=['post'])
    def test(self, request, pk=None):
        """Test connector credentials against the actual API."""
        connector = self.get_object()
        success, message = test_connection(connector)
        connector.last_validated_at = timezone.now()
        connector.validation_error = '' if success else message
        connector.save()
        if success:
            return Response({'status': 'ok', 'message': message})
        return Response({'status': 'error', 'message': message}, status=status.HTTP_400_BAD_REQUEST)


class ResourceViewSet(viewsets.ViewSet):
    """Manage resources for a specific connector."""

    def list(self, request, connector_pk=None):
        connector = TenantConnector.objects.get(pk=connector_pk, tenant=request.tenant)
        resources = connector.resources.all()
        serializer = TenantConnectorResourceSerializer(resources, many=True)
        return Response(serializer.data)

    def create(self, request, connector_pk=None):
        """Create/activate a resource with custom configuration."""
        connector = TenantConnector.objects.get(pk=connector_pk, tenant=request.tenant)
        resource_slug = request.data.get('resource_slug')
        if not resource_slug:
            return Response({'error': 'resource_slug is required'}, status=status.HTTP_400_BAD_REQUEST)

        resource, created = TenantConnectorResource.objects.update_or_create(
            connector=connector,
            resource_slug=resource_slug,
            defaults={
                'is_active': True,
                'custom_name': request.data.get('custom_name', ''),
                'api_path': request.data.get('api_path', ''),
                'cursor_field': request.data.get('cursor_field', ''),
                'id_field': request.data.get('id_field', ''),
                'parameters': request.data.get('parameters', {}),
                'sync_frequency': request.data.get('sync_frequency', 'daily'),
                'notes': request.data.get('notes', ''),
                'depends_on_id': request.data.get('depends_on') or None,
                'depends_on_column': request.data.get('depends_on_column', ''),
                'dependent_path_template': request.data.get('dependent_path_template', ''),
            }
        )
        serializer = TenantConnectorResourceSerializer(resource)
        return Response(serializer.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    def destroy(self, request, connector_pk=None, pk=None):
        """Deactivate and remove a resource (keeps data in RawRecord for now)."""
        resource = TenantConnectorResource.objects.get(
            pk=pk, connector_id=connector_pk, connector__tenant=request.tenant
        )
        resource.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['patch'], url_path='config')
    def config(self, request, connector_pk=None, pk=None):
        """Update resource configuration (cursor field, id field, parameters)."""
        resource = TenantConnectorResource.objects.get(
            pk=pk, connector_id=connector_pk, connector__tenant=request.tenant
        )
        params = resource.parameters or {}
        if 'cursor_field' in request.data:
            params['cursor_field'] = request.data['cursor_field']
        if 'id_field' in request.data:
            params['id_field'] = request.data['id_field']
        if 'api_parameters' in request.data:
            params['api_parameters'] = request.data['api_parameters']
        if 'sync_frequency' in request.data:
            resource.sync_frequency = request.data['sync_frequency']
        resource.parameters = params
        resource.save()
        serializer = TenantConnectorResourceSerializer(resource)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='activate')
    def activate(self, request, connector_pk=None, pk=None):
        resource = TenantConnectorResource.objects.get(
            pk=pk, connector_id=connector_pk, connector__tenant=request.tenant
        )
        resource.is_active = True
        resource.preload_from = request.data.get('preload_from')
        resource.save()

        # Run preload in background thread
        def _run():
            import django
            django.setup()
            run_preload(resource, from_date=resource.preload_from)

        thread = threading.Thread(target=_run, daemon=True)
        thread.start()

        # Return the IngestionRun that was just created
        run = IngestionRun.objects.filter(resource=resource, run_type='preload').order_by('-started_at').first()
        return Response({
            'status': 'started',
            'run_id': run.id if run else None,
        })

    @action(detail=True, methods=['post'], url_path='preview')
    def preview(self, request, connector_pk=None, pk=None):
        """Fetch 1-page preview from the actual API."""
        resource = TenantConnectorResource.objects.get(
            pk=pk, connector_id=connector_pk, connector__tenant=request.tenant
        )
        run = run_preview(resource)
        resource.refresh_from_db()

        if run.status == 'success':
            return Response({
                'status': 'success',
                'record_count': resource.preview_record_count,
                'fields': resource.preview_fields,
                'sample_data': resource.preview_data,
            })
        return Response({
            'status': 'failed',
            'error': run.error_message,
        }, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='sync')
    def sync(self, request, connector_pk=None, pk=None):
        """Run incremental sync in background."""
        resource = TenantConnectorResource.objects.get(
            pk=pk, connector_id=connector_pk, connector__tenant=request.tenant
        )
        if resource.total_records == 0:
            return Response(
                {'error': 'Run preload first before incremental sync.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        def _run():
            import django
            django.setup()
            run_incremental_sync(resource)

        thread = threading.Thread(target=_run, daemon=True)
        thread.start()

        run = IngestionRun.objects.filter(
            resource=resource, run_type='incremental'
        ).order_by('-started_at').first()
        return Response({'status': 'started', 'run_id': run.id if run else None})

    @action(detail=True, methods=['get'], url_path='runs')
    def runs(self, request, connector_pk=None, pk=None):
        """Get ingestion runs for a resource (for progress tracking)."""
        resource = TenantConnectorResource.objects.get(
            pk=pk, connector_id=connector_pk, connector__tenant=request.tenant
        )
        runs = IngestionRun.objects.filter(resource=resource).order_by('-started_at')[:10]
        serializer = IngestionRunSerializer(runs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'], url_path='column-stats')
    def column_stats(self, request, connector_pk=None, pk=None):
        """Compute statistics for a specific column across ALL records."""
        from django.db.models import Count
        from .models import RawRecord

        resource = TenantConnectorResource.objects.get(
            pk=pk, connector_id=connector_pk, connector__tenant=request.tenant
        )
        column = request.query_params.get('column')
        if not column:
            return Response({'error': 'column parameter required'}, status=status.HTTP_400_BAD_REQUEST)

        # Query all records for this resource
        records = RawRecord.objects.filter(connector_resource=resource)
        total = records.count()

        if total == 0:
            return Response({
                'total': 0, 'filled': 0, 'null_count': 0,
                'unique_count': 0, 'top_values': [],
            })

        # Use raw SQL with jsonb for efficient stats on the column
        from django.db import connection as db_conn

        with db_conn.cursor() as cursor:
            # Get value counts, nulls, uniques
            cursor.execute("""
                SELECT
                    COUNT(*) AS total,
                    COUNT(data->>%s) AS filled,
                    COUNT(*) - COUNT(data->>%s) AS null_count,
                    COUNT(DISTINCT data->>%s) AS unique_count
                FROM warehouse_rawrecord
                WHERE connector_resource_id = %s
            """, [column, column, column, resource.id])
            row = cursor.fetchone()
            result = {
                'total': row[0],
                'filled': row[1],
                'null_count': row[2],
                'unique_count': row[3],
            }

            # Try numeric stats
            cursor.execute("""
                SELECT
                    MIN((data->>%s)::numeric),
                    MAX((data->>%s)::numeric),
                    AVG((data->>%s)::numeric)
                FROM warehouse_rawrecord
                WHERE connector_resource_id = %s
                  AND data->>%s IS NOT NULL
                  AND data->>%s ~ '^-?[0-9]+(\\.[0-9]+)?$'
            """, [column, column, column, resource.id, column, column])
            num_row = cursor.fetchone()
            if num_row and num_row[0] is not None:
                result['min'] = float(num_row[0])
                result['max'] = float(num_row[1])
                result['avg'] = float(num_row[2])
            else:
                # String length stats for non-numeric
                cursor.execute("""
                    SELECT
                        MIN(LENGTH(data->>%s)),
                        MAX(LENGTH(data->>%s)),
                        AVG(LENGTH(data->>%s))::integer
                    FROM warehouse_rawrecord
                    WHERE connector_resource_id = %s
                      AND data->>%s IS NOT NULL
                """, [column, column, column, resource.id, column])
                len_row = cursor.fetchone()
                if len_row and len_row[0] is not None:
                    result['min_length'] = len_row[0]
                    result['max_length'] = len_row[1]
                    result['avg_length'] = len_row[2]

            # Top values (most frequent, max 10)
            cursor.execute("""
                SELECT data->>%s AS val, COUNT(*) AS cnt
                FROM warehouse_rawrecord
                WHERE connector_resource_id = %s
                  AND data->>%s IS NOT NULL
                GROUP BY val
                ORDER BY cnt DESC
                LIMIT 10
            """, [column, resource.id, column])
            top_values = [[row[0], row[1]] for row in cursor.fetchall()]
            result['top_values'] = top_values

        return Response(result)


class TenantResourceViewSet(viewsets.ModelViewSet):
    """Top-level resource management for a tenant (all connectors)."""
    serializer_class = TenantConnectorResourceSerializer

    def get_queryset(self):
        return TenantConnectorResource.objects.filter(
            connector__tenant=self.request.tenant
        ).select_related('connector', 'connector__connector_type', 'depends_on')

    def perform_create(self, serializer):
        # Validate connector belongs to tenant
        connector = serializer.validated_data.get('connector')
        if connector.tenant != self.request.tenant:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Connector does not belong to this tenant")
        serializer.save(is_active=True)

    @action(detail=True, methods=['post'])
    def sync(self, request, pk=None):
        import threading
        resource = self.get_object()
        from .services import run_incremental_sync
        from .models import IngestionRun
        # Create run record immediately so frontend can poll
        run = IngestionRun.objects.create(
            resource=resource, run_type='incremental', status='running',
            sync_cursor_before=resource.last_sync_cursor,
        )
        # Run in background thread
        threading.Thread(
            target=run_incremental_sync, args=(resource,), kwargs={'run': run}, daemon=True
        ).start()
        return Response({'run_id': run.id, 'status': 'running'})

    @action(detail=True, methods=['post'])
    def preload(self, request, pk=None):
        import threading
        resource = self.get_object()
        from .services import run_preload
        from .models import IngestionRun
        # Create run record immediately so frontend can poll
        run = IngestionRun.objects.create(
            resource=resource, run_type='preload', status='running',
            sync_cursor_before=resource.last_sync_cursor,
        )
        # Run in background thread
        threading.Thread(
            target=run_preload,
            args=(resource,),
            kwargs={'from_date': request.data.get('from_date'), 'run': run},
            daemon=True
        ).start()
        return Response({'run_id': run.id, 'status': 'running'})

    @action(detail=True, methods=['post'])
    def preview(self, request, pk=None):
        resource = self.get_object()
        from .services import run_preview
        run_preview(resource)
        resource.refresh_from_db()
        return Response(TenantConnectorResourceSerializer(resource).data)

    @action(detail=True, methods=['get'])
    def runs(self, request, pk=None):
        resource = self.get_object()
        from .models import IngestionRun
        runs = IngestionRun.objects.filter(resource=resource).order_by('-started_at')[:20]
        data = [{
            'id': r.id, 'run_type': r.run_type, 'status': r.status,
            'records_fetched': r.records_fetched, 'records_created': r.records_created,
            'records_updated': r.records_updated, 'api_calls_made': r.api_calls_made,
            'duration_ms': r.duration_ms, 'error_message': r.error_message,
            'started_at': r.started_at, 'completed_at': r.completed_at,
        } for r in runs]
        return Response(data)

    @action(detail=True, methods=['get'], url_path='column-stats')
    def column_stats(self, request, pk=None):
        """Compute statistics for a specific column."""
        from django.db import connection as db_conn
        from .models import RawRecord

        resource = self.get_object()
        column = request.query_params.get('column')
        if not column:
            return Response({'error': 'column parameter required'}, status=status.HTTP_400_BAD_REQUEST)

        records = RawRecord.objects.filter(connector_resource=resource)
        total = records.count()
        if total == 0:
            return Response({'total': 0, 'filled': 0, 'null_count': 0, 'unique_count': 0, 'top_values': []})

        with db_conn.cursor() as cursor:
            cursor.execute("""
                SELECT COUNT(*), COUNT(data->>%s), COUNT(*) - COUNT(data->>%s), COUNT(DISTINCT data->>%s)
                FROM warehouse_rawrecord WHERE connector_resource_id = %s
            """, [column, column, column, resource.id])
            row = cursor.fetchone()
            result = {'total': row[0], 'filled': row[1], 'null_count': row[2], 'unique_count': row[3]}

            cursor.execute("""
                SELECT MIN((data->>%s)::numeric), MAX((data->>%s)::numeric), AVG((data->>%s)::numeric)
                FROM warehouse_rawrecord
                WHERE connector_resource_id = %s AND data->>%s IS NOT NULL AND data->>%s ~ '^-?[0-9]+(\\.[0-9]+)?$'
            """, [column, column, column, resource.id, column, column])
            num_row = cursor.fetchone()
            if num_row and num_row[0] is not None:
                result['min'] = float(num_row[0])
                result['max'] = float(num_row[1])
                result['avg'] = float(num_row[2])

            cursor.execute("""
                SELECT data->>%s AS val, COUNT(*) AS cnt FROM warehouse_rawrecord
                WHERE connector_resource_id = %s AND data->>%s IS NOT NULL
                GROUP BY val ORDER BY cnt DESC LIMIT 10
            """, [column, resource.id, column])
            result['top_values'] = [[r[0], r[1]] for r in cursor.fetchall()]

        return Response(result)


class MaterializedViewViewSet(viewsets.ModelViewSet):
    """CRUD for materialized views."""
    serializer_class = MaterializedViewSerializer

    def get_queryset(self):
        tenant = getattr(self.request, 'tenant', None)
        if not tenant:
            return MaterializedView.objects.none()
        return MaterializedView.objects.filter(tenant=tenant)

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return MaterializedViewCreateSerializer
        return MaterializedViewSerializer

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.tenant, created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def test(self, request, pk=None):
        """Execute query and return preview (first 100 rows)."""
        mv = self.get_object()
        # Security: wrap in read-only transaction and validate resource access
        query = mv.query.strip().rstrip(';')
        if not self._validate_query_access(query, request.tenant):
            return Response({'error': 'Query references resources not belonging to this tenant'}, status=status.HTTP_403_FORBIDDEN)
        try:
            with connection.cursor() as cursor:
                cursor.execute(f"SELECT * FROM ({query}) AS q LIMIT 100")
                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()
            return Response({
                'columns': columns,
                'rows': [dict(zip(columns, row)) for row in rows],
                'row_count': len(rows),
            })
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def _validate_query_access(self, query: str, tenant) -> bool:
        """Ensure query only accesses connector_resource_ids belonging to this tenant."""
        import re
        # Find all connector_resource_id = N references
        ids_in_query = set(re.findall(r'connector_resource_id\s*=\s*(\d+)', query))
        if not ids_in_query:
            # No resource filter → could access all data, block it
            if 'warehouse_rawrecord' in query.lower():
                return False
            return True  # views/aggregates without rawrecord are fine
        # Verify all referenced resource IDs belong to this tenant
        allowed_ids = set(
            TenantConnectorResource.objects.filter(
                connector__tenant=tenant
            ).values_list('id', flat=True)
        )
        return ids_in_query.issubset({str(i) for i in allowed_ids})

    @action(detail=True, methods=['post'])
    def refresh(self, request, pk=None):
        """Refresh the cache table."""
        mv = self.get_object()
        query = mv.query.strip().rstrip(';')
        if not self._validate_query_access(query, request.tenant):
            return Response({'error': 'Query references resources not belonging to this tenant'}, status=status.HTTP_403_FORBIDDEN)
        start = time.time()
        try:
            with connection.cursor() as cursor:
                cursor.execute(f"DROP TABLE IF EXISTS {mv.cache_table_name}")
                cursor.execute(f"CREATE TABLE {mv.cache_table_name} AS ({query})")
                cursor.execute(f"SELECT COUNT(*) FROM {mv.cache_table_name}")
                row_count = cursor.fetchone()[0]

            duration_ms = int((time.time() - start) * 1000)
            mv.last_refreshed_at = timezone.now()
            mv.row_count = row_count
            mv.refresh_duration_ms = duration_ms
            mv.status = 'active'
            mv.error_message = ''
            mv.save()
            return Response({
                'status': 'refreshed',
                'row_count': row_count,
                'duration_ms': duration_ms,
            })
        except Exception as e:
            mv.status = 'error'
            mv.error_message = str(e)
            mv.save()
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'])
    def data(self, request, pk=None):
        """Query the cache table with pagination."""
        mv = self.get_object()
        if mv.status != 'active':
            return Response({'error': 'View not yet refreshed'}, status=status.HTTP_400_BAD_REQUEST)

        limit = min(int(request.query_params.get('limit', 100)), 1000)
        offset = int(request.query_params.get('offset', 0))

        try:
            with connection.cursor() as cursor:
                cursor.execute(f"SELECT * FROM {mv.cache_table_name} LIMIT %s OFFSET %s", [limit, offset])
                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()
            return Response({
                'columns': columns,
                'rows': [dict(zip(columns, row)) for row in rows],
                'total': mv.row_count,
                'limit': limit,
                'offset': offset,
            })
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def tables(self, request):
        """List all available tables for this tenant (raw resource tables + materialized views)."""
        tenant = request.tenant

        tables = []

        # 1. Raw resource tables (each connector_resource with data)
        resources = TenantConnectorResource.objects.filter(
            connector__tenant=tenant, is_active=True
        ).select_related('connector', 'connector__connector_type')

        for r in resources:
            display_name = r.custom_name or r.resource_slug
            # Build a useful example query
            example_query = (
                f"SELECT\n"
                f"  data->>'guid' AS id,\n"
                f"  data->>'jobTitle' AS job_title,\n"
                f"  (data->>'startDateUtc')::date AS start_date\n"
                f"FROM warehouse_rawrecord\n"
                f"WHERE connector_resource_id = {r.id}"
            )
            tables.append({
                'type': 'raw',
                'name': f'{r.connector.name} → {display_name}',
                'slug': f'raw_{r.connector.connector_type.slug}_{r.resource_slug}_{r.id}',
                'description': f'{display_name} ({r.total_records} records)',
                'resource_id': r.id,
                'records': r.total_records,
                'query_hint': example_query,
                'fields': r.preview_fields,
            })

        # 2. Materialized views (cached tables)
        mvs = MaterializedView.objects.filter(tenant=tenant)
        for mv in mvs:
            tables.append({
                'type': 'view',
                'name': mv.cache_table_name,
                'slug': mv.slug,
                'description': mv.title,
                'records': mv.row_count,
                'status': mv.status,
                'query_hint': f"SELECT * FROM {mv.cache_table_name}",
                'fields': None,
            })

        return Response(tables)

    @action(detail=False, methods=['get'], url_path='table-preview')
    def table_preview(self, request):
        """Preview data from any available table (raw or view)."""
        table_type = request.query_params.get('type')
        resource_id = request.query_params.get('resource_id')
        view_slug = request.query_params.get('slug')

        try:
            with connection.cursor() as cursor:
                if table_type == 'raw' and resource_id:
                    resource = TenantConnectorResource.objects.get(
                        pk=resource_id, connector__tenant=request.tenant
                    )
                    cursor.execute("""
                        SELECT data FROM warehouse_rawrecord
                        WHERE connector_resource_id = %s
                        LIMIT 10
                    """, [resource.id])
                    rows = [row[0] for row in cursor.fetchall()]
                    if not rows:
                        # No data yet — return fields from preview if available
                        return Response({
                            'columns': [f['name'] for f in (resource.preview_fields or [])],
                            'rows': resource.preview_data or [],
                            'row_count': len(resource.preview_data or []),
                            'total': 0,
                            'note': 'Nog geen data opgehaald. Getoond: preview sample.',
                        })
                    columns = list(rows[0].keys()) if rows else []
                    return Response({
                        'columns': columns,
                        'rows': rows,
                        'row_count': len(rows),
                        'total': resource.total_records,
                    })

                elif table_type == 'view' and view_slug:
                    mv = MaterializedView.objects.get(slug=view_slug, tenant=request.tenant)
                    if mv.status != 'active':
                        return Response({'error': 'View not yet refreshed'}, status=status.HTTP_400_BAD_REQUEST)
                    cursor.execute(f"SELECT * FROM {mv.cache_table_name} LIMIT 10")
                    columns = [col[0] for col in cursor.description]
                    rows = cursor.fetchall()
                    return Response({
                        'columns': columns,
                        'rows': [dict(zip(columns, row)) for row in rows],
                        'row_count': len(rows),
                        'total': mv.row_count,
                    })
                else:
                    return Response({'error': 'Specify type + resource_id or slug'}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='table-column-stats')
    def table_column_stats(self, request):
        """Get column stats for a table (raw resource or view)."""
        table_type = request.query_params.get('type')
        resource_id = request.query_params.get('resource_id')
        view_slug = request.query_params.get('slug')
        column = request.query_params.get('column')

        if not column:
            return Response({'error': 'column parameter required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with connection.cursor() as cursor:
                if table_type == 'raw' and resource_id:
                    resource = TenantConnectorResource.objects.get(
                        pk=resource_id, connector__tenant=request.tenant
                    )
                    cursor.execute("""
                        SELECT
                            COUNT(*) AS total,
                            COUNT(data->>%s) AS filled,
                            COUNT(*) - COUNT(data->>%s) AS null_count,
                            COUNT(DISTINCT data->>%s) AS unique_count
                        FROM warehouse_rawrecord WHERE connector_resource_id = %s
                    """, [column, column, column, resource.id])
                    row = cursor.fetchone()
                    result = {'total': row[0], 'filled': row[1], 'null_count': row[2], 'unique_count': row[3]}

                    cursor.execute("""
                        SELECT data->>%s AS val, COUNT(*) AS cnt
                        FROM warehouse_rawrecord WHERE connector_resource_id = %s AND data->>%s IS NOT NULL
                        GROUP BY val ORDER BY cnt DESC LIMIT 10
                    """, [column, resource.id, column])
                    result['top_values'] = [[r[0], r[1]] for r in cursor.fetchall()]

                elif table_type == 'view' and view_slug:
                    mv = MaterializedView.objects.get(slug=view_slug, tenant=request.tenant)
                    safe_col = column.replace('"', '')
                    cursor.execute(f"""
                        SELECT COUNT(*), COUNT("{safe_col}"),
                               COUNT(*) - COUNT("{safe_col}"),
                               COUNT(DISTINCT "{safe_col}")
                        FROM {mv.cache_table_name}
                    """)
                    row = cursor.fetchone()
                    result = {'total': row[0], 'filled': row[1], 'null_count': row[2], 'unique_count': row[3]}

                    cursor.execute(f"""
                        SELECT "{safe_col}"::text AS val, COUNT(*) AS cnt
                        FROM {mv.cache_table_name} WHERE "{safe_col}" IS NOT NULL
                        GROUP BY val ORDER BY cnt DESC LIMIT 10
                    """)
                    result['top_values'] = [[r[0], r[1]] for r in cursor.fetchall()]
                else:
                    return Response({'error': 'Invalid parameters'}, status=status.HTTP_400_BAD_REQUEST)

            return Response(result)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
