from django.urls import path

from .views import MonitoringOverviewView

urlpatterns = [
    path('overview/', MonitoringOverviewView.as_view(), name='monitoring-overview'),
]
