# API

The Fastify API will run at `http://localhost:4000`. This file lists the **planned** surface. Endpoints will be added only when the matching feature exists.

Base path: `/api`

## Implemented (Phase 2)

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/health` | none | API process check |
| POST | `/api/auth/register` | none | Owner self-registration (OWNER role only) |
| POST | `/api/auth/login` | none | JWT login; writes LOGIN audit row |
| GET | `/api/users/me` | JWT | Current user + roles |
| GET | `/api/admin/health` | JWT + ADMIN | RBAC check |

Staff accounts (admin / LMO / GATC) are seeded. Public registration cannot create those roles.

### Login body

```json
{ "email": "owner@lmsmart.demo", "password": "Demo@12345" }
```

### Login response

```json
{
  "token": "<jwt>",
  "user": { "id": "...", "email": "...", "fullName": "...", "roles": ["OWNER"] }
}
```

Use `Authorization: Bearer <jwt>` for `/api/users/me`.

| GET | `/api/dashboard/owner` | JWT + OWNER | Owner summary cards and recent lists |

## Instruments (Phase 3)

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/instrument-types` | JWT | Seeded type catalog |
| GET | `/api/businesses` | JWT + OWNER/ADMIN | List establishments |
| POST | `/api/businesses` | JWT + OWNER | Create establishment |
| POST | `/api/instruments` | JWT + OWNER | Register instrument |
| GET | `/api/instruments` | JWT + OWNER/ADMIN | List (owner-scoped) |
| GET | `/api/instruments/:id` | JWT + OWNER/ADMIN | Detail |
| PUT | `/api/instruments/:id` | JWT + OWNER | Update |

## Applications (Phase 3)

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/applications` | JWT + OWNER | Create draft |
| GET | `/api/applications` | JWT + OWNER/ADMIN | List |
| GET | `/api/applications/:id` | JWT + OWNER/ADMIN | Detail |
| POST | `/api/applications/:id/documents` | JWT + OWNER | Upload PDF/JPG/PNG |
| POST | `/api/applications/:id/submit` | JWT + OWNER | Submit draft |
| PUT | `/api/applications/:id/status` | JWT + OWNER | `{ "status": "SUBMITTED" }` only |

## Scheduling (Phase 4)

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/officers` | JWT + ADMIN | LMO/GATC assignment list |
| GET | `/api/scheduling` | JWT + ADMIN/LMO/GATC | Schedules |
| POST | `/api/scheduling` | JWT + ADMIN | Date/time + assign officer |
| POST | `/api/scheduling/assign` | JWT + ADMIN | Assign officer on existing schedule |
| POST | `/api/applications/:id/review` | JWT + ADMIN | SUBMITTED → UNDER_REVIEW |
| GET | `/api/dashboard/admin` | JWT + ADMIN | Scheduling desk |
| GET | `/api/dashboard/officer` | JWT + LMO/GATC | Assigned inspections |

Scheduling with an officer moves status SUBMITTED → UNDER_REVIEW → SCHEDULED → ASSIGNED.

## Inspections (Phase 4)

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/inspections` | JWT + LMO/GATC/ADMIN | Start inspection; ASSIGNED → INSPECTION_IN_PROGRESS |
| GET | `/api/inspections` | JWT + LMO/GATC/ADMIN | List |
| GET | `/api/inspections/:id` | JWT | Detail |
| PUT | `/api/inspections/:id` | JWT + officer | Checklist, remarks, GPS |
| POST | `/api/inspections/:id/photos` | JWT + officer | Upload photo |
| POST | `/api/inspections/:id/measurements` | JWT + officer | error = observed − test load |
| POST | `/api/inspections/:id/complete` | JWT + officer | PASS / FAIL / REQUIRES_REVIEW |

Permissible error on measurements is **prototype/demo configuration** from `instrument_types.default_permissible_error`, not an official legal tolerance.

Complete: PASS → application `PASSED`; FAIL → `FAILED`; REQUIRES_REVIEW → `UNDER_REVIEW`.

## Certificates (Phase 5)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/certificates` | Generate after PASS inspection |
| GET | `/api/certificates` | List certificates for the signed-in role |
| GET | `/api/certificates/:id` | Metadata |
| GET | `/api/certificates/:id/pdf` | Download PDF |

QR codes encode the public web page `/verify/:token`. The page calls `GET /api/public/verify/:token`. Tokens are HMAC-SHA256 signed with `HMAC_SECRET` and stored in `qr_tokens`.

| PATCH | `/api/certificates/:id/prototype-due` | Admin demo: set `nextDueAt` |
| POST | `/api/certificates/:id/reverify` | Owner starts a REVERIFICATION draft |

## Public verification (Phase 5)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/public/verify/:token` | QR token check: VALID, EXPIRED, REVOKED, INVALID |

Public responses must not include private owner contact details.

## Dashboards and notifications (Phase 6)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/dashboard/owner` | Owner cards, expiry lists, reverification |
| GET | `/api/dashboard/officer` | LMO/GATC |
| GET | `/api/dashboard/admin` | Queue plus expiry monitoring |
| GET | `/api/notifications` | In-app + mock channel alerts (syncs expiry first) |
| POST | `/api/notifications/refresh` | Recalculate expiry and create missing alerts |
| POST | `/api/notifications/:id/read` | Mark read |

Expiry buckets are computed from `certificates.next_due_date`: 90+ days, 30–90, 7–30, less than 7, EXPIRED. No cron job.

## Fraud (Phase 8)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/fraud/reports` | Public report |
| GET | `/api/fraud/heatmap` | Advisory clustering |

## Intelligence (Phase 8 Step 1, FastAPI `:8000`)

The browser never calls FastAPI. Fastify proxies after JWT auth.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/intelligence/health` | Whether the Python service is up |
| POST | `/api/intelligence/ocr` | Multipart `file`; optional `instrumentId` / `documentId` |

Python:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | `{ "status": "ok" }` |
| POST | `/ocr/extract` | Structured extraction |

OCR output is advisory. Mismatches are review signals, not fraud. If FastAPI is down, Fastify returns **503** for the OCR route only; applications still submit.

## Later phases

Fraud clustering and risk scoring are **not** implemented yet.
