# Auth & Authorization — Requirements

## Three Layers of Access

### Layer 1: Platform Level (us, Colynomial)
- Platform superusers/support who can access all tenants
- Invisible to tenant admins (filtered from user lists)
- Can impersonate any tenant user (sees exactly what they see)

### Layer 2: Tenant Admin/Dev Level
- Client's IT person or power user
- Manages users, apps, permissions within their tenant
- Access to "achterkant" (backend management) in core portal

### Layer 3: Tenant User Level
- End users within client organization
- See only apps they have access to
- Data scoped per their permissions

## Data Model

### Public Schema (shared across all tenants)

```python
class PlatformUser(AbstractUser):
    """Platform-level accounts (superusers, support staff)"""
    email = EmailField(unique=True)  # primary login
    role = CharField(choices=['superuser', 'support'])
    can_impersonate = BooleanField(default=True)
    # Never visible in tenant user lists

class User(AbstractUser):
    """All tenant users across the platform"""
    email = EmailField(unique=True)  # primary login, shared identity
    is_activated = BooleanField(default=False)
    activation_token = CharField(null=True)
    created_at = DateTimeField(auto_now_add=True)
    # One user can belong to multiple tenants (via TenantMembership)

class Tenant(Model):
    name = CharField()  # "Faam"
    slug = CharField(unique=True)  # "faam" → faam.platformname.com
    schema_name = CharField()  # "tenant_faam"
    is_active = BooleanField(default=True)
    created_at = DateTimeField(auto_now_add=True)

class TenantMembership(Model):
    """Links a user to a tenant with a tenant-level role"""
    user = ForeignKey(User)
    tenant = ForeignKey(Tenant)
    tenant_role = CharField(choices=['admin', 'dev', 'user'])  # only for achterkant access
    is_active = BooleanField(default=True)
    invited_by = ForeignKey(User, null=True)
    invited_at = DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'tenant')

class App(Model):
    """Registered apps within a tenant"""
    tenant = ForeignKey(Tenant)
    slug = CharField()  # "main-dashboard", "hr-portal"
    name = CharField()  # "Main Dashboard"
    is_active = BooleanField(default=True)

# NOTE: Per-user permissions (data, app, page, action level) are managed
# via the Permission model. See feature-multi-tenancy/01_requirements.md
# for the full resource-based access control system.
# No fixed roles like admin/editor/viewer for data/app access.
# TenantMembership.tenant_role only determines achterkant access.

class PermissionChangeLog(Model):
    """Audit trail for all permission changes (compliance)"""
    tenant = ForeignKey(Tenant)
    target_user = ForeignKey(User, related_name='permission_changes')
    changed_by = ForeignKey(User, related_name='permission_changes_made')
    change_type = CharField(choices=[
        'app_access_granted', 'app_access_revoked',
        'app_role_changed', 'data_scope_changed',
        'tenant_role_changed', 'user_invited', 'user_removed'
    ])
    app = ForeignKey(App, null=True)  # null for tenant-level changes
    old_value = JSONField(null=True)
    new_value = JSONField(null=True)
    reason = TextField(blank=True)  # optional justification
    timestamp = DateTimeField(auto_now_add=True)
```

## Roles & Permissions Matrix

| Role | Scope | Can do |
|------|-------|--------|
| **Platform Superuser** | All tenants | Everything + impersonate + platform config. Invisible to tenants. |
| **Platform Support** | Assigned tenants | View + impersonate (read-only). Invisible to tenants. |
| **Tenant Admin** | Their tenant | Manage users, assign apps/roles, achterkant access, all apps |
| **Tenant Dev** | Their tenant | Achterkant access (data management), all apps, no user management |
| **Tenant User** | Their apps only | Only assigned apps with given data scope |

## Impersonation

- Platform superuser can impersonate any tenant user
- Sees **exactly** what that user sees (same apps, same data scope)
- Visual indicator: banner "Viewing as [user] @ [tenant]" (only visible to impersonator)
- All actions during impersonation logged with `impersonated_by` field
- Platform users never appear in tenant user lists, audit logs show "System" for their actions

## Multi-Tenant User (one email, multiple tenants)

- A single `User` record (one email) can have multiple `TenantMembership` records
- After login, if user has multiple tenants → tenant picker screen
- If user has only one tenant → go directly to that tenant's app list
- Each tenant is fully independent: different role, different app access

## Login Flow

```
1. User visits app.platformname.com/login (or any subdomain)
2. Enters email + password
3. Django authenticates against User table (public schema)
4. If user has 1 tenant → JWT with that tenant context → redirect to apps
5. If user has N tenants → tenant picker → user selects → JWT issued
6. JWT contains: { user_id, tenant_slug, tenant_role, app_access[] }
7. Cookie set with domain=.platformname.com
8. Redirect to tenant subdomain or app picker
```

### What user sees after login:

**Multi-tenant user (rare, e.g. consultant):**
```
┌─────────────────────────┐
│  Kies organisatie:        │
│  ┌─────────────────────┐  │
│  │ Faam            ▶  │  │
│  │ Klant B         ▶  │  │
│  └─────────────────────┘  │
└─────────────────────────┘
```

**Single-tenant user → app picker (if multiple apps):**
```
┌─────────────────────────┐
│  Faam — Mijn Apps:        │
│  ┌─────────────────────┐  │
│  │ Main Dashboard   ▶  │  │
│  │ HR Portal        ▶  │  │
│  └─────────────────────┘  │
│                          │
│  ⚙️ Beheer (admin only)    │
└─────────────────────────┘
```

**Single app user → direct to app.**

## Invite & Removal Flow

### Invite (user does NOT exist on platform)
```
Tenant admin invites jan@faam.nl to "Main Dashboard" (viewer)
  → User record created (is_activated=False, activation_token set)
  → TenantMembership created (tenant=Faam, role=user)
  → AppAccess created (app=Main Dashboard, role=viewer)
  → PermissionChangeLog entry (type=user_invited)
  → Email sent with activation link
  → User clicks link → sets password → is_activated=True
```

### Invite (user already exists on platform, different tenant)
```
Tenant admin invites consultant@bureau.nl to "HR Portal" (editor)
  → User already exists (has TenantMembership with Klant B)
  → New TenantMembership created (tenant=Faam, role=user)
  → AppAccess created (app=HR Portal, role=editor)
  → PermissionChangeLog entry (type=user_invited)
  → Email: "You've been added to Faam" (no activation needed)
  → User now sees tenant picker after login
```

### Invite (user already exists in same tenant, add to another app)
```
Tenant admin adds jan@faam.nl to "HR Portal" (viewer)
  → User exists, TenantMembership exists
  → New AppAccess created (app=HR Portal, role=viewer)
  → PermissionChangeLog entry (type=app_access_granted)
  → User now sees HR Portal in their app list
```

### Remove from app
```
Tenant admin removes jan@faam.nl from "HR Portal"
  → AppAccess record deactivated/deleted
  → PermissionChangeLog entry (type=app_access_revoked)
  → User no longer sees HR Portal
  → Check: does user have other AppAccess in this tenant?
    → Yes: nothing else happens
    → No: TenantMembership deactivated, log entry (type=user_removed)
         Check: does user have other TenantMemberships?
           → Yes: nothing else (they still access other tenants)
           → No: User account deactivated (last access removed)
```

## Achterkant (Backend Management)

Part of core portal (`app.platformname.com/tenant/<slug>/admin/`), available to tenant admin + dev roles:

| Section | Admin | Dev | User |
|---------|-------|-----|------|
| User management (invite, roles, permissions) | ✅ | ❌ | ❌ |
| Audit log (permission changes) | ✅ | ✅ (read) | ❌ |
| Data connectors (config, credentials, schedules) | ✅ | ✅ | ❌ |
| Data management (manual corrections, refresh) | ✅ | ✅ | ❌ |
| Usage metrics (API calls, active users) | ✅ | ✅ | ❌ |
| App registration (register new apps) | ✅ | ❌ | ❌ |

## JWT Token Contents

```json
{
  "user_id": 42,
  "email": "jan@faam.nl",
  "tenant_slug": "faam",
  "tenant_role": "user",
  "apps": [
    { "slug": "main-dashboard", "role": "viewer", "data_scope": {} },
    { "slug": "hr-portal", "role": "editor", "data_scope": { "team_id": 5 } }
  ],
  "is_impersonating": false,
  "exp": 1717200000
}
```

## Platform User Visibility Rules

- PlatformUsers are **never** shown in tenant user lists
- PlatformUsers are **never** shown in audit logs as themselves (shown as "System")
- PlatformUser impersonation is logged separately (platform-level audit, not tenant-level)
- Tenant admins cannot see, edit, or remove PlatformUsers
- PlatformUsers do NOT have TenantMembership records — they bypass via platform-level auth

## Decisions Made

| Decision | Choice |
|----------|--------|
| Login method | Email + password |
| Token type | JWT in httpOnly cookie (domain=.platformname.com) |
| Multi-tenant users | Supported (one email, multiple TenantMemberships) |
| Impersonation | Full impersonation (see exactly what user sees) |
| Platform user visibility | Invisible to tenants |
| Achterkant location | Core portal (app.platformname.com/tenant/slug/admin/) |
| Invite flow | Email invite → activation (or instant if user exists) |
| Removal cascade | Per app → per tenant → platform deactivation |
| Audit | All permission changes logged with who/what/when |

## Open Questions
- [ ] SSO/OAuth voor grotere MKB klanten? (later)
- [ ] Password reset flow details?
- [ ] 2FA? (later)
- [ ] Session duration? (JWT expiry: 2h access + refresh token?)
- [ ] Willen we "switch tenant" zonder opnieuw in te loggen? (token refresh met andere tenant context)
