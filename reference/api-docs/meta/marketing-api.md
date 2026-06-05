# Meta Marketing API — Reference Notes

## Overview
Meta (Facebook) Marketing API provides access to ad account data: campaigns, ad sets, ads, and their performance metrics.

## Authentication
- **Type**: Long-lived access token (OAuth2)
- **Required credentials**:
  - `app_id`: Meta App ID
  - `app_secret`: Meta App Secret  
  - `access_token`: Long-lived user/system token
  - `ad_account_id`: Ad Account ID (format: `act_XXXXXXXXX`)
  - `api_version`: API version (e.g. `v21.0`)

## Key Endpoints for Ingestion

### Ad Insights (primary data source)
```
GET /{ad_account_id}/insights
```

**Parameters:**
- `level`: `account`, `campaign`, `adset`, `ad`
- `time_increment`: `1` (daily), `7` (weekly), `monthly`, `all_days`
- `time_range`: `{"since":"2025-01-01","until":"2025-12-31"}`
- `fields`: comma-separated list of metrics
- `breakdowns`: optional demographic breakdowns
- `limit`: pagination size (max 1000)
- `after`: cursor for pagination

**Available Fields (metrics):**
- `spend` — amount spent
- `impressions` — number of impressions
- `clicks` — total clicks
- `cpc` — cost per click
- `cpm` — cost per 1000 impressions
- `ctr` — click-through rate
- `reach` — unique users reached
- `frequency` — avg times shown per user
- `conversions` — conversion events
- `cost_per_conversion`
- `actions` — array of action types + values

**Available Fields (dimensions):**
- `campaign_id`, `campaign_name`
- `adset_id`, `adset_name`
- `ad_id`, `ad_name`
- `date_start`, `date_stop`
- `account_id`, `account_name`

**Breakdown Options:**
- `age` — age ranges (18-24, 25-34, etc.)
- `gender` — male, female, unknown
- `age,gender` — combined breakdown
- `country` — country code
- `region` — region/state
- `platform_position` — feed, stories, etc.
- `device_platform` — mobile, desktop

### Example Request
```
GET /act_123456789/insights?
  level=adset&
  time_increment=1&
  time_range={"since":"2025-06-01","until":"2025-06-30"}&
  fields=adset_id,adset_name,campaign_id,campaign_name,spend,impressions,clicks,cpc,cpm,date_start&
  breakdowns=age,gender&
  limit=1000
```

### Example Response
```json
{
  "data": [
    {
      "adset_id": "12345",
      "adset_name": "Brand Awareness - NL",
      "campaign_id": "67890",
      "campaign_name": "Q2 Brand Campaign",
      "spend": "45.23",
      "impressions": "12450",
      "clicks": "234",
      "cpc": "0.19",
      "cpm": "3.63",
      "date_start": "2025-06-01",
      "date_stop": "2025-06-01",
      "age": "25-34",
      "gender": "female"
    }
  ],
  "paging": {
    "cursors": {
      "before": "xxx",
      "after": "yyy"
    },
    "next": "https://graph.facebook.com/..."
  }
}
```

## Pagination
- Cursor-based (`after` parameter)
- Max 1000 records per page
- Follow `paging.next` until no more pages

## Rate Limits
- Standard: 200 calls per hour per ad account
- Batch requests recommended for high volume
- Exponential backoff on 429 responses

## Incremental Sync Strategy
- **Cursor field**: `date_start`
- **Approach**: fetch by date range, start from last_synced date
- **Note**: Data can be retroactively updated (attribution windows). Re-fetch last 7 days on each sync.

## Available Resources for Connector

| Resource Slug | Description | Params |
|--------------|-------------|--------|
| `insights_daily` | Daily ad performance | level, fields, breakdowns |
| `insights_daily_age_gender` | Daily performance by age+gender | level (fixed breakdowns) |
| `campaigns` | Campaign list + status | — |
| `adsets` | Ad set list + status + budget | — |

## Connector Credential Schema
```json
[
  {"key": "app_id", "label": "Meta App ID", "type": "text", "required": true},
  {"key": "app_secret", "label": "App Secret", "type": "password", "required": true},
  {"key": "access_token", "label": "Access Token (long-lived)", "type": "password", "required": true},
  {"key": "ad_account_id", "label": "Ad Account ID (act_XXX)", "type": "text", "required": true},
  {"key": "api_version", "label": "API Version", "type": "text", "required": true, "default": "v21.0"}
]
```
