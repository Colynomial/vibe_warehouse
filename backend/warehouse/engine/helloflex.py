"""HelloFlex API connector engine with OAuth2 client credentials."""
import logging
import time
from datetime import date, datetime
from typing import Generator

import requests

from .base import BaseEngine

logger = logging.getLogger(__name__)

# HelloFlex rate limits: 2 concurrent, 5 per 100ms
# We use a simple delay between requests to stay safe
REQUEST_DELAY = 0.15  # 150ms between requests
PAGE_SIZE = 100


class HelloFlexEngine(BaseEngine):
    """Engine for HelloFlex API (OAuth2 client credentials, skip/take pagination)."""

    _token: str | None = None
    _token_expires_at: float = 0

    def _get_token(self) -> str:
        """Get or refresh OAuth2 access token."""
        if self._token and time.time() < self._token_expires_at - 60:
            return self._token

        base_url = self.credentials.get('base_url', 'https://api.helloflex.com')
        token_url = f"{base_url}/oauth2/token"

        response = requests.post(
            token_url,
            data={
                'grant_type': 'client_credentials',
                'client_id': self.credentials['client_id'],
                'client_secret': self.credentials['client_secret'],
            },
            headers={'Content-Type': 'application/x-www-form-urlencoded'},
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()

        self._token = data['access_token']
        self._token_expires_at = time.time() + data.get('expires_in', 3600)
        logger.info("HelloFlex OAuth2 token acquired, expires in %ss", data.get('expires_in'))
        return self._token

    def _request(self, path: str, params: dict | None = None) -> requests.Response:
        """Make authenticated GET request with rate limiting."""
        base_url = self.credentials.get('base_url', 'https://api.helloflex.com')
        token = self._get_token()

        time.sleep(REQUEST_DELAY)

        response = requests.get(
            f"{base_url}{path}",
            params=params,
            headers={'Authorization': f'Bearer {token}'},
            timeout=60,
        )
        response.raise_for_status()
        return response

    def validate_credentials(self) -> tuple[bool, str]:
        """Test credentials by fetching first page of the resource."""
        try:
            path = self.resource_config['path']
            response = self._request(path, {'skip': 0, 'take': 1})
            total = int(response.headers.get('X-Total-Count', 0))
            return True, f"Connection successful. {total} records available."
        except requests.HTTPError as e:
            if e.response.status_code == 401:
                return False, "Authentication failed. Check client_id and client_secret."
            return False, f"HTTP {e.response.status_code}: {e.response.text[:200]}"
        except requests.ConnectionError:
            return False, "Cannot reach HelloFlex API. Check base_url."
        except Exception as e:
            return False, f"Unexpected error: {str(e)[:200]}"

    def fetch_page(self, skip: int = 0, take: int = PAGE_SIZE, **params) -> tuple[list[dict], int]:
        """Fetch a single page of records."""
        path = self.resource_config['path']
        query_params = {'skip': skip, 'take': take, **params}

        response = self._request(path, query_params)
        total = int(response.headers.get('X-Total-Count', len(response.json())))
        records = response.json()

        return records, total

    def fetch_records(
        self,
        from_date: date | None = None,
        cursor: str | None = None,
    ) -> Generator[list[dict], None, None]:
        """
        Yield batches of records with pagination.
        Uses lastUpdateDateUtcFrom for incremental sync.
        """
        path = self.resource_config['path']
        cursor_field = self.resource_config.get('cursor_field', 'lastUpdatedDateTimeUtcFrom')

        params: dict = {}

        # Set date filter for incremental/preload
        if cursor:
            params[cursor_field] = cursor
        elif from_date:
            if isinstance(from_date, str):
                from_date = date.fromisoformat(from_date)
            params[cursor_field] = datetime.combine(from_date, datetime.min.time()).isoformat() + 'Z'

        skip = 0
        total = None

        while True:
            query_params = {'skip': skip, 'take': PAGE_SIZE, **params}
            response = self._request(path, query_params)

            if total is None:
                total = int(response.headers.get('X-Total-Count', 0))

            records = response.json()
            if not records:
                break

            yield records

            skip += len(records)
            if skip >= total:
                break

        logger.info("Fetched %d/%d records from %s", skip, total, path)
