from fastapi import APIRouter, File, HTTPException, UploadFile

from app.services.extraction_service import extract_fields
from app.services.ocr_service import OcrError, inspect_upload, read_document

router = APIRouter()


@router.post("/ocr/extract")
async def ocr_extract(file: UploadFile = File(...)):
    data = await file.read()
    try:
        inspect_upload(file.filename or "upload", file.content_type, len(data))
        document = read_document(data, file.filename or "upload", file.content_type)
    except OcrError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    extracted = extract_fields(
        document["text"],
        source=document["source"],
        ocr_mean_confidence=document.get("ocrMeanConfidence"),
    )
    extracted["warnings"] = [*document.get("warnings", []), *extracted.get("warnings", [])]
    extracted["engine"] = document.get("engine")
    extracted["filename"] = file.filename
    return extracted
