from rest_framework import serializers
from django.contrib.auth import authenticate
from .models import User
from tenants.models import Tenant, TenantMembership


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        user = authenticate(username=data['email'], password=data['password'])
        if not user:
            raise serializers.ValidationError('Invalid email or password.')
        if not user.is_active:
            raise serializers.ValidationError('Account is disabled.')
        data['user'] = user
        return data


class UserSerializer(serializers.ModelSerializer):
    tenants = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name', 'is_platform_admin', 'tenants']

    def get_tenants(self, obj):
        from tenants.models import TenantMembership
        memberships = TenantMembership.objects.filter(user=obj, is_active=True).select_related('tenant')
        return [
            {
                'id': m.tenant.id,
                'name': m.tenant.name,
                'slug': m.tenant.slug,
                'role': m.tenant_role,
                'apps': [
                    {
                        'id': app.id,
                        'slug': app.slug,
                        'name': app.name,
                        'description': app.description,
                    }
                    for app in m.tenant.apps.filter(is_active=True).order_by('name')
                ],
            }
            for m in memberships
        ]


class MembershipWriteSerializer(serializers.Serializer):
    tenant_id = serializers.IntegerField()
    tenant_role = serializers.ChoiceField(choices=[c[0] for c in TenantMembership.ROLE_CHOICES], default='user')
    is_active = serializers.BooleanField(default=True)


class PlatformUserSerializer(serializers.ModelSerializer):
    memberships = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'email', 'first_name', 'last_name',
            'is_platform_admin', 'is_active', 'memberships',
        ]

    def get_memberships(self, obj):
        memberships = TenantMembership.objects.filter(user=obj).select_related('tenant').order_by('tenant__name')
        return [
            {
                'id': m.id,
                'tenant_id': m.tenant_id,
                'tenant_name': m.tenant.name,
                'tenant_slug': m.tenant.slug,
                'tenant_role': m.tenant_role,
                'is_active': m.is_active,
            }
            for m in memberships
        ]


class PlatformUserWriteSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    memberships = MembershipWriteSerializer(many=True, required=False)

    class Meta:
        model = User
        fields = [
            'id', 'email', 'first_name', 'last_name',
            'is_platform_admin', 'is_active', 'password', 'memberships',
        ]

    def validate_memberships(self, value):
        tenant_ids = [item['tenant_id'] for item in value]
        existing_count = Tenant.objects.filter(id__in=tenant_ids).count()
        if existing_count != len(set(tenant_ids)):
            raise serializers.ValidationError('One or more tenant_ids are invalid.')
        return value

    def _sync_memberships(self, user, memberships_data):
        TenantMembership.objects.filter(user=user).delete()
        for item in memberships_data:
            TenantMembership.objects.create(
                user=user,
                tenant_id=item['tenant_id'],
                tenant_role=item.get('tenant_role', 'user'),
                is_active=item.get('is_active', True),
                invited_by=self.context['request'].user if self.context.get('request') else None,
            )

    def create(self, validated_data):
        memberships_data = validated_data.pop('memberships', [])
        password = validated_data.pop('password', '')
        email = validated_data.get('email', '')

        user = User.objects.create_user(
            username=email,
            email=email,
            password=password or None,
            **validated_data,
        )
        if not password:
            user.set_unusable_password()
            user.save(update_fields=['password'])

        self._sync_memberships(user, memberships_data)
        return user

    def update(self, instance, validated_data):
        memberships_data = validated_data.pop('memberships', None)
        password = validated_data.pop('password', None)

        for field, value in validated_data.items():
            setattr(instance, field, value)

        if password:
            instance.set_password(password)

        instance.save()

        if memberships_data is not None:
            self._sync_memberships(instance, memberships_data)

        return instance
