import logging
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import DataImport
from ..pipeline.cleaning import PipelineError
from ..pipeline.demo_data import generate
from ..pipeline.ingest import clear_dataset, import_file

router = APIRouter(prefix="/api/data", tags=["data"])
log = logging.getLogger("aqi.data")


def _imp(i: DataImport) -> dict:
    return {"import_id": i.import_id, "filename": i.filename, "is_demo": i.is_demo, "status": i.status,
            "original_records": i.original_records, "final_records": i.final_records,
            "inserted_records": i.inserted_records, "skipped_existing": i.skipped_existing, "error": i.error,
            "uploaded_at": i.uploaded_at, "finished_at": i.finished_at}


@router.post("/upload", status_code=201)
def upload(file: UploadFile = File(...), station_name: Annotated[str | None, Form(max_length=150)] = None,
           db: Session = Depends(get_db)):
    """Validate, clean and store a CSV/Excel file, returning the processing report."""
    content = file.file.read(settings.max_upload_mb * 1024 * 1024 + 1)
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"File exceeds the {settings.max_upload_mb} MB limit.")
    if not content:
        raise HTTPException(422, "The uploaded file is empty.")
    try:
        result = import_file(db, content, file.filename or "upload.csv", is_demo=False, station_name=station_name)
    except PipelineError as exc:
        raise HTTPException(422, str(exc)) from exc
    return result


@router.get("/imports")
def imports(db: Session = Depends(get_db), page: Annotated[int, Query(ge=1)] = 1,
            page_size: Annotated[int, Query(ge=1, le=100)] = 20):
    total = db.scalar(select(func.count()).select_from(DataImport))
    rows = db.scalars(select(DataImport).order_by(DataImport.import_id.desc()).offset((page - 1) * page_size).limit(page_size))
    return {"total": total, "page": page, "page_size": page_size, "items": [_imp(i) for i in rows]}


@router.get("/imports/{import_id}/report")
def import_report(import_id: int, db: Session = Depends(get_db)):
    imp = db.get(DataImport, import_id)
    if imp is None:
        raise HTTPException(404, "Import not found")
    return {**_imp(imp), "report": imp.report.report if imp.report else None}


@router.post("/demo", status_code=201)
def load_demo(db: Session = Depends(get_db)):
    """Load the synthetic DEMO sample through the same pipeline. Stored separately from real data."""
    if not settings.demo_csv.exists():
        generate(settings.demo_csv)
    return import_file(db, settings.demo_csv.read_bytes(), settings.demo_csv.name, is_demo=True)


@router.delete("/demo")
def reset_demo(db: Session = Depends(get_db)):
    return {"removed_imports": clear_dataset(db, is_demo=True)}
