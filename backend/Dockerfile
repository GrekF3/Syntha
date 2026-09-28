# syntax=docker/dockerfile:1
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN addgroup --system app && adduser --system --ingroup app app

# System deps (optional): add build tools if you add deps that need compiling
RUN apt-get update -y && apt-get install -y --no-install-recommends \
    libpq5 curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/requirements.txt
RUN pip install -r requirements.txt

# Copy project
COPY --chown=app:app backend /app

USER app

EXPOSE 8000

# Default dev command; overridden in docker-compose
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]

