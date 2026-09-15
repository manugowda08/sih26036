# Architecture

LM Smart is a hackathon prototype for SIH 2026 PS26036. It models the digital lifecycle of legal-metrology instrument verification on one Windows laptop.

## Target system

```text
                    ┌─────────────────────┐
                    │      Next.js Web    │
                    │   localhost:3000    │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   Fastify REST API  │
                    │   localhost:4000    │
                    └───────┬─────┬───────┘
                            │     │
                ┌───────────┘     └─────────────┐
                ▼                               ▼
       ┌─────────────────┐              ┌─────────────────┐
       │ PostgreSQL +    │              │ FastAPI         │
       │ PostGIS         │              │ Intelligence    │
       │ localhost:5432  │              │ localhost:8000  │
       └─────────────────┘              └─────────────────┘
                                                │
                                                ▼
                                      OCR / Risk / Analytics

                    ┌─────────────────────┐
                    │ Flutter Field App   │
                    └──────────┬──────────┘
                               │
                               ▼
                         Fastify API
```

## Why this split

- **Next.js** is the owner, LMO, GATC, admin, and public verification UI.
- **Fastify** is the only source of truth for workflow, auth, files, and certificates. The web app and Flutter app both call this API. There are no mock APIs disconnected from the database.
- **PostgreSQL + PostGIS** stores users, instruments, inspections, certificates, and coordinates.
- **FastAPI** is optional intelligence (OCR, advisory risk score). It must not make legally authoritative pass/fail decisions.
- **Flutter** is the field inspection client (Phase 7). Until then, LMO inspection can be demonstrated on the web.

## Simpler choices for this prototype

| Decision | Choice | Reason |
| --- | --- | --- |
| ORM | **Prisma** | Simpler Windows setup than Drizzle for this prototype: schema file, `prisma migrate`, and `prisma db seed` without extra SQL tooling. One ORM only. |
| Docker | **Postgres/PostGIS only** | Avoids containerizing Next.js, Fastify, FastAPI, and Flutter on Windows. |
| Storage | **Local folders** | `storage/certificates`, `storage/photos`, `storage/documents`. No S3. |
| Monorepo | **npm workspaces** | Root workspaces include `services/api` and `packages/*`. `apps/*` is added when those apps have their own `package.json`. |
| Passwords | **bcryptjs** | bcrypt-compatible hashing without native Windows build tools. |
| Root folder | **this workspace** | The disk folder is `sih26036`. Product name is LM Smart. No nested `lm-smart/` directory. |

## Roles

- **OWNER** — register instruments, apply, track, view/download certificates.
- **LMO** — assigned field inspections, checklist, measurements, photos, recommend pass/fail.
- **GATC** — same inspection flow, scoped to GATC assignments.
- **ADMIN** — review applications, schedule, assign officers, dashboards, audit.
- **PUBLIC** — verify certificate by token/number. No private owner data.

## Workflow (later phases)

Status transitions will be validated on the API only. The frontend cannot force invalid statuses.

```text
DRAFT → SUBMITTED → UNDER_REVIEW → SCHEDULED → ASSIGNED
→ INSPECTION_IN_PROGRESS → PASSED | FAILED
→ CERTIFICATE_GENERATED → ACTIVE → EXPIRING → EXPIRED → REVERIFICATION
```

## Security (prototype)

JWT auth, bcrypt passwords, RBAC, Zod validation, CORS, rate limiting, upload checks, audit logs. Secrets live in `.env`, not in source. `.env.example` documents names only.

## Phase boundary

Phase 2 adds Prisma schema/migrations, seeded users/roles, Fastify JWT login, bcrypt, and RBAC. It does **not** implement instrument registration UI or inspection workflows.
