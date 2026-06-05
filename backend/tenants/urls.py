from django.urls import path
from .views import MyTenantsView

urlpatterns = [
    path('mine/', MyTenantsView.as_view(), name='my-tenants'),
]
