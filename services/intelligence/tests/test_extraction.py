from fastapi.testclient import TestClient

from app.main import app
from app.services.extraction_service import extract_fields
from app.services.normalize import parse_date


CLEAR = """
DEMO / SAMPLE / NOT A LEGAL CERTIFICATE
Business: Om Demo Traders
Instrument type: Electronic weighing machine
Manufacturer: DemoTech Instruments
Model: LM-500
Serial No: SIH-DEMO-001
Max Capacity: 30 kg
Min Capacity: 0.1 kg
Certificate No: CERT-DEMO-0001
Verification date: 15 Mar 2026
Valid until: 14 Mar 2027
"""

MISSING_SERIAL = """
Manufacturer: DemoTech Instruments
Model: LM-500
Max Capacity: 30 Kgs
"""


def test_extracts_labelled_demo_fields():
    result = extract_fields(CLEAR, source="pdf_text")
    fields = result["fields"]
    assert fields["manufacturer"]["value"] == "DemoTech Instruments"
    assert fields["model"]["value"] == "LM-500"
    assert fields["serialNumber"]["value"] == "SIH-DEMO-001"
    assert fields["instrumentType"]["value"] == "Electronic weighing machine"
    assert fields["maxCapacity"]["value"] == 30
    assert fields["maxCapacity"]["unit"] == "kg"
    assert fields["minCapacity"]["value"] == 0.1
    assert fields["certificateNumber"]["value"] == "CERT-DEMO-0001"
    assert fields["verificationDate"]["value"] == "2026-03-15"
    assert fields["expiryDate"]["value"] == "2027-03-14"
    assert fields["businessName"]["value"] == "Om Demo Traders"
    assert fields["serialNumber"]["confidence"] >= 0.9


def test_missing_serial_is_not_found():
    result = extract_fields(MISSING_SERIAL, source="pdf_text")
    assert result["fields"]["serialNumber"]["status"] == "not_found"
    assert result["fields"]["serialNumber"]["value"] is None
    assert result["fields"]["maxCapacity"]["unit"] == "kg"


def test_ambiguous_date_keeps_original():
    iso, original, warning = parse_date("03/04/2026")
    assert iso is None
    assert original == "03/04/2026"
    assert warning and "Ambiguous" in warning


def test_unambiguous_numeric_date():
    iso, _, warning = parse_date("15/03/2026")
    assert iso == "2026-03-15"
    assert warning is None


def test_does_not_invent_manufacturer():
    result = extract_fields("This page is blank aside from a stamp.", source="pdf_text")
    assert result["fields"]["manufacturer"]["value"] is None
    assert any("No labelled" in item for item in result["warnings"])


def test_health():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
