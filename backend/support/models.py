from django.db import models


class SupportTicket(models.Model):
    class Meta:
        db_table = 'core_api_supportticket'
        managed = False

    STATUS_CHOICES = (
        ("new", "New"),
        ("in_progress", "In Progress"),
        ("resolved", "Resolved"),
    )
    user = models.ForeignKey('core_api.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    email = models.EmailField(blank=True)
    subject = models.CharField(max_length=200)
    message = models.TextField()
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="new")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
