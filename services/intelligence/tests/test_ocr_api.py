from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from fixtures.build_fixtures import main as build_fixtures

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"
client = TestClient(app)


def setup_module():
    build_fixtures()


def test_clear_pdf_extract():
    path = FIXTURES / "demo_clear.pdf"
    with path.open("rb") as handle:
        response = client.post("/ocr/extract", files={"file": ("demo_clear.pdf", handle, "application/pdf")})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["fields"]["serialNumber"]["value"] == "SIH-DEMO-001"
    assert body["fields"]["maxCapacity"]["value"] == 30


def test_mismatch_fixture_has_different_serial():
    path = FIXTURES / "demo_mismatch.pdf"
    with path.open("rb") as handle:
        response = client.post("/ocr/extract", files={"file": ("demo_mismatch.pdf", handle, "application/pdf")})
    assert response.status_code == 200
    assert response.json()["fields"]["serialNumber"]["value"] == "SIH-DEMO-007"


def test_missing_serial_pdf():
    path = FIXTURES / "demo_missing_serial.pdf"
    with path.open("rb") as handle:
        response = client.post("/ocr/extract", files={"file": ("demo_missing_serial.pdf", handle, "application/pdf")})
    assert response.status_code == 200
    assert response.json()["fields"]["serialNumber"]["status"] == "not_found"


def test_unsupported_file():
    response = client.post(
        "/ocr/extract",
        files={"file": ("payload.exe", b"MZ\x00\x00not-an-image", "application/octet-stream")},
    )
    assert response.status_code == 400


def test_oversized_file():
    payload = b"%PDF-1.4\n" + (b"0" * (5 * 1024 * 1024 + 10))
    response = client.post("/ocr/extract", files={"file": ("huge.pdf", payload, "application/pdf")})
    assert response.status_code == 400
