from rest_framework import serializers
from .models import ConnectorType, TenantConnector, TenantConnectorResource, MaterializedView, IngestionRun


class ConnectorTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConnectorType
        fields = ['id', 'slug', 'name', 'description', 'auth_type',
                  'credential_schema', 'available_resources', 'rate_limit_info']


class TenantConnectorResourceSerializer(serializers.ModelSerializer):
    resource_name = serializers.SerializerMethodField()
    connector_name = serializers.CharField(source='connector.name', read_only=True)
    connector_type_slug = serializers.CharField(source='connector.connector_type.slug', read_only=True)
    depends_on_name = serializers.CharField(source='depends_on.custom_name', read_only=True, default=None)

    class Meta:
        model = TenantConnectorResource
        fields = ['id', 'resource_slug', 'resource_name', 'custom_name', 'is_active',
                  'api_path', 'cursor_field', 'id_field', 'parameters',
                  'sync_frequency', 'preload_from', 'last_synced_at', 'total_records',
                  'preview_record_count', 'preview_fields', 'preview_data',
                  'connector', 'connector_name', 'connector_type_slug',
                  'depends_on', 'depends_on_name', 'depends_on_column',
                  'dependent_path_template', 'notes']

    def get_resource_name(self, obj):
        if obj.custom_name:
            return obj.custom_name
        connector_type = obj.connector.connector_type
        for r in connector_type.available_resources:
            if r.get('slug') == obj.resource_slug:
                return r.get('name', obj.resource_slug)
        return obj.resource_slug


class TenantConnectorSerializer(serializers.ModelSerializer):
    connector_type_name = serializers.CharField(source='connector_type.name', read_only=True)
    connector_type_slug = serializers.CharField(source='connector_type.slug', read_only=True)
    resources = TenantConnectorResourceSerializer(many=True, read_only=True)
    credentials_masked = serializers.SerializerMethodField()

    class Meta:
        model = TenantConnector
        fields = ['id', 'name', 'connector_type', 'connector_type_name',
                  'connector_type_slug', 'is_active', 'created_at',
                  'last_validated_at', 'validation_error', 'resources',
                  'credentials_masked']
        read_only_fields = ['last_validated_at', 'validation_error']

    def get_credentials_masked(self, obj):
        """Return credentials with sensitive values masked."""
        schema = obj.connector_type.credential_schema
        masked = {}
        for field in schema:
            key = field['key']
            value = obj.credentials.get(key, '')
            if field.get('type') == 'password' and value:
                masked[key] = '••••••••' + (value[-4:] if len(value) > 4 else '')
            else:
                masked[key] = value
        return masked


class TenantConnectorCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = TenantConnector
        fields = ['name', 'connector_type', 'credentials']

    def update(self, instance, validated_data):
        """Merge credentials: only update keys that are provided and non-empty."""
        if 'credentials' in validated_data:
            new_creds = validated_data.pop('credentials')
            existing = instance.credentials or {}
            for key, value in new_creds.items():
                if value:  # Only overwrite if non-empty
                    existing[key] = value
            instance.credentials = existing
        return super().update(instance, validated_data)


class MaterializedViewSerializer(serializers.ModelSerializer):
    class Meta:
        model = MaterializedView
        fields = ['id', 'slug', 'title', 'description', 'query',
                  'auto_refresh', 'status', 'last_refreshed_at',
                  'refresh_duration_ms', 'row_count', 'error_message',
                  'created_at', 'updated_at']
        read_only_fields = ['status', 'last_refreshed_at', 'refresh_duration_ms',
                           'row_count', 'error_message']


class MaterializedViewCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = MaterializedView
        fields = ['slug', 'title', 'description', 'query', 'auto_refresh']


class IngestionRunSerializer(serializers.ModelSerializer):
    class Meta:
        model = IngestionRun
        fields = ['id', 'run_type', 'started_at', 'completed_at', 'status',
                  'records_fetched', 'records_created', 'records_updated',
                  'error_message', 'duration_ms', 'api_calls_made']
