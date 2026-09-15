# Database

Local database: **PostgreSQL 16 + PostGIS**, started with Docker Compose.

## Connection (local prototype)

Default values from `.env.example`:

```text
Host: localhost
Port: 5432
Database: lmsmart
User: lmsmart
Password: lmsmart
URL: postgresql://lmsmart:lmsmart@localhost:5432/lmsmart
```

Change these in `.env` if port 5432 is already used.

## ORM

**Prisma** is the only ORM. Schema file: `database/schema/schema.prisma`.

Prisma colocates SQL migrations next to the schema file:

```text
database/schema/schema.prisma
database/schema/migrations/
database/seed/seed.ts
```

That is a Prisma constraint. Do not move the migrations folder by hand.

## PostGIS

The PostGIS image is used locally. Coordinates are stored as `latitude` / `longitude` decimals on `locations` so Prisma stays simple on Windows. The `postgis` extension is enabled in the first migration for later geographic queries.

## Tables

UUID primary keys. Core tables include `id`, `created_at`, `updated_at`.

```text
users, roles, user_roles
businesses, instrument_types, instruments
applications, application_documents
verification_schedules, inspections
inspection_checklists, inspection_measurements, inspection_photos
certificates, qr_tokens, verification_history
notifications, fraud_reports, locations, audit_logs
g_atcs, lm_officers
```

## Indexes

Certificate number, instrument code, serial number, application number, QR token, status, due date, and lat/long are indexed.

## Configurable tolerances

`instrument_types.default_permissible_error` is seed configuration for the prototype. It is **not** an official legal tolerance.

## Seed (Phase 2)

```powershell
npm run db:seed
```

Demo password for all seeded users: `Demo@12345`

| Role | Email |
| --- | --- |
| ADMIN | admin@lmsmart.demo |
| LMO | lmo@lmsmart.demo |
| GATC | gatc@lmsmart.demo |
| OWNER | owner@lmsmart.demo |
