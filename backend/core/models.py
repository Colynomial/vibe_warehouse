from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Custom user model. Email is the primary login field."""
    email = models.EmailField(unique=True)
    username = models.CharField(max_length=150, blank=True)
    is_platform_admin = models.BooleanField(default=False)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

    def __str__(self):
        return self.email
