from rest_framework import serializers
from .models import Tenant, TenantMembership, App


class AppSerializer(serializers.ModelSerializer):
    class Meta:
        model = App
        fields = ['id', 'slug', 'name', 'description']


class TenantSerializer(serializers.ModelSerializer):
    apps = AppSerializer(many=True, read_only=True)
    users_count = serializers.SerializerMethodField()

    class Meta:
        model = Tenant
        fields = ['id', 'name', 'slug', 'schema_name', 'is_active', 'created_at', 'apps', 'users_count']
        read_only_fields = ['schema_name', 'created_at', 'users_count']

    def get_users_count(self, obj):
        return obj.memberships.filter(is_active=True).count()


class TenantMembershipSerializer(serializers.ModelSerializer):
    user_email = serializers.CharField(source='user.email', read_only=True)
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)

    class Meta:
        model = TenantMembership
        fields = [
            'id', 'user', 'user_email', 'tenant', 'tenant_name',
            'tenant_role', 'is_active', 'created_at',
        ]
        read_only_fields = ['created_at']


class PlatformAppSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)
    tenant_slug = serializers.CharField(source='tenant.slug', read_only=True)

    class Meta:
        model = App
        fields = [
            'id', 'tenant', 'tenant_name', 'tenant_slug',
            'slug', 'name', 'description', 'is_active', 'created_at',
        ]
        read_only_fields = ['created_at']
