import os
from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "ai_girls.settings")

app = Celery("ai_girls")

# Configure broker/backend via env (defaults for docker-compose)
app.conf.broker_url = os.environ.get("CELERY_BROKER_URL", "redis://redis:6379/0")
app.conf.result_backend = os.environ.get("CELERY_RESULT_BACKEND", "redis://redis:6379/1")

# Reasonable defaults for dev
app.conf.task_serializer = "json"
app.conf.accept_content = ["json"]
app.conf.result_serializer = "json"
app.conf.timezone = os.environ.get("TZ", "UTC")
app.conf.enable_utc = True

app.autodiscover_tasks()

