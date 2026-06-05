"""Base connector engine interface."""
import logging
from datetime import date
from typing import Generator

from warehouse.models import TenantConnector, TenantConnectorResource

logger = logging.getLogger(__name__)


class BaseEngine:
    """Abstract base for connector engines."""

    def __init__(self, connector: TenantConnector, resource: TenantConnectorResource):
        self.connector = connector
        self.resource = resource
        self.credentials = connector.credentials
        self.resource_config = self._get_resource_config()

    def _get_resource_config(self) -> dict:
        """Get resource configuration from model fields + connector_type defaults."""
        # Start with connector_type available_resources as base
        config = {}
        for r in self.connector.connector_type.available_resources:
            if r['slug'] == self.resource.resource_slug:
                config = dict(r)
                break

        # If no match in predefined resources, build config from model fields
        if not config:
            config = {'slug': self.resource.resource_slug}

        # Override with model-level fields (these take priority)
        if self.resource.api_path:
            config['path'] = self.resource.api_path
        if self.resource.cursor_field:
            config['cursor_field'] = self.resource.cursor_field
        if self.resource.id_field:
            config['id_field'] = self.resource.id_field

        # Apply extra parameters from JSON field
        params = self.resource.parameters or {}
        if params.get('api_parameters'):
            config.setdefault('extra_params', {}).update(params['api_parameters'])

        # Ensure we have a path
        if 'path' not in config:
            raise ValueError(f"No API path configured for resource {self.resource.resource_slug}")

        return config

    def validate_credentials(self) -> tuple[bool, str]:
        """Test if credentials are valid. Returns (success, message)."""
        raise NotImplementedError

    def fetch_page(self, skip: int = 0, take: int = 100, **params) -> tuple[list[dict], int]:
        """Fetch a single page. Returns (records, total_count)."""
        raise NotImplementedError

    def fetch_records(
        self,
        from_date: date | None = None,
        cursor: str | None = None,
    ) -> Generator[list[dict], None, None]:
        """Yield batches of records. Handles pagination internally."""
        raise NotImplementedError
