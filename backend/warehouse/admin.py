from django.contrib import admin
from .models import ConnectorType, TenantConnector, TenantConnectorResource, RawRecord, MaterializedView, IngestionRun


@admin.register(ConnectorType)
class ConnectorTypeAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'auth_type', 'is_active')
    prepopulated_fields = {'slug': ('name',)}


@admin.register(TenantConnector)
class TenantConnectorAdmin(admin.ModelAdmin):
    list_display = ('name', 'tenant', 'connector_type', 'is_active', 'last_validated_at')
    list_filter = ('tenant', 'connector_type', 'is_active')


@admin.register(TenantConnectorResource)
class TenantConnectorResourceAdmin(admin.ModelAdmin):
    list_display = ('connector', 'resource_slug', 'is_active', 'sync_frequency', 'last_synced_at', 'total_records')
    list_filter = ('is_active', 'sync_frequency')


@admin.register(RawRecord)
class RawRecordAdmin(admin.ModelAdmin):
    list_display = ('connector_resource', 'source_id', 'record_date', 'fetched_at')
    list_filter = ('connector_resource',)
    search_fields = ('source_id', 'record_guid')


@admin.register(MaterializedView)
class MaterializedViewAdmin(admin.ModelAdmin):
    list_display = ('title', 'tenant', 'slug', 'status', 'row_count', 'last_refreshed_at')
    list_filter = ('tenant', 'status')


@admin.register(IngestionRun)
class IngestionRunAdmin(admin.ModelAdmin):
    list_display = ('resource', 'run_type', 'status', 'records_fetched', 'started_at', 'duration_ms')
    list_filter = ('run_type', 'status')
