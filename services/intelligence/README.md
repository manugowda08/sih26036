# LM Smart intelligence service (Phase 8 Step 1)

Optional FastAPI service for **document OCR and structured extraction**.

It is not the application backend. Fastify (`:4000`) remains the only API the web and Flutter apps call.

```text
Next.js / Flutter  →  Fastify  →  this service (:8000)  →  OCR / regex extraction
```

If this process is stopped, owner registration and applications continue. OCR is assistive only.

## Demo engine choice

Tesseract is **not** installed on the current Windows laptop, and this prototype does not require it.

| Source | Engine |
| --- | --- |
| PDF with a text layer (demo fixtures) | `pypdf` — no OCR binary |
| Scanned PDF | first page rendered with `pypdfium2`, then RapidOCR if installed |
| Photo (JPG/PNG/WEBP) | RapidOCR (`rapidocr-onnxruntime`) on CPU if installed |

RapidOCR is optional. The SIH demo PDF works without it.

Do not use cloud OCR or LLMs in this step.

## Setup

```powershell
cd C:\Dev\Projects\sih26036\services\intelligence
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python fixtures\build_fixtures.py
```

If `rapidocr-onnxruntime` fails to install, comment that line in `requirements.txt` and use the demo **PDF** files. Text extraction still works.

## Run

```powershell
cd C:\Dev\Projects\sih26036\services\intelligence
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Health: `http://127.0.0.1:8000/health` → `{ "status": "ok", "ocrEngine": "..." }`

OCR: `POST /ocr/extract` multipart field `file`.

Bind **127.0.0.1** only. Do not call this port from the browser; Fastify proxies `POST /api/intelligence/ocr`.

## Confidence heuristic

The OCR engine’s word scores are used when RapidOCR returns them (mean score, 0–1). Labelled regex matches start at **0.90**. Unlabelled `SIH-…` serial guesses are **0.55**. Embedded PDF text adds **+0.05**, capped at **0.97**. Missing fields are `{ "value": null, "status": "not_found", "confidence": 0 }`. Values are not invented.

## Fields

manufacturer, model, serialNumber, instrumentType, maxCapacity, minCapacity, certificateNumber, verificationDate, expiryDate, businessName.

Dates: ISO when unambiguous. `03/04/2026` stays original with a warning.

Units: `KG` / `Kgs` → `kg`.

## Tests

```powershell
.\.venv\Scripts\python -m pytest
```

## Demo documents

`fixtures/demo_clear.pdf` — Om Demo Traders / SIH-DEMO-001 / 30 kg  
`fixtures/demo_mismatch.pdf` — SIH-DEMO-007 / 500 kg  
`fixtures/demo_missing_serial.pdf`

Each file is marked **DEMO / SAMPLE / NOT A LEGAL CERTIFICATE**.
