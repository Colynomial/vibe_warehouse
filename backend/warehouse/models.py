from django.db import models
from django.conf import settings
from django.contrib.postgres.indexes import GinIndex


class ConnectorType(models.Model):
    """Available connector types. Managed by platform admin."""
    slug = models.SlugField(unique=True)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    auth_type = models.CharField(max_length=50)  # "oauth2_client", "token", "api_key"
    credential_schema = models.JSONField(default=list)
    available_resources = models.JSONField(default=list)
    base_url = models.URLField(blank=True)
    rate_limit_info = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class TenantConnector(models.Model):
    """A configured connector instance for a specific tenant."""
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='connectors')
    connector_type = models.ForeignKey(ConnectorType, on_delete=models.PROTECT)
    name = models.CharField(max_length=200)
    credentials = models.JSONField(default=dict)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_validated_at = models.DateTimeField(null=True, blank=True)
    validation_error = models.TextField(blank=True)

    class Meta:
        unique_together = ('tenant', 'name')

    def __str__(self):
        return f'{self.tenant.slug}/{self.name}'


class TenantConnectorResource(models.Model):
    """Which resource a tenant wants to ingest, with parameters."""
    FREQUENCY_CHOICES = [
        ('hourly', 'Hourly'),
        ('daily', 'Daily'),
        ('weekly', 'Weekly'),
    ]

    connector = models.ForeignKey(TenantConnector, on_delete=models.CASCADE, related_name='resources')
    resource_slug = models.CharField(max_length=100)
    custom_name = models.CharField(max_length=200, blank=True)
    is_active = models.BooleanField(default=False)
    parameters = models.JSONField(default=dict)
    sync_frequency = models.CharField(max_length=20, choices=FREQUENCY_CHOICES, default='daily')

    # API configuration (overridable)
    api_path = models.CharField(max_length=500, blank=True, help_text="API endpoint path, e.g. /api/contracts")
    cursor_field = models.CharField(max_length=200, blank=True, help_text="Date field for incremental sync")
    id_field = models.CharField(max_length=200, blank=True, help_text="Unique ID field in response")

    # Dependent resource support (e.g. contract details needs GUIDs from contracts)
    depends_on = models.ForeignKey(
        'self', null=True, blank=True, on_delete=models.SET_NULL, related_name='dependents'
    )
    depends_on_column = models.CharField(max_length=200, blank=True, help_text="Column from parent resource to use as parameter")
    dependent_path_template = models.CharField(max_length=500, blank=True, help_text="Path template, e.g. /api/contracts/{guid}/details")

    # Notes/context for AI
    notes = models.TextField(blank=True, help_text="Context notes for AI processing")

    # Sync tracking
    preload_from = models.DateField(null=True, blank=True)
    last_synced_at = models.DateTimeField(null=True, blank=True)
    last_sync_cursor = models.JSONField(null=True, blank=True)
    total_records = models.IntegerField(default=0)

    # Preview
    preview_data = models.JSONField(null=True, blank=True)
    preview_fetched_at = models.DateTimeField(null=True, blank=True)
    preview_record_count = models.IntegerField(null=True, blank=True)
    preview_fields = models.JSONField(null=True, blank=True)

    class Meta:
        unique_together = ('connector', 'resource_slug')

    def __str__(self):
        return self.custom_name or f'{self.connector}/{self.resource_slug}'


class RawRecord(models.Model):
    """Generic storage for all ingested API data. JSONB + GIN + extracted columns."""
    connector_resource = models.ForeignKey(TenantConnectorResource, on_delete=models.CASCADE, related_name='records')
    source_id = models.CharField(max_length=255)
    data = models.JSONField()

    # Extracted indexed columns
    record_date = models.DateField(null=True, blank=True, db_index=True)
    record_guid = models.CharField(max_length=255, blank=True, db_index=True)

    fetched_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('connector_resource', 'source_id')
        indexes = [
            models.Index(fields=['connector_resource', 'record_date']),
            models.Index(fields=['connector_resource', 'fetched_at']),
            GinIndex(fields=['data'], name='raw_record_data_gin'),
        ]

    def __str__(self):
        return f'{self.connector_resource}:{self.source_id}'


class MaterializedView(models.Model):
    """SQL transformation. Query stored in DB, results cached in a table."""
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('active', 'Active'),
        ('error', 'Error'),
    ]

    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='materialized_views')
    slug = models.SlugField(max_length=100)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    query = models.TextField()

    # Dependencies
    depends_on_resources = models.ManyToManyField(TenantConnectorResource, blank=True, related_name='downstream_views')
    depends_on_views = models.ManyToManyField('self', symmetrical=False, blank=True, related_name='downstream_views')

    # Config
    auto_refresh = models.BooleanField(default=True)
    cache_table_name = models.CharField(max_length=100, blank=True)

    # Status
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    last_refreshed_at = models.DateTimeField(null=True, blank=True)
    refresh_duration_ms = models.IntegerField(null=True, blank=True)
    row_count = models.IntegerField(null=True, blank=True)
    error_message = models.TextField(blank=True)

    # Metadata
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('tenant', 'slug')

    def save(self, *args, **kwargs):
        if not self.cache_table_name:
            self.cache_table_name = f'mv_{self.slug}'
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.tenant.slug}/{self.slug}'


class IngestionRun(models.Model):
    """Log of every ingestion execution."""
    RUN_TYPE_CHOICES = [
        ('preview', 'Preview'),
        ('preload', 'Preload'),
        ('incremental', 'Incremental'),
        ('backfill', 'Backfill'),
    ]
    STATUS_CHOICES = [
        ('running', 'Running'),
        ('success', 'Success'),
        ('partial', 'Partial'),
        ('failed', 'Failed'),
    ]

    resource = models.ForeignKey(TenantConnectorResource, on_delete=models.CASCADE, related_name='runs')
    run_type = models.CharField(max_length=20, choices=RUN_TYPE_CHOICES)
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='running')

    records_fetched = models.IntegerField(default=0)
    records_created = models.IntegerField(default=0)
    records_updated = models.IntegerField(default=0)

    sync_cursor_before = models.JSONField(null=True, blank=True)
    sync_cursor_after = models.JSONField(null=True, blank=True)

    error_message = models.TextField(blank=True)
    duration_ms = models.IntegerField(null=True, blank=True)
    api_calls_made = models.IntegerField(default=0)

    def __str__(self):
        return f'{self.resource} [{self.run_type}] {self.status}'
