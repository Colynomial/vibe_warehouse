from django.core.management.base import BaseCommand
from core.models import User
from tenants.models import Tenant, TenantMembership, App


class Command(BaseCommand):
    help = 'Seed the database with demo data (superuser + Faam tenant)'

    def handle(self, *args, **options):
        # Create superuser
        if not User.objects.filter(email='colin@colynomial.com').exists():
            user = User.objects.create_superuser(
                email='colin@colynomial.com',
                username='colin',
                password='demo1234',
                first_name='Colin',
                last_name='van Garderen',
                is_platform_admin=True,
            )
            self.stdout.write(self.style.SUCCESS(f'Created superuser: {user.email}'))
        else:
            user = User.objects.get(email='colin@colynomial.com')
            self.stdout.write(f'Superuser already exists: {user.email}')

        # Create Faam tenant
        tenant, created = Tenant.objects.get_or_create(
            slug='faam',
            defaults={'name': 'Faam', 'schema_name': 'tenant_faam'}
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f'Created tenant: {tenant.name}'))
        else:
            self.stdout.write(f'Tenant already exists: {tenant.name}')

        # Create membership
        membership, created = TenantMembership.objects.get_or_create(
            user=user,
            tenant=tenant,
            defaults={'tenant_role': 'admin'}
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f'Added {user.email} as admin to {tenant.name}'))

        # Create apps for Faam
        apps_data = [
            {'slug': 'dashboard', 'name': 'Faam Dashboard', 'description': 'Main data dashboard'},
        ]
        for app_data in apps_data:
            app, created = App.objects.get_or_create(
                tenant=tenant,
                slug=app_data['slug'],
                defaults=app_data
            )
            if created:
                self.stdout.write(self.style.SUCCESS(f'Created app: {app}'))

        self.stdout.write(self.style.SUCCESS('\nDone! Login with: colin@colynomial.com / demo1234'))
