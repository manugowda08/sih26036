# LM Smart SIH demo runbook

This is the **implemented** SIH 2026 PS26036 workflow in this repository, not a generic Legal Metrology manual.

Project root: `C:\Dev\Projects\sih26036`  
Web: `http://localhost:3000`  
API: `http://localhost:4000`  
PostgreSQL (Docker PostGIS): **host port 5433** (`DATABASE_PORT` in `.env`)

Do **not** run `npm run db:reset`, `prisma migrate reset`, `DROP DATABASE`, or `docker compose down -v` for a demo refresh. Those destroy schema and volumes.

Do **not** run `npm run db:seed` after a clean reset unless you want the seed business **Demo Retail Stores Pvt Ltd** recreated. Seed will **not** recreate instruments or applications. It **will** upsert demo users, roles, instrument types, LMO/GATC rows, and the Bengaluru HQ location.

---

## 1. Services startup

Open **three** terminals. Leave them running.

Terminal A — PostgreSQL:

```powershell
cd C:\Dev\Projects\sih26036
docker compose up -d
docker compose ps
```

Wait until `lm-smart-postgres` is healthy. Port mapping is `5433->5432`.

Terminal B — Fastify API:

```powershell
cd C:\Dev\Projects\sih26036
npm run dev:api
```

Leave this running. Health check: `http://localhost:4000/api/health`

Terminal C — Next.js web:

```powershell
cd C:\Dev\Projects\sih26036
npm run dev:web
```

Leave this running. Open `http://localhost:3000`

Flutter (separate terminal, after USB device is connected):

```powershell
$env:PUB_CACHE = "C:\Dev\PubCache"
cd C:\Dev\Projects\sih26036\apps\mobile
C:\Dev\flutter\bin\flutter devices
```

Confirm device id `bee9007d`. Then:

```powershell
ipconfig
```

Use the **Wi-Fi/Ethernet IPv4** of the laptop (not VMware, WSL, or Bluetooth). Example only: `172.20.10.4` — **this can change**. Then:

```powershell
C:\Dev\flutter\bin\flutter run -d bee9007d --dart-define=API_BASE_URL=http://<LAPTOP_LAN_IP>:4000
```

Laptop and phone must be on the same network. Windows Firewall must allow inbound TCP **4000**. Do not use `localhost` or `127.0.0.1` on the phone.

---

## 2. Demo credentials

Password for all seeded accounts: `Demo@12345`

| Role in DB | Email | Full name |
| --- | --- | --- |
| OWNER | `owner@lmsmart.demo` | Demo Instrument Owner |
| ADMIN | `admin@lmsmart.demo` | Demo Administrator |
| LMO | `lmo@lmsmart.demo` | Demo Legal Metrology Officer |
| GATC | `gatc@lmsmart.demo` | Demo GATC Operator |

GATC can inspect like LMO on web/Flutter. This demo assigns **LMO**.

---

## 3. Clean starting state

After controlled cleanup, the database should have:

- 4 users, 4 roles, 4 user_roles
- 7 instrument types
- 1 LMO row (`LMO-BLR-001`)
- 1 GATC row (`GATC-BLR-001`)
- 1 location (Bengaluru demo HQ)
- **0** businesses, instruments, applications, schedules, inspections, measurements, photos, certificates, QR tokens, notifications, audit logs, fraud reports

Owner dashboard: 0 instruments, 0 applications, 0 certificates.  
Admin desk: 0 submitted / assigned / in progress.  
LMO dashboard: Assigned 0, Upcoming 0, Completed 0.

**Do not create the first instrument/application in the database for the presenter.** Create them live using the steps below.

### Flutter old field-test data

Phase 7 Step 3 stores:

- SQLite: `lm_smart_offline.db` (cached assignments + inspection drafts)
- Photos: app documents `lm_smart_evidence/<officerId>/<draftId>/`
- Session: JWT in app-private storage (not the password)

This is **old test data** after the server reset. It is not live server work.

**Safest clear on the physical phone:** Settings → Apps → LM Smart → **Storage → Clear data**, or **uninstall and reinstall**, then `flutter run` again. That wipes local SQLite, evidence files, and the saved session. It does not change PostgreSQL.

Then sign in again with `lmo@lmsmart.demo`.

Web browser: Sign out (clears `lm_smart_token` in localStorage).

---

## 4–7. Owner workflow (one consistent scenario)

Use **one** fictional establishment and instrument for the whole SIH demo.

### STEP 1 — Owner login

1. Open `http://localhost:3000`
2. Sign in (not “Register as owner”)
3. Email: `owner@lmsmart.demo`
4. Password: `Demo@12345`

Expected: `/dashboard` — Owner dashboard, empty lists.

There is **no separate business/profile page**. The owner creates a business **inside Register instrument** when no business exists.

### STEP 2 — Register instrument

Nav: **Register instrument** → `/instruments/new`

| Field (UI label) | Type | Required | Valid demo value |
| --- | --- | --- | --- |
| Instrument type | dropdown | required | `Electronic weighing machine (EWM)` |
| Business / establishment | text (first time) | required, min 2 chars | `Om Demo Traders` |
| GSTIN (optional) | text, max 20 | optional | `29AABCD1234E1Z5` |
| Manufacturer | text, min 2 | required | `DemoTech Instruments` |
| Model | text, min 1 | required | `LM-500` |
| Serial number | text, min 1 | required | `SIH-DEMO-001` |
| Capacity / range | text, min 1 | required | `30 kg` |
| Accuracy class (optional) | text | optional | `III` |
| Purpose / use | text | optional | `Retail counter demonstration` |
| Address | text, min 5 | required | `42 Demo Market Road` |
| City | text, min 2 | required | `Bengaluru` |
| District | text | optional | `Bengaluru Urban` |
| State | text, min 2 | required | `Karnataka` |
| Previous certificate number | text | optional | leave blank |
| Last verification date | date | optional | leave blank |
| Valid until / next due date | date YYYY-MM-DD | optional | leave blank |

The form does **not** collect GPS. The API stores default coordinates **12.9716, 77.5946** when latitude/longitude are omitted.

Click **Save instrument**.

Expected: `/instruments/<id>`, status **DRAFT**, code like `LM-2026-00001`.

### STEP 3–5 — Verification application and submit

Nav: **Apply** → `/applications/new` (or from instrument: Apply for verification).

The current **Apply** form creates a draft, uploads a document, and **submits in one click**. You will not stay on DRAFT if this form succeeds.

| Field | Type | Required | Demo value |
| --- | --- | --- | --- |
| Registered instrument | dropdown | required | `LM-2026-00001 · SN SIH-DEMO-001` |
| Application type | dropdown | required | `Verification` (`VERIFICATION`) |
| Required document | file PDF/JPG/PNG | required in UI **and** API | any small PDF/JPG/PNG ≤ 5 MB |
| Remarks (optional) | textarea, max 500 | optional | `SIH demo verification for Om Demo Traders` |

Auto-filled from the instrument (not shown as extra inputs): `businessId`, owner, instrument id.

Click **Submit application**.

Expected:

- Application status **SUBMITTED**
- Instrument `currentStatus` **SUBMITTED**
- Application number like `APP-2026-00001`

Backend refuses submit if there is no document: `Upload at least one supporting document before submitting`.

---

## 8. Admin — review, schedule, assign

1. Sign out owner. Open `http://localhost:3000`
2. Email: `admin@lmsmart.demo` / `Demo@12345`
3. Dashboard **Scheduling and expiry desk**, or nav **Applications**
4. Open `APP-2026-00001`

Optional: **Take up for review** → status **UNDER_REVIEW**.  
Scheduling from SUBMITTED also sets UNDER_REVIEW internally, then schedule+assign.

**Schedule and assign officer** (current fields):

| Field | Type | Required | Demo value |
| --- | --- | --- | --- |
| Inspection date and time | datetime-local | required | tomorrow 10:00 (must be in the future if you want Flutter **Upcoming** > 0) |
| Assign LMO / GATC | dropdown | required | `Demo Legal Metrology Officer (LMO LMO-BLR-001)` |
| Assignment note | text | optional | `Assigned by administrator for field verification` |

Click **Save schedule and assignment**.

Implemented status transition: **SUBMITTED → UNDER_REVIEW → SCHEDULED → ASSIGNED** in one save. The application you then see is **ASSIGNED**. `SCHEDULED` is not left as the resting status.

---

## 9. Flutter LMO — where the job appears

Sign in on the phone: `lmo@lmsmart.demo` / `Demo@12345`. Set API URL to `http://<LAN_IP>:4000`.

Officer dashboard (`GET /api/dashboard/officer`):

| Card | Actual rule |
| --- | --- |
| **Assigned** | Applications whose schedule `assignedOfficerId` is this officer **and** status is `ASSIGNED` or `INSPECTION_IN_PROGRESS` |
| **Upcoming** | Schedules for this officer with `scheduledAt >= now` |
| **Completed** | Inspections by this officer with `submittedAt` not null |

The list **Assigned inspections / Field jobs** is the Assigned set, not Upcoming-only.

If the schedule time is in the past, Assigned can still show the job, but Upcoming stays 0.

---

## 10. Field inspection (current Flutter sequence)

1. LMO dashboard  
2. Assigned inspections  
3. Inspection details (application, owner/business, instrument, manufacturer, model, serial, capacity, location, schedule)  
4. **Start inspection** (online: `POST /api/inspections` → status **INSPECTION_IN_PROGRESS**; offline: local draft)  
5. GPS verification  
6. Measurement entry + checklist  
7. Capture evidence  
8. Remarks and PASS / FAIL  
9. Review and submit  

Certificate is **not** generated in Flutter.

### Measurement sample (not a legal MPE)

Instrument type **EWM** seed: `defaultPermissibleError = 0.5`, **unit = g** (prototype configuration).

| Field | Example |
| --- | --- |
| Capacity | `30` (parsed from `30 kg` or typed) |
| Test load | `10` |
| Observed reading | `10.02` |
| Error (computed) | `+0.02` (`observed − test load`) |
| Configured prototype limit | `0.5` |

This is **not** a statutory tolerance table.

Checklist: toggle the eight items (optional for the complete API; save them with GPS/remarks).

Camera: capture, preview, retake/remove, attach. At least one photo is required by the Flutter wizard.

GPS: capture current coordinates. Flutter requires GPS before continue. Backend complete does **not** require GPS.

PASS: remarks optional.  
FAIL: Flutter requires remarks; backend remarks remain optional.

Submit online: `POST /api/inspections/:id/complete` → application **PASSED** or **FAILED**.

---

## 11. Offline-mode demonstration

1. Login **online**, load assigned list (cache written).  
2. Turn off Wi-Fi **and** mobile data.  
3. Reopen dashboard → **OFFLINE MODE — showing cached inspections**.  
4. Open the cached job, complete GPS / measurement / photo / remarks / PASS or FAIL.  
5. Submit → **Saved offline — Pending synchronization**.  
6. Force-stop the app, reopen still offline → pending draft remains.  
7. Restore connectivity. **Sync Now**.  
8. Status **Synced**. Confirm the same inspection on web.

Do not generate certificates offline.

---

## 12. PASS / FAIL, certificate, QR

After a **PASS** inspection (status **PASSED**):

Certificate is **not automatic**. Either:

- Web inspection page (LMO/GATC/ADMIN): **Generate verification certificate**, or  
- Admin application page when status is PASSED: **Generate verification certificate**

`POST /api/certificates` with `{ inspectionId }`. Status becomes **CERTIFICATE_GENERATED** / instrument **ACTIVE**.

Open `/certificates/<id>`:

- Download PDF  
- **Open public verification** (`/verify/<token>`)  
- Public API `GET /api/public/verify/:token` → VALID / EXPIRED / REVOKED / INVALID  

QR encodes that public web URL. Tokens are HMAC-signed.

---

## 13. Expiry / reverification

Admin on the certificate page: **Prototype due date (admin demo)** — `PATCH /api/certificates/:id/prototype-due` with `nextDueAt` (date).

Buckets from `nextDueAt`: 90+, 30–90, 7–30, &lt;7, EXPIRED. Notifications are computed on dashboard/notification load (no cron).

Owner on a certificate with `canReverify` (expired or within 90 days): **Start reverification** → new application `kind=REVERIFICATION`, then the same schedule → inspect → certificate path.

---

## 14. Expected status after each live step

| Step | Application / instrument status |
| --- | --- |
| Instrument saved | Instrument `DRAFT` |
| Application submitted | Application `SUBMITTED` |
| Admin schedule+assign | Application `ASSIGNED` |
| LMO starts inspection | `INSPECTION_IN_PROGRESS` |
| LMO PASS | `PASSED` |
| LMO FAIL | `FAILED` (no certificate) |
| Certificate generated | `CERTIFICATE_GENERATED` / instrument `ACTIVE` |
| Admin due date in the past | Expiry UI `EXPIRED`; owner can reverify |

---

## 14b. OCR assist (Phase 8 Step 1)

Optional fourth terminal — Python intelligence:

```powershell
cd C:\Dev\Projects\sih26036\services\intelligence
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Demo file: `services/intelligence/fixtures/demo_clear.pdf`  
Mismatch file: `services/intelligence/fixtures/demo_mismatch.pdf`

On **Apply** (`/applications/new`):

1. Select `LM-2026-00001 · SN SIH-DEMO-001`
2. Attach `demo_clear.pdf`
3. **Analyze document**
4. Suggested details should include manufacturer DemoTech Instruments, model LM-500, serial SIH-DEMO-001, 30 kg
5. No mismatch (review signal empty)
6. Submit as usual

To show a review signal, attach `demo_mismatch.pdf` instead. Expect **Serial number mismatch** and **Capacity mismatch**. This is not labelled fraud. You may still submit.

If the Python terminal is not running, Analyze shows that OCR is unavailable. **Submit application** still works.

---

## 15. Troubleshooting

| Problem | Check |
| --- | --- |
| Phone cannot login | API URL is laptop LAN IP:4000, not localhost; API bound `0.0.0.0`; same Wi-Fi; firewall |
| LAN IP changed | `ipconfig` again; pass `--dart-define=API_BASE_URL=...` or type URL on the login screen |
| Empty LMO list | Application must be **ASSIGNED** to `lmo@lmsmart.demo` |
| Upcoming = 0 | Schedule time is in the past |
| Submit application fails | Attach a PDF/JPG/PNG. If the page said **Bad Request**, refresh and submit again (empty JSON POST bug is fixed). A leftover **DRAFT** application can be opened from Applications and submitted there. |
| Cannot schedule | Application not SUBMITTED/UNDER_REVIEW |
| Analyze document fails | Start `dev:ai` on port 8000; use a text PDF such as `demo_clear.pdf`; RapidOCR is only needed for photos |
| OCR mismatches | Review signal only. Confirm or ignore; application can still be submitted |
| Old Flutter jobs after DB reset | Clear app storage / reinstall |
| `db:seed` brought a business back | Expected: seed upserts Demo Retail Stores. Delete that business again if you need a blank owner dashboard |

---

## 16. Terminals that must stay running

1. Docker Postgres (`docker compose up -d` can be detached; container must stay up)  
2. `npm run dev:api`  
3. `npm run dev:web`  
4. Optional: intelligence OCR `python -m uvicorn ... --port 8000`  
5. `flutter run -d bee9007d ...` while demonstrating the phone  

Ports: web **3000**, API **4000**, Postgres **5433**, intelligence **8000**.
