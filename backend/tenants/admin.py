from django.contrib import admin
from .models import Tenant, TenantMembership, App


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug', 'is_active', 'created_at']
    prepopulated_fields = {'slug': ('name',)}


@admin.register(TenantMembership)
class TenantMembershipAdmin(admin.ModelAdmin):
    list_display = ['user', 'tenant', 'tenant_role', 'is_active']
    list_filter = ['tenant', 'tenant_role']


@admin.register(App)
class AppAdmin(admin.ModelAdmin):
    list_display = ['tenant', 'slug', 'name', 'is_active']
    list_filter = ['tenant']
