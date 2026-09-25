from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.ocr import router as ocr_router

app = FastAPI(title="LM Smart Intelligence", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
app.include_router(ocr_router)


@app.get("/health")
def health():
    engine = "pdf_text_only"
    try:
        import rapidocr_onnxruntime  # noqa: F401

        engine = "rapidocr"
    except ImportError:
        pass
    return {"status": "ok", "ocrEngine": engine}
