# Deployment

This prototype is meant to run on **one Windows laptop**. There is no cloud production target.

## Windows local run

1. Install Docker Desktop and start it (Linux containers).
2. Copy `.env.example` to `.env` and set `JWT_SECRET` / `HMAC_SECRET` (16+ characters).
3. `npm install`
4. `docker compose up -d --wait`
5. `npx prisma migrate deploy --schema database/schema/schema.prisma`
6. `npm run db:generate`
7. `npm run db:seed`
8. `npm run dev:api` → http://localhost:4000
9. `npm run dev:web` → http://localhost:3000

Passwords are hashed with **bcryptjs** (bcrypt-compatible, no native Windows compile). JWT and RBAC are enforced in Fastify.

## Docker scope

Only PostgreSQL + PostGIS is containerized. Web, API, AI, and Flutter stay on the host so Windows debugging stays simple.

To stop Postgres:

```powershell
docker compose down
```

To wipe database data (destructive):

```powershell
docker compose down -v
```

## Ports

Override in `.env`:

```text
WEB_PORT=3000
API_PORT=4000
AI_PORT=8000
DATABASE_PORT=5432
```

## Secrets

Never commit `.env`. `JWT_SECRET` and `HMAC_SECRET` must be at least 16 characters.

## Flutter / Python

Flutter is **not** installed on this machine yet. It is required only from Phase 7.

Python 3.11 is installed. FastAPI work starts in Phase 8.

Native `psql` is **not** installed. That is fine: Docker provides Postgres. Optional: `docker exec -it lm-smart-postgres psql -U lmsmart -d lmsmart`
