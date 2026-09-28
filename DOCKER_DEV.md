Docker dev setup

Prereqs
- Docker Desktop (Windows/Mac) or Docker Engine (Linux)

Start
- Run: `docker compose up --build`
- Backend: http://localhost:8000 (Django runserver)
- Frontend: http://localhost:3000 (Next.js dev)
- Redis: on localhost:6379 (container `aigirls-redis`)
- Celery worker: container `aigirls-worker` (logs show task progress)

Hot reload
- Code is bind-mounted; edits reload automatically in both containers.

Environment
- Frontend calls same-origin `/api/*`; Next.js rewrites proxy to backend.
- Set `API_ORIGIN=http://backend:8000` in compose (used by Next.js rewrites).
- Optionally override client base with `NEXT_PUBLIC_API_BASE` (leave empty in Docker).
- CORS in Django allows localhost:3000 (not used with proxy, but safe).
- SQLite DB is bind-mounted: `backend/db.sqlite3`

Migrations
- Apply inside container: `docker compose exec backend python manage.py migrate imaging`

Image jobs (queue)
- Create job: `POST /api/v1/image-jobs/` with JSON `{ "prompt": "...", "model": <id|null> }`
- Or use helper: `POST /api/v1/images/generate/` → returns job payload and enqueues Celery
- Poll status: `GET /api/v1/image-jobs/<id>/`
- Fields: `status (queued|running|done|failed)`, `progress`, `result_url`

Providers
- Default provider is `stub` (returns `/girl.jpg`).
- To use Stability API: set `TXT2IMG_PROVIDER=stability` and `STABILITY_API_KEY` envs for `backend` and `worker` services. The task in `backend/imaging/tasks.py` will call Stability API and return a hosted URL if available.

Notes
- This is for development. For production, add Postgres, static serving, and run Django behind a proper ASGI/WSGI server.
- Redis and Celery worker are already included. To implement real generation, edit `backend/imaging/tasks.py:generate_image_job` to call your pipeline and set `result_url`.
