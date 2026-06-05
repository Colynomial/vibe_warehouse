from django.core.management.base import BaseCommand
from warehouse.models import ConnectorType, TenantConnector, TenantConnectorResource
from tenants.models import Tenant


HELLOFLEX_CREDENTIAL_SCHEMA = [
    {"key": "client_id", "label": "Client ID", "type": "text", "required": True},
    {"key": "client_secret", "label": "Client Secret", "type": "password", "required": True},
    {"key": "base_url", "label": "API Base URL", "type": "url", "required": True,
     "default": "https://api.helloflex.com"},
]

HELLOFLEX_RESOURCES = [
    {
        "slug": "activities", "name": "Activities", "path": "/api/activities",
        "description": "Activities for Customer",
        "cursor_field": "lastUpdatedDateTimeUtcFrom", "id_field": "guid",
        "parameters": [
            {"key": "search", "label": "Search (title/description)", "type": "string"},
            {"key": "includeArchived", "label": "Include archived", "type": "boolean", "default": False},
            {"key": "lastUpdatedDateTimeUtcFrom", "label": "Updated from (UTC)", "type": "date-time"},
        ],
    },
    {
        "slug": "agencies", "name": "Agencies", "path": "/api/agencies",
        "description": "Agencies for Customer",
        "cursor_field": "lastUpdateDateUtcFrom", "id_field": "guid",
        "parameters": [
            {"key": "search", "label": "Search (name)", "type": "string"},
            {"key": "lastUpdateDateUtcFrom", "label": "Updated from (UTC)", "type": "date-time"},
            {"key": "lastUpdateDateUtcTo", "label": "Updated to (UTC)", "type": "date-time"},
        ],
    },
    {
        "slug": "agencies_contactpersons", "name": "Agency Contact Persons (all)", "path": "/api/agencies/contactpersons",
        "description": "Contact persons for all agencies",
        "cursor_field": "lastUpdateDateUtcFrom", "id_field": "guid",
        "parameters": [
            {"key": "search", "label": "Search (name/email)", "type": "string"},
            {"key": "lastUpdateDateUtcFrom", "label": "Updated from (UTC)", "type": "date-time"},
            {"key": "lastUpdateDateUtcTo", "label": "Updated to (UTC)", "type": "date-time"},
        ],
    },
    {
        "slug": "applications", "name": "Applications", "path": "/api/applications",
        "description": "Job applications for Agency",
        "cursor_field": "lastUpdateFrom", "id_field": "guid",
        "parameters": [
            {"key": "whatSearch", "label": "Search (title/name/email)", "type": "string"},
            {"key": "lastUpdateFrom", "label": "Updated from", "type": "date-time"},
            {"key": "lastUpdateTo", "label": "Updated to", "type": "date-time"},
        ],
    },
    {
        "slug": "candidates", "name": "Candidates", "path": "/api/candidates",
        "description": "Worker/candidate profiles",
        "cursor_field": "lastUpdateDateUtcFrom", "id_field": "guid",
        "parameters": [
            {"key": "search", "label": "Search (name/email)", "type": "string"},
            {"key": "lastUpdateDateUtcFrom", "label": "Updated from (UTC)", "type": "date-time"},
            {"key": "lastUpdateDateUtcTo", "label": "Updated to (UTC)", "type": "date-time"},
            {"key": "candidateNumber", "label": "Candidate number", "type": "string"},
        ],
    },
    {
        "slug": "candidates_workedhours", "name": "Candidates Worked Hours", "path": "/api/candidates/workedHours",
        "description": "Worked hours per candidate",
        "cursor_field": None, "id_field": "guid",
        "parameters": [
            {"key": "dateFrom", "label": "Date from", "type": "date-time"},
            {"key": "dateTo", "label": "Date to", "type": "date-time"},
            {"key": "activeContract", "label": "Active contract only", "type": "boolean", "default": True},
        ],
    },
    {
        "slug": "contracts", "name": "Contracts", "path": "/api/contracts",
        "description": "Employment contracts",
        "cursor_field": "lastUpdateDateUtcFrom", "id_field": "guid",
        "parameters": [
            {"key": "search", "label": "Search (job title)", "type": "string"},
            {"key": "lastUpdateDateUtcFrom", "label": "Updated from (UTC)", "type": "date-time"},
            {"key": "lastUpdateDateUtcTo", "label": "Updated to (UTC)", "type": "date-time"},
            {"key": "startDateUtcFrom", "label": "Start date from", "type": "date-time"},
            {"key": "startDateUtcTo", "label": "Start date to", "type": "date-time"},
            {"key": "endDateUtcFrom", "label": "End date from", "type": "date-time"},
            {"key": "endDateUtcTo", "label": "End date to", "type": "date-time"},
            {"key": "includeArchived", "label": "Include archived", "type": "boolean", "default": False},
            {"key": "includeAllVersions", "label": "Include all versions", "type": "boolean", "default": False},
            {"key": "externalId", "label": "External ID", "type": "string"},
            {"key": "contractNumber", "label": "Contract number", "type": "string"},
        ],
    },
    {
        "slug": "documents", "name": "Documents", "path": "/api/documents",
        "description": "Documents for Customer",
        "cursor_field": None, "id_field": "guid",
        "parameters": [
            {"key": "search", "label": "Search (name/number/subject)", "type": "string"},
        ],
    },
    {
        "slug": "domainTypes", "name": "Domain Types (lookup)", "path": "/api/domainTypes",
        "description": "Domain type reference table",
        "cursor_field": None, "id_field": "id",
        "parameters": [],
    },
    {
        "slug": "employers", "name": "Employers", "path": "/api/employers",
        "description": "Employer (inlener) companies",
        "cursor_field": "lastUpdateDateUtcFrom", "id_field": "guid",
        "parameters": [
            {"key": "search", "label": "Search (name)", "type": "string"},
            {"key": "lastUpdateDateUtcFrom", "label": "Updated from (UTC)", "type": "date-time"},
            {"key": "lastUpdateDateUtcTo", "label": "Updated to (UTC)", "type": "date-time"},
            {"key": "kvkMainNumber", "label": "KVK number", "type": "string"},
        ],
    },
    {
        "slug": "employers_contactpersons", "name": "Employer Contact Persons (all)", "path": "/api/employers/contactpersons",
        "description": "Contact persons for all employers",
        "cursor_field": "lastUpdateDateUtcFrom", "id_field": "guid",
        "parameters": [
            {"key": "search", "label": "Search (name/email)", "type": "string"},
            {"key": "lastUpdateDateUtcFrom", "label": "Updated from (UTC)", "type": "date-time"},
            {"key": "lastUpdateDateUtcTo", "label": "Updated to (UTC)", "type": "date-time"},
        ],
    },
    {
        "slug": "illnesses", "name": "Illnesses", "path": "/api/illnesses",
        "description": "Illness registrations",
        "cursor_field": None, "id_field": "guid",
        "parameters": [
            {"key": "candidateGuid", "label": "Candidate GUID (required)", "type": "string"},
            {"key": "isActive", "label": "Active only", "type": "boolean"},
        ],
    },
    {
        "slug": "invoices", "name": "Invoices", "path": "/api/invoices",
        "description": "Sales and purchase invoices",
        "cursor_field": "createdDateUtcFrom", "id_field": "guid",
        "parameters": [
            {"key": "invoiceType", "label": "Type (SalesInvoice/PurchaseInvoice)", "type": "string"},
            {"key": "createdDateUtcFrom", "label": "Created from (UTC)", "type": "date-time"},
            {"key": "createdDateUtcTo", "label": "Created to (UTC)", "type": "date-time"},
            {"key": "organizationNumber", "label": "Organization number", "type": "string"},
            {"key": "invoiceNumber", "label": "Invoice number", "type": "string"},
        ],
    },
    {
        "slug": "jobs", "name": "Jobs", "path": "/api/jobs",
        "description": "Job vacancies/placements",
        "cursor_field": "lastUpdatedFrom", "id_field": "guid",
        "parameters": [
            {"key": "whatSearch", "label": "Search (title/description)", "type": "string"},
            {"key": "whereSearch", "label": "Location search", "type": "string"},
            {"key": "lastUpdatedFrom", "label": "Updated from", "type": "date-time"},
            {"key": "lastUpdatedTo", "label": "Updated to", "type": "date-time"},
            {"key": "includeArchived", "label": "Include archived", "type": "boolean", "default": False},
        ],
    },
    {
        "slug": "publicjobs", "name": "Public Jobs", "path": "/api/publicjobs",
        "description": "Public job listings",
        "cursor_field": "lastUpdatedFrom", "id_field": "guid",
        "parameters": [
            {"key": "whatSearch", "label": "Search (title/description)", "type": "string"},
            {"key": "whereSearch", "label": "Location search", "type": "string"},
            {"key": "lastUpdatedFrom", "label": "Updated from", "type": "date-time"},
            {"key": "lastUpdatedTo", "label": "Updated to", "type": "date-time"},
        ],
    },
    {
        "slug": "publicnews", "name": "Public News", "path": "/api/publicnews",
        "description": "Public news items",
        "cursor_field": None, "id_field": "guid",
        "parameters": [],
    },
    {
        "slug": "tags", "name": "Tags (lookup)", "path": "/api/tags",
        "description": "Tag reference table",
        "cursor_field": None, "id_field": "id",
        "parameters": [
            {"key": "search", "label": "Search (tag name)", "type": "string"},
        ],
    },
    {
        "slug": "timecards", "name": "Timecards", "path": "/api/timecards",
        "description": "Timecard registrations",
        "cursor_field": "lastUpdateDateUtcFrom", "id_field": "guid",
        "parameters": [
            {"key": "lastUpdateDateUtcFrom", "label": "Updated from (UTC)", "type": "date-time"},
            {"key": "lastUpdateDateUtcTo", "label": "Updated to (UTC)", "type": "date-time"},
            {"key": "startDateUtcFrom", "label": "Start date from", "type": "date-time"},
            {"key": "startDateUtcTo", "label": "Start date to", "type": "date-time"},
            {"key": "endDateUtcFrom", "label": "End date from", "type": "date-time"},
            {"key": "endDateUtcTo", "label": "End date to", "type": "date-time"},
        ],
    },
    {
        "slug": "caoinstances", "name": "CAO Instances", "path": "/api/caoinstances",
        "description": "Collective labor agreements",
        "cursor_field": None, "id_field": "id",
        "parameters": [
            {"key": "isActualOnly", "label": "Actual only", "type": "boolean", "default": False},
        ],
    },
]

META_CREDENTIAL_SCHEMA = [
    {"key": "app_id", "label": "Meta App ID", "type": "text", "required": True},
    {"key": "app_secret", "label": "App Secret", "type": "password", "required": True},
    {"key": "access_token", "label": "Access Token (long-lived)", "type": "password", "required": True},
    {"key": "ad_account_id", "label": "Ad Account ID (act_XXX)", "type": "text", "required": True},
    {"key": "api_version", "label": "API Version", "type": "text", "required": True, "default": "v21.0"},
]

META_RESOURCES = [
    {
        "slug": "insights_daily",
        "name": "Daily Ad Performance",
        "description": "Daily metrics per ad set: spend, impressions, clicks, CPC, CPM",
        "cursor_field": "date_start",
        "id_field": "adset_id:date_start",
        "parameters": [
            {"key": "level", "label": "Level", "type": "select",
             "options": ["account", "campaign", "adset", "ad"], "default": "adset"},
            {"key": "fields", "label": "Fields", "type": "text",
             "default": "campaign_id,campaign_name,adset_id,adset_name,spend,impressions,clicks,cpc,cpm,ctr,reach"},
        ],
    },
    {
        "slug": "insights_daily_age_gender",
        "name": "Daily Performance by Age+Gender",
        "description": "Daily metrics broken down by age range and gender",
        "cursor_field": "date_start",
        "id_field": "adset_id:date_start:age:gender",
        "parameters": [
            {"key": "level", "label": "Level", "type": "select",
             "options": ["account", "campaign", "adset", "ad"], "default": "adset"},
        ],
    },
    {
        "slug": "campaigns",
        "name": "Campaign List",
        "description": "All campaigns with status and budget",
        "cursor_field": None,
        "id_field": "id",
        "parameters": [],
    },
    {
        "slug": "adsets",
        "name": "Ad Set List",
        "description": "All ad sets with status and budget",
        "cursor_field": None,
        "id_field": "id",
        "parameters": [],
    },
]


class Command(BaseCommand):
    help = 'Seed connector types (HelloFlex, Meta Ads) and demo connector for Faam'

    def handle(self, *args, **options):
        # HelloFlex connector type
        hf, created = ConnectorType.objects.update_or_create(
            slug='helloflex',
            defaults={
                'name': 'HelloFlex',
                'description': 'Uitzendbureau ERP - flexwerkers, contracten, urenstaten',
                'auth_type': 'oauth2_client',
                'credential_schema': HELLOFLEX_CREDENTIAL_SCHEMA,
                'available_resources': HELLOFLEX_RESOURCES,
                'base_url': 'https://api.helloflex.com',
                'rate_limit_info': '2 concurrent requests, 5 requests per 100ms',
            }
        )
        self.stdout.write(f'{"Created" if created else "Updated"} ConnectorType: {hf.name}')

        # Meta Ads connector type
        meta, created = ConnectorType.objects.update_or_create(
            slug='meta_ads',
            defaults={
                'name': 'Meta Ads',
                'description': 'Facebook/Instagram advertising - campaign performance & demographics',
                'auth_type': 'token',
                'credential_schema': META_CREDENTIAL_SCHEMA,
                'available_resources': META_RESOURCES,
                'base_url': 'https://graph.facebook.com',
                'rate_limit_info': '200 calls/hour per ad account',
            }
        )
        self.stdout.write(f'{"Created" if created else "Updated"} ConnectorType: {meta.name}')

        # Demo: Faam tenant gets a HelloFlex connector
        try:
            faam = Tenant.objects.get(slug='faam')
        except Tenant.DoesNotExist:
            self.stdout.write(self.style.WARNING('Tenant "faam" not found, skipping demo connector'))
            return

        connector, created = TenantConnector.objects.update_or_create(
            tenant=faam,
            name='Faam HelloFlex',
            defaults={
                'connector_type': hf,
                'credentials': {
                    'client_id': 'demo_client_id',
                    'client_secret': 'demo_secret',
                    'base_url': 'https://api.helloflex.com',
                },
                'is_active': True,
            }
        )
        self.stdout.write(f'{"Created" if created else "Updated"} TenantConnector: {connector.name}')

        # Activate contracts + timecards resources for demo
        for slug in ['contracts', 'timecards', 'candidates']:
            resource, created = TenantConnectorResource.objects.update_or_create(
                connector=connector,
                resource_slug=slug,
                defaults={
                    'is_active': True,
                    'sync_frequency': 'daily',
                }
            )
            self.stdout.write(f'  {"Created" if created else "Updated"} Resource: {slug}')

        self.stdout.write(self.style.SUCCESS('Done! Connector types seeded, Faam demo ready.'))
