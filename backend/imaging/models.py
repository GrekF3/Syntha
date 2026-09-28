from django.db import models


class GeneratedImage(models.Model):
    class Meta:
        db_table = 'core_api_generatedimage'
        managed = False

    user = models.ForeignKey('core_api.User', on_delete=models.CASCADE, related_name='+')
    model = models.ForeignKey('catalog.AiModel', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    url = models.URLField()
    nsfw = models.BooleanField(default=False)
    prompt = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class ImageJob(models.Model):
    class Meta:
        db_table = 'imaging_imagejob'
        managed = True

    STATUS_CHOICES = [
        ("queued", "Queued"),
        ("running", "Running"),
        ("done", "Done"),
        ("failed", "Failed"),
    ]

    user = models.ForeignKey('core_api.User', on_delete=models.CASCADE, related_name='+')
    prompt = models.TextField(blank=True)
    model = models.ForeignKey('catalog.AiModel', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="queued")
    progress = models.PositiveSmallIntegerField(default=0)
    result_url = models.URLField(blank=True)
    error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
