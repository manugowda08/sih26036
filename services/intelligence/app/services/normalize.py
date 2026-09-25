from __future__ import annotations

import re
from datetime import datetime

UNIT_ALIASES = {
    "kgs": "kg",
    "kg": "kg",
    "kilogram": "kg",
    "kilograms": "kg",
    "g": "g",
    "gm": "g",
    "gms": "g",
    "gram": "g",
    "grams": "g",
    "mg": "mg",
    "t": "t",
    "ton": "t",
    "tonne": "t",
    "l": "l",
    "lt": "l",
    "ltr": "l",
    "litre": "l",
    "liter": "l",
    "ml": "ml",
    "m": "m",
}


def collapse_ws(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def normalize_unit(unit: str | None) -> str | None:
    if not unit:
        return None
    key = collapse_ws(unit).lower().rstrip(".")
    return UNIT_ALIASES.get(key, key)


def parse_capacity(raw: str) -> tuple[float | None, str | None, str]:
    text = collapse_ws(raw)
    match = re.search(
        r"([0-9]+(?:[.,][0-9]+)?)\s*(kgs?|kilograms?|grams?|gms?|g|mg|tonnes?|tons?|t|litres?|liters?|ltrs?|lt|l|ml|m)\b",
        text,
        re.IGNORECASE,
    )
    if not match:
        return None, None, text
    number = float(match.group(1).replace(",", "."))
    unit = normalize_unit(match.group(2))
    return number, unit, f"{_format_number(number)} {unit}"


def capacity_to_base(value: float, unit: str | None) -> float | None:
    if unit is None:
        return None
    if unit == "kg":
        return value * 1000
    if unit == "g":
        return value
    if unit == "mg":
        return value / 1000
    if unit == "t":
        return value * 1_000_000
    if unit == "l":
        return value * 1000
    if unit == "ml":
        return value
    if unit == "m":
        return value
    return None


def _format_number(value: float) -> str:
    if value == int(value):
        return str(int(value))
    return str(value)


MONTHS = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}


def parse_date(raw: str) -> tuple[str | None, str, str | None]:
    """Return (iso_date | None, original, warning | None). Prefer unambiguous dates."""
    original = collapse_ws(raw)
    iso = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", original)
    if iso:
        return _valid_iso(int(iso.group(1)), int(iso.group(2)), int(iso.group(3)), original)

    named = re.search(
        r"\b(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b",
        original,
    )
    if named:
        month = MONTHS.get(named.group(2).lower())
        if month:
            return _valid_iso(int(named.group(3)), month, int(named.group(1)), original)

    named2 = re.search(
        r"\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b",
        original,
    )
    if named2:
        month = MONTHS.get(named2.group(1).lower())
        if month:
            return _valid_iso(int(named2.group(3)), month, int(named2.group(2)), original)

    numeric = re.search(r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b", original)
    if numeric:
        a, b, year = int(numeric.group(1)), int(numeric.group(2)), int(numeric.group(3))
        if a > 12 and b <= 12:
            return _valid_iso(year, b, a, original)
        if b > 12 and a <= 12:
            return _valid_iso(year, a, b, original)
        if a <= 12 and b <= 12:
            return None, original, f"Ambiguous date '{original}' (could be D/M or M/D)"
        return None, original, f"Could not parse date '{original}'"

    return None, original, f"Could not parse date '{original}'"


def _valid_iso(year: int, month: int, day: int, original: str) -> tuple[str | None, str, str | None]:
    try:
        value = datetime(year, month, day).date().isoformat()
        return value, original, None
    except ValueError:
        return None, original, f"Invalid calendar date '{original}'"
