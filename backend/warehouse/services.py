"""Ingestion service: orchestrates data fetching, storing in RawRecord, and tracking via IngestionRun."""
import logging
import time
from datetime import date

from django.utils import timezone

from .models import (
    TenantConnector, TenantConnectorResource, RawRecord, IngestionRun,
)
from .engine.helloflex import HelloFlexEngine

logger = logging.getLogger(__name__)

ENGINE_MAP = {
    'helloflex': HelloFlexEngine,
    # 'meta_ads': MetaAdsEngine,  # TODO
}


def get_engine(connector: TenantConnector, resource: TenantConnectorResource):
    """Get the appropriate engine for a connector type."""
    slug = connector.connector_type.slug
    engine_class = ENGINE_MAP.get(slug)
    if not engine_class:
        raise ValueError(f"No engine available for connector type: {slug}")
    return engine_class(connector, resource)


def test_connection(connector: TenantConnector) -> tuple[bool, str]:
    """Test connector credentials against the first active resource."""
    resource = connector.resources.filter(is_active=True).first()
    if not resource:
        # Use first available resource from config
        available = connector.connector_type.available_resources
        if not available:
            return False, "No resources defined for this connector type."
        # Create temporary resource object for testing
        resource = TenantConnectorResource(
            connector=connector,
            resource_slug=available[0]['slug'],
        )

    engine = get_engine(connector, resource)
    return engine.validate_credentials()


def run_preview(resource: TenantConnectorResource) -> IngestionRun:
    """Fetch a small sample (1 page) for field discovery."""
    connector = resource.connector
    engine = get_engine(connector, resource)

    run = IngestionRun.objects.create(
        resource=resource,
        run_type='preview',
        status='running',
    )

    start_time = time.time()
    try:
        records, total = engine.fetch_page(skip=0, take=25)

        # Analyze fields from the records
        fields = _infer_fields(records) if records else []

        # Store preview data on the resource
        resource.preview_data = records[:10]  # Store first 10 for display
        resource.preview_fields = fields
        resource.preview_record_count = total
        resource.preview_fetched_at = timezone.now()
        resource.save()

        run.records_fetched = len(records)
        run.status = 'success'
        run.api_calls_made = 1

    except Exception as e:
        logger.exception("Preview failed for %s", resource)
        run.status = 'failed'
        run.error_message = str(e)[:500]

    run.completed_at = timezone.now()
    run.duration_ms = int((time.time() - start_time) * 1000)
    run.save()
    return run


def run_preload(resource: TenantConnectorResource, from_date: date | None = None, run: IngestionRun | None = None) -> IngestionRun:
    """Full historical data load from a start date."""
    connector = resource.connector
    engine = get_engine(connector, resource)

    if run is None:
        run = IngestionRun.objects.create(
            resource=resource,
            run_type='preload',
            status='running',
            sync_cursor_before=resource.last_sync_cursor,
        )

    start_time = time.time()
    total_fetched = 0
    total_created = 0
    total_updated = 0
    api_calls = 0
    id_field = engine.resource_config.get('id_field', 'guid')

    try:
        load_from = from_date or resource.preload_from
        for batch in engine.fetch_records(from_date=load_from):
            api_calls += 1
            total_fetched += len(batch)

            # Upsert records
            created, updated = _upsert_batch(resource, batch, id_field)
            total_created += created
            total_updated += updated

            # Update run progress (for polling)
            run.records_fetched = total_fetched
            run.records_created = total_created
            run.records_updated = total_updated
            run.api_calls_made = api_calls
            run.save(update_fields=[
                'records_fetched', 'records_created', 'records_updated', 'api_calls_made'
            ])

        # Update resource stats
        resource.last_synced_at = timezone.now()
        resource.total_records = RawRecord.objects.filter(connector_resource=resource).count()
        resource.last_sync_cursor = {'last_run_at': timezone.now().isoformat()}
        resource.save()

        run.status = 'success'
        run.sync_cursor_after = resource.last_sync_cursor

    except Exception as e:
        logger.exception("Preload failed for %s", resource)
        run.status = 'failed'
        run.error_message = str(e)[:500]
        # Still save partial progress
        resource.total_records = RawRecord.objects.filter(connector_resource=resource).count()
        resource.save(update_fields=['total_records'])

    run.records_fetched = total_fetched
    run.records_created = total_created
    run.records_updated = total_updated
    run.api_calls_made = api_calls
    run.completed_at = timezone.now()
    run.duration_ms = int((time.time() - start_time) * 1000)
    run.save()
    return run


def run_incremental_sync(resource: TenantConnectorResource, run: IngestionRun | None = None) -> IngestionRun:
    """Fetch only new/updated records since last sync."""
    connector = resource.connector
    engine = get_engine(connector, resource)

    cursor = None
    if resource.last_sync_cursor and 'last_run_at' in resource.last_sync_cursor:
        cursor = resource.last_sync_cursor['last_run_at']

    if run is None:
        run = IngestionRun.objects.create(
            resource=resource,
            run_type='incremental',
            status='running',
            sync_cursor_before=resource.last_sync_cursor,
        )

    start_time = time.time()
    total_fetched = 0
    total_created = 0
    total_updated = 0
    api_calls = 0
    id_field = engine.resource_config.get('id_field', 'guid')

    try:
        for batch in engine.fetch_records(cursor=cursor):
            api_calls += 1
            total_fetched += len(batch)

            created, updated = _upsert_batch(resource, batch, id_field)
            total_created += created
            total_updated += updated

            run.records_fetched = total_fetched
            run.records_created = total_created
            run.records_updated = total_updated
            run.api_calls_made = api_calls
            run.save(update_fields=[
                'records_fetched', 'records_created', 'records_updated', 'api_calls_made'
            ])

        resource.last_synced_at = timezone.now()
        resource.total_records = RawRecord.objects.filter(connector_resource=resource).count()
        resource.last_sync_cursor = {'last_run_at': timezone.now().isoformat()}
        resource.save()

        run.status = 'success'
        run.sync_cursor_after = resource.last_sync_cursor

    except Exception as e:
        logger.exception("Incremental sync failed for %s", resource)
        run.status = 'failed'
        run.error_message = str(e)[:500]

    run.records_fetched = total_fetched
    run.records_created = total_created
    run.records_updated = total_updated
    run.api_calls_made = api_calls
    run.completed_at = timezone.now()
    run.duration_ms = int((time.time() - start_time) * 1000)
    run.save()
    return run


def _upsert_batch(resource: TenantConnectorResource, records: list[dict], id_field: str) -> tuple[int, int]:
    """Upsert a batch of records into RawRecord. Returns (created, updated)."""
    created = 0
    updated = 0

    for record in records:
        source_id = str(record.get(id_field, ''))
        if not source_id:
            # Try nested or composite ID
            if ':' in id_field:
                parts = id_field.split(':')
                source_id = ':'.join(str(record.get(p, '')) for p in parts)
            else:
                continue

        # Extract date if available
        record_date = None
        for date_key in ('startDate', 'date_start', 'createdDate', 'startDateUtc'):
            if date_key in record and record[date_key]:
                try:
                    record_date = record[date_key][:10]  # YYYY-MM-DD
                except (TypeError, IndexError):
                    pass
                break

        obj, was_created = RawRecord.objects.update_or_create(
            connector_resource=resource,
            source_id=source_id,
            defaults={
                'data': record,
                'record_date': record_date,
                'record_guid': source_id if len(source_id) <= 255 else source_id[:255],
            }
        )
        if was_created:
            created += 1
        else:
            updated += 1

    return created, updated


def _infer_fields(records: list[dict]) -> list[dict]:
    """Infer field names and types from a sample of records."""
    if not records:
        return []

    fields = {}
    for record in records[:25]:
        for key, value in record.items():
            if key not in fields:
                fields[key] = _infer_type(value)

    return [{'name': k, 'type': v} for k, v in fields.items()]


def _infer_type(value) -> str:
    """Infer JSON type from a Python value."""
    if value is None:
        return 'string'
    if isinstance(value, bool):
        return 'boolean'
    if isinstance(value, int):
        return 'integer'
    if isinstance(value, float):
        return 'number'
    if isinstance(value, list):
        return 'array'
    if isinstance(value, dict):
        return 'object'
    if isinstance(value, str):
        # Try to detect dates/guids
        if len(value) == 36 and value.count('-') == 4:
            return 'guid'
        if len(value) >= 10 and value[4:5] == '-' and value[7:8] == '-':
            return 'datetime' if 'T' in value else 'date'
        return 'string'
    return 'string'
