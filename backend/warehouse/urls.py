from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_nested.routers import NestedSimpleRouter
from . import views

router = DefaultRouter()
router.register('connector-types', views.ConnectorTypeViewSet, basename='connector-types')
router.register('connectors', views.TenantConnectorViewSet, basename='connectors')
router.register('resources', views.TenantResourceViewSet, basename='resources')
router.register('views', views.MaterializedViewViewSet, basename='materialized-views')

# Nested: /connectors/{pk}/resources/
connectors_router = NestedSimpleRouter(router, 'connectors', lookup='connector')
connectors_router.register('resources', views.ResourceViewSet, basename='connector-resources')

urlpatterns = [
    path('', include(router.urls)),
    path('', include(connectors_router.urls)),
]
