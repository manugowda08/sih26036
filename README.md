# LM Smart

Legal Metrology Smart Verification Platform — Smart India Hackathon 2026, Problem Statement **SIH26036**.

**Development of an Online Verification System for Weighing and Measuring Instruments**

This repository is a single-laptop prototype. The goal is a reliable demonstration of the legal-metrology verification lifecycle, not production-scale infrastructure.

## Current status

**Phase 4 — Scheduling + field inspection** is in place. Admins can assign LMO/GATC officers and schedule visits. Officers can record checklist, measurements, photos, and PASS/FAIL. Certificates and QR are not built yet.

## Problem statement

LM Smart digitizes the lifecycle of weighing and measuring instrument verification in India:

register user → register instrument → apply for verification → admin review → schedule → assign officer → field inspection → pass/fail → digital certificate + QR → public verification → expiry monitoring → re-verification.

## Architecture (target)

```text
Next.js (localhost:3000)
        ↓
Fastify REST API (localhost:4000)
        ↓
PostgreSQL + PostGIS (localhost:5432)

Flutter field app  →  Fastify API
FastAPI (localhost:8000)  →  OCR / risk / analytics (optional)
```

Only PostgreSQL/PostGIS is containerized for local development. The web, API, AI, and Flutter apps will run directly on Windows.

## Technology stack

| Layer | Choice |
| --- | --- |
| Web | Next.js, TypeScript, Tailwind CSS |
| API | Node.js, Fastify, TypeScript |
| Database | PostgreSQL + PostGIS |
| ORM | Prisma (chosen for simpler Windows setup) |
| Intelligence | Python, FastAPI (Phase 8) |
| Mobile | Flutter (`apps/mobile`, Phase 7) |

## Repository layout

```text
sih26036/                  # workspace root (LM Smart monorepo)
├── apps/web/              # Next.js owner portal
├── apps/mobile/           # Flutter field app (Phase 7)
├── services/api/          # Fastify JWT API
├── services/intelligence/ # FastAPI (later)
├── packages/              # shared types, validation, config
├── database/              # Prisma schema, migrations, seed
├── storage/               # certificates, photos, documents
├── scripts/
├── docs/
├── docker-compose.yml
├── .env.example
└── package.json
```

The folder is named `sih26036` on disk. The product name is **LM Smart**. Nested `lm-smart/` was not created to avoid an extra directory on an already empty workspace.

## Environment setup

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and start it.
2. Copy environment variables:

```powershell
Copy-Item .env.example .env
```

3. Install Node dependencies (from this folder):

```powershell
npm install
```

4. Start the database:

```powershell
docker compose up -d
docker compose ps
```

Expected: container `lm-smart-postgres` running, port `5432`.

5. Apply schema and seed demo users:

```powershell
npx prisma migrate deploy --schema database/schema/schema.prisma
npm run db:generate
npm run db:seed
```

6. Start the API and owner web app:

```powershell
npm run dev:api
npm run dev:web
```

Web: http://localhost:3000  
API: http://localhost:4000

7. Stop the database when needed:

```powershell
docker compose down
```

Data is kept in a Docker volume (`lm_smart_pgdata`) unless you also remove volumes.

## Local ports

| Service | Default URL |
| --- | --- |
| Next.js web | http://localhost:3000 |
| Fastify API | http://localhost:4000 |
| FastAPI intelligence | http://localhost:8000 |
| PostgreSQL | localhost:5432 |

## Demo accounts

All seeded users share this password: **`Demo@12345`**

| Role | Email |
| --- | --- |
| Admin | admin@lmsmart.demo |
| LMO | lmo@lmsmart.demo |
| GATC | gatc@lmsmart.demo |
| Owner | owner@lmsmart.demo |

Do not use real people's personal information.

## Documentation

- [Architecture](docs/architecture.md)
- [API](docs/api.md)
- [Database](docs/database.md)
- [Deployment](docs/deployment.md)

## SIH demonstration workflow

The owner login → register instrument → apply → submitted-status flow is implemented. Admin review, scheduling, inspection, and certificates come in later phases.

## Phase 2 login test (PowerShell)

```powershell
$body = @{ email = "owner@lmsmart.demo"; password = "Demo@12345" } | ConvertTo-Json
$login = Invoke-RestMethod -Uri http://localhost:4000/api/auth/login -Method POST -Body $body -ContentType "application/json"
$login.user
$headers = @{ Authorization = "Bearer $($login.token)" }
Invoke-RestMethod -Uri http://localhost:4000/api/users/me -Headers $headers
```

## Future improvements

Phase 5: digital certificates and public QR verification.
