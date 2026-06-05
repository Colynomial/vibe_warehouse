from django.contrib import admin
from .models import APIRequestLog


@admin.register(APIRequestLog)
class APIRequestLogAdmin(admin.ModelAdmin):
    list_display = ['timestamp', 'method', 'endpoint', 'status_code', 'duration_ms', 'user', 'tenant']
    list_filter = ['method', 'status_code', 'tenant']
    date_hierarchy = 'timestamp'
