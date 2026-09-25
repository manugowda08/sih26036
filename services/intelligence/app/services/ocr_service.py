from __future__ import annotations

import io
from typing import Any

from PIL import Image, ImageOps
from pypdf import PdfReader

ALLOWED_MIME = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/tiff": ".tif",
}

ALLOWED_EXT = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff"}
MAX_BYTES = 5 * 1024 * 1024
MIN_PDF_TEXT = 40


class OcrError(ValueError):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def inspect_upload(filename: str, content_type: str | None, size: int) -> str:
    if size <= 0:
        raise OcrError("Empty file")
    if size > MAX_BYTES:
        raise OcrError("File must be 5 MB or smaller", 400)
    name = (filename or "upload").lower()
    ext = ""
    if "." in name:
        ext = "." + name.rsplit(".", 1)[-1]
    mime = (content_type or "").split(";")[0].strip().lower()
    if mime in ALLOWED_MIME:
        return ALLOWED_MIME[mime]
    if ext in ALLOWED_EXT:
        return ".jpg" if ext == ".jpeg" else ext
    raise OcrError("Upload a PDF, JPG, PNG, or WEBP document")


def read_document(data: bytes, filename: str, content_type: str | None) -> dict[str, Any]:
    ext = inspect_upload(filename, content_type, len(data))
    warnings: list[str] = []
    if ext == ".pdf":
        text, source = _read_pdf(data, warnings)
        return {"text": text, "source": source, "ocrMeanConfidence": None, "warnings": warnings, "engine": source}
    text, mean_conf, engine = _read_image(data, warnings)
    return {
        "text": text,
        "source": "image_ocr",
        "ocrMeanConfidence": mean_conf,
        "warnings": warnings,
        "engine": engine,
    }


def _read_pdf(data: bytes, warnings: list[str]) -> tuple[str, str]:
    try:
        reader = PdfReader(io.BytesIO(data))
    except Exception as exc:  # noqa: BLE001
        raise OcrError("Could not read PDF") from exc
    pages = []
    for page in reader.pages:
        pages.append(page.extract_text() or "")
    text = "\n".join(pages).strip()
    if len(text) >= MIN_PDF_TEXT:
        return text, "pdf_text"

    rendered = _render_pdf_first_page(data)
    if rendered is None:
        warnings.append("PDF had no extractable text layer and page rendering failed")
        return text, "pdf_text"
    ocr_text, _, engine = _ocr_pil(rendered, warnings)
    if ocr_text.strip():
        warnings.append("PDF had no text layer; OCR was used on a rendered page")
        return ocr_text, "pdf_ocr"
    warnings.append("PDF had no extractable text")
    return text, "pdf_text"


def _render_pdf_first_page(data: bytes):
    try:
        import pypdfium2 as pdfium
    except ImportError:
        return None
    try:
        doc = pdfium.PdfDocument(data)
        page = doc[0]
        bitmap = page.render(scale=2)
        return bitmap.to_pil()
    except Exception:  # noqa: BLE001
        return None


def _read_image(data: bytes, warnings: list[str]) -> tuple[str, float | None, str]:
    try:
        image = Image.open(io.BytesIO(data))
        image = ImageOps.exif_transpose(image)
    except Exception as exc:  # noqa: BLE001
        raise OcrError("Could not read image") from exc
    return _ocr_pil(image, warnings)


def _ocr_pil(image: Image.Image, warnings: list[str]) -> tuple[str, float | None, str]:
    rgb = image.convert("RGB")
    engine = _rapidocr()
    if engine is None:
        warnings.append(
            "Image OCR engine is not installed. Text-layer PDFs still work. "
            "Install RapidOCR from services/intelligence/requirements.txt for photos."
        )
        raise OcrError(
            "Image OCR is unavailable on this machine. Use a text PDF or install RapidOCR.",
            503,
        )

    candidates: list[tuple[str, float | None, int]] = []
    for angle in (0, 90, 180, 270):
        frame = rgb.rotate(angle, expand=True) if angle else rgb
        text, mean_conf = _rapidocr_text(engine, frame)
        candidates.append((text, mean_conf, len(text.strip())))
        if angle == 0 and len(text.strip()) >= 80:
            break
    text, mean_conf, _ = max(candidates, key=lambda item: item[2])
    if not text.strip():
        warnings.append("OCR returned no readable text")
    return text, mean_conf, "rapidocr"


_RAPIDOCR = None
_RAPIDOCR_FAILED = False


def _rapidocr():
    global _RAPIDOCR, _RAPIDOCR_FAILED
    if _RAPIDOCR_FAILED:
        return None
    if _RAPIDOCR is not None:
        return _RAPIDOCR
    try:
        from rapidocr_onnxruntime import RapidOCR

        _RAPIDOCR = RapidOCR()
        return _RAPIDOCR
    except Exception:  # noqa: BLE001
        _RAPIDOCR_FAILED = True
        return None


def _rapidocr_text(engine, image: Image.Image) -> tuple[str, float | None]:
    import numpy as np

    result, _ = engine(np.array(image))
    if not result:
        return "", None
    lines = []
    scores = []
    for row in result:
        # [box, text, score]
        if len(row) >= 3:
            lines.append(str(row[1]))
            try:
                scores.append(float(row[2]))
            except (TypeError, ValueError):
                pass
        elif len(row) >= 2:
            lines.append(str(row[1]))
    mean = sum(scores) / len(scores) if scores else None
    return "\n".join(lines), mean
