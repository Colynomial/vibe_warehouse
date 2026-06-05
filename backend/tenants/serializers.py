from rest_framework import serializers
from .models import Tenant, TenantMembership, App


class AppSerializer(serializers.ModelSerializer):
    class Meta:
        model = App
        fields = ['id', 'slug', 'name', 'description']


class TenantSerializer(serializers.ModelSerializer):
    apps = AppSerializer(many=True, read_only=True)

    class Meta:
        model = Tenant
        fields = ['id', 'name', 'slug', 'apps']
