from __future__ import annotations

import re
from typing import Any

from app.services.normalize import collapse_ws, parse_capacity, parse_date

FIELD_KEYS = (
    "manufacturer",
    "model",
    "serialNumber",
    "instrumentType",
    "maxCapacity",
    "minCapacity",
    "certificateNumber",
    "verificationDate",
    "expiryDate",
    "businessName",
)

LABEL_CONFIDENCE = 0.90
UNLABELED_CONFIDENCE = 0.55
PDF_TEXT_BONUS = 0.05
MAX_CONFIDENCE = 0.97

_LABEL = r"(?:[:\-–]|is|=)\s*"


def empty_field() -> dict[str, Any]:
    return {"value": None, "confidence": 0.0, "status": "not_found"}


def extract_fields(raw_text: str, *, source: str = "unknown", ocr_mean_confidence: float | None = None) -> dict[str, Any]:
    text = raw_text.replace("\x00", " ")
    lines = [collapse_ws(line) for line in text.splitlines() if collapse_ws(line)]
    joined = "\n".join(lines)
    warnings: list[str] = []
    fields: dict[str, Any] = {key: empty_field() for key in FIELD_KEYS}

    def apply_bonus(base: float) -> float:
        value = base
        if source == "pdf_text":
            value += PDF_TEXT_BONUS
        if ocr_mean_confidence is not None:
            value = min(value, max(0.15, ocr_mean_confidence))
        return round(min(MAX_CONFIDENCE, value), 2)

    def set_text(key: str, value: str | None, confidence: float, extra: dict[str, Any] | None = None) -> None:
        if not value:
            return
        current = fields[key]
        if current["status"] == "found" and current["confidence"] >= confidence:
            return
        payload = {"value": value, "confidence": apply_bonus(confidence), "status": "found"}
        if extra:
            payload.update(extra)
        fields[key] = payload

    manufacturer = _first(
        joined,
        [
            rf"manufacturer{_LABEL}([^\n]+)",
            rf"\bmake{_LABEL}([^\n]+)",
            rf"\bmfr\.?{_LABEL}([^\n]+)",
        ],
    )
    set_text("manufacturer", _clean_name(manufacturer), LABEL_CONFIDENCE)

    model = _first(
        joined,
        [
            rf"\bmodel(?:\s*(?:no|number|#))?{_LABEL}([^\n]+)",
            rf"\btype\s*/\s*model{_LABEL}([^\n]+)",
        ],
    )
    set_text("model", _clean_token(model), LABEL_CONFIDENCE)

    serial = _first(
        joined,
        [
            rf"serial(?:\s*(?:no|number|#))?{_LABEL}([^\n]+)",
            rf"\bs/?n{_LABEL}([^\n]+)",
            rf"\bsr\.?\s*no\.?{_LABEL}([^\n]+)",
        ],
    )
    serial_value = _clean_serial(serial)
    if serial_value:
        set_text("serialNumber", serial_value, LABEL_CONFIDENCE)
    else:
        unlabeled = re.search(r"\b(SIH-[A-Z0-9][A-Z0-9\-]+)\b", joined, re.IGNORECASE)
        if unlabeled:
            set_text("serialNumber", unlabeled.group(1).upper(), UNLABELED_CONFIDENCE)
            warnings.append("Serial number inferred from SIH- pattern without a nearby label")

    instrument_type = _first(
        joined,
        [
            rf"instrument\s*type{_LABEL}([^\n]+)",
            rf"type\s*of\s*instrument{_LABEL}([^\n]+)",
        ],
    )
    if not instrument_type and re.search(r"electronic\s+weighing\s+machine|\bEWM\b", joined, re.IGNORECASE):
        instrument_type = "Electronic weighing machine"
        set_text("instrumentType", instrument_type, 0.8)
    else:
        set_text("instrumentType", _clean_name(instrument_type), LABEL_CONFIDENCE)

    max_raw = _first(
        joined,
        [
            rf"(?:max(?:imum)?(?:\s*capacity)?|capacity(?:\s*/\s*range)?){_LABEL}([^\n]+)",
        ],
    )
    _set_capacity(fields, "maxCapacity", max_raw, apply_bonus, LABEL_CONFIDENCE)

    min_raw = _first(joined, [rf"min(?:imum)?(?:\s*capacity)?{_LABEL}([^\n]+)"])
    _set_capacity(fields, "minCapacity", min_raw, apply_bonus, LABEL_CONFIDENCE)

    cert = _first(
        joined,
        [
            rf"certificate(?:\s*(?:no|number|#))?{_LABEL}([^\n]+)",
            rf"verification(?:\s*(?:certificate))?(?:\s*(?:no|number|#))?{_LABEL}([^\n]+)",
        ],
    )
    set_text("certificateNumber", _clean_token(cert), LABEL_CONFIDENCE)

    vdate = _first(
        joined,
        [
            rf"(?:date\s+of\s+)?verification\s*date{_LABEL}([^\n]+)",
            rf"verified\s*on{_LABEL}([^\n]+)",
            rf"date\s+of\s+verification{_LABEL}([^\n]+)",
        ],
    )
    _set_date(fields, warnings, "verificationDate", vdate, apply_bonus)

    edate = _first(
        joined,
        [
            rf"(?:valid\s*(?:until|upto|up\s*to|to)|expiry(?:\s*date)?|next\s*due(?:\s*date)?){_LABEL}([^\n]+)",
        ],
    )
    _set_date(fields, warnings, "expiryDate", edate, apply_bonus)

    business = _first(
        joined,
        [
            rf"(?:business|establishment|firm|trader){_LABEL}([^\n]+)",
        ],
    )
    set_text("businessName", _clean_name(business), LABEL_CONFIDENCE)

    if not any(item["status"] == "found" for item in fields.values()):
        warnings.append("No labelled instrument fields were found")

    found = sum(1 for item in fields.values() if item["status"] == "found")
    return {
        "rawText": raw_text,
        "fields": fields,
        "warnings": warnings,
        "source": source,
        "fieldCount": found,
    }


def _set_capacity(fields: dict[str, Any], key: str, raw: str | None, apply_bonus, base: float) -> None:
    if not raw:
        return
    value, unit, display = parse_capacity(raw)
    if value is None:
        fields[key] = {
            "value": None,
            "unit": None,
            "raw": collapse_ws(raw),
            "confidence": 0.0,
            "status": "not_found",
        }
        return
    fields[key] = {
        "value": value,
        "unit": unit,
        "raw": display,
        "confidence": apply_bonus(base),
        "status": "found",
    }


def _set_date(fields: dict[str, Any], warnings: list[str], key: str, raw: str | None, apply_bonus) -> None:
    if not raw:
        return
    iso, original, warning = parse_date(raw)
    if warning:
        warnings.append(warning)
    if iso:
        fields[key] = {
            "value": iso,
            "original": original,
            "confidence": apply_bonus(LABEL_CONFIDENCE),
            "status": "found",
        }
    else:
        fields[key] = {
            "value": None,
            "original": original,
            "confidence": 0.0,
            "status": "not_found",
        }


def _first(text: str, patterns: list[str]) -> str | None:
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return collapse_ws(match.group(1))
    return None


def _clean_name(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = re.split(r"\s{2,}|\s+\||\s+Model\b|\s+Serial\b", value, maxsplit=1)[0]
    cleaned = collapse_ws(cleaned.strip(" .;,"))
    if not cleaned or _is_boilerplate(cleaned):
        return None
    return cleaned


def _clean_token(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = collapse_ws(value.split()[0] if " " in collapse_ws(value) and len(value) < 8 else value)
    cleaned = re.split(r"\s{2,}", collapse_ws(value))[0]
    cleaned = cleaned.strip(" .;,")
    if not cleaned or _is_boilerplate(cleaned):
        return None
    return cleaned


def _clean_serial(value: str | None) -> str | None:
    if not value:
        return None
    token = collapse_ws(value).split()[0].strip(" .;,#")
    if _is_boilerplate(token):
        return None
    return token.upper() if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._\-]{2,}", token) else token


def _is_boilerplate(value: str) -> bool:
    lowered = value.lower()
    return any(
        marker in lowered
        for marker in (
            "not a legal",
            "sample only",
            "demo / sample",
            "lm smart demo",
        )
    )
