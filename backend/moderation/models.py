from django.db import models


class Report(models.Model):
    class Meta:
        db_table = 'core_api_report'
        managed = False

    reporter = models.ForeignKey('core_api.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    model = models.ForeignKey('catalog.AiModel', on_delete=models.CASCADE, related_name='+')
    reason = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
