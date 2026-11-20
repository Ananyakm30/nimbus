"""File loading + persistence: raw rows preserved, cleaned rows stored, re-imports are idempotent."""
from __future__ import annotations

import hashlib
import io
import json
import logging
from datetime import datetime
from pathlib import Path

import pandas as pd
from sqlalchemy import delete, insert, select
from sqlalchemy.orm import Session

from ..models import (AirQualityReading, DataImport, DataQualityReport, MonitoringStation, RawRecord)
from .cleaning import CleanResult, PipelineError, clean_dataframe

log = logging.getLogger("aqi.ingest")
ALLOWED = {".csv", ".xlsx", ".xls"}
CHUNK = 5000


def read_table(content: bytes, filename: str) -> pd.DataFrame:
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED:
        raise PipelineError(f"Unsupported file type '{ext}'. Upload a .csv or .xlsx file.")
    try:
        if ext == ".csv":
            for enc in ("utf-8-sig", "latin-1"):
                try:
                    return pd.read_csv(io.BytesIO(content), dtype=str, keep_default_na=False, encoding=enc,
                                       sep=None, engine="python")
                except UnicodeDecodeError:
                    continue
            raise PipelineError("Could not decode the CSV file.")
        return pd.read_excel(io.BytesIO(content), dtype=str, keep_default_na=False)
    except PipelineError:
        raise
    except Exception as exc:  # pandas/openpyxl raise many types
        raise PipelineError(f"Could not read '{filename}': {exc}") from exc


def _bulk(db: Session, model, rows: list[dict]) -> None:
    for i in range(0, len(rows), CHUNK):
        db.execute(insert(model), rows[i:i + CHUNK])


def import_file(db: Session, content: bytes, filename: str, *, is_demo: bool = False,
                station_name: str | None = None) -> dict:
    """Run the full pipeline. Returns {'status', 'import_id', 'report', ...}."""
    file_hash = hashlib.sha256(content).hexdigest()
    prior = db.scalar(select(DataImport).where(DataImport.file_hash == file_hash, DataImport.status == "completed",
                                               DataImport.is_demo == is_demo))
    if prior is not None:
        log.info("Identical file already imported (import %s)", prior.import_id)
        return {"status": "already_imported", "import_id": prior.import_id,
                "report": prior.report.report if prior.report else None,
                "message": "This exact file was already imported; nothing was added."}

    imp = DataImport(filename=filename, file_hash=file_hash, is_demo=is_demo, status="processing")
    db.add(imp)
    db.flush()
    try:
        raw = read_table(content, filename)
        res: CleanResult = clean_dataframe(raw, filename, station_name)
        _persist(db, imp, raw, res, filename, is_demo)
        imp.status = "completed"
        imp.finished_at = datetime.now()
        db.commit()
    except PipelineError as exc:
        db.rollback()
        _record_failure(db, content, filename, file_hash, is_demo, str(exc))
        raise
    except Exception:
        db.rollback()
        log.exception("Import failed")
        _record_failure(db, content, filename, file_hash, is_demo, "Unexpected error while importing")
        raise
    return {"status": "completed", "import_id": imp.import_id, "report": res.report,
            "message": f"Imported {imp.inserted_records} new readings."}


def _record_failure(db: Session, content: bytes, filename: str, file_hash: str, is_demo: bool, msg: str) -> None:
    db.add(DataImport(filename=filename, file_hash=file_hash, is_demo=is_demo, status="failed", error=msg[:500],
                      finished_at=datetime.now()))
    db.commit()


def _persist(db: Session, imp: DataImport, raw: pd.DataFrame, res: CleanResult, filename: str, is_demo: bool) -> None:
    clean, rep = res.clean, res.report

    # 1. raw rows, untouched, with the decision taken for each
    raw_json = raw.astype(str).to_dict(orient="records")
    rs = res.row_status
    def _s(v, n):
        return None if v is None or v is pd.NA or (isinstance(v, float) and v != v) else str(v)[:n]

    rows = [{
        "import_id": imp.import_id, "row_number": int(rn), "station_raw": _s(st, 200), "ts_raw": _s(tr, 64),
        "raw_json": json.dumps(rj, ensure_ascii=False), "status": s, "reason": r or None,
    } for rn, st, tr, s, r, rj in zip(rs["row_number"].tolist(), rs["station_raw"].tolist(), rs["ts_raw"].tolist(),
                                      rs["status"].tolist(), rs["reason"].tolist(), raw_json)]
    _bulk(db, RawRecord, rows)

    # 2. stations (separate namespaces for demo / real so the two never mix)
    existing = {s.name.lower(): s for s in db.scalars(select(MonitoringStation).where(MonitoringStation.is_demo == is_demo))}
    ids: dict[str, int] = {}
    for name in clean["station"].unique():
        st = existing.get(str(name).lower())
        if st is None:
            st = MonitoringStation(name=str(name), is_demo=is_demo)
            db.add(st)
            db.flush()
        if str(name) in res.coords:
            st.latitude, st.longitude = res.coords[str(name)]
            st.coordinate_source = "dataset" + (" (demo, approximate)" if is_demo else "")
        ids[str(name)] = st.station_id

    # 3. skip readings that already exist (repeat / overlapping imports)
    clean = clean.assign(station_id=clean["station"].map(ids))
    have: set[tuple[int, datetime]] = set()
    lo, hi = clean["ts"].min().to_pydatetime(), clean["ts"].max().to_pydatetime()
    q = select(AirQualityReading.station_id, AirQualityReading.ts).where(
        AirQualityReading.station_id.in_(list(ids.values())), AirQualityReading.ts.between(lo, hi))
    for sid, ts in db.execute(q):
        have.add((sid, ts))
    keys = list(zip(clean["station_id"], clean["ts"].dt.to_pydatetime()))
    fresh = [k not in have for k in keys]
    new = clean[fresh]
    skipped = len(clean) - len(new)

    def col(name):  # NaN -> None
        return [None if v != v else float(v) for v in new[name].astype(float).tolist()]

    tss = new["ts"].dt.to_pydatetime().tolist() if len(new) else []
    hours = [None if pd.isna(h) else int(h) for h in new["hour"].tolist()]
    aq, p25, p10, n2, s2 = (col(c) for c in ("aqi", "pm25", "pm10", "no2", "so2"))
    out = [{
        "station_id": int(sid), "import_id": imp.import_id, "ts": t, "day": t.date(), "year": t.year, "month": t.month,
        "day_of_week": t.weekday(), "hour": h, "aqi": a, "pm25": b, "pm10": c, "no2": d, "so2": e,
        "aqi_derived": bool(der), "is_demo": is_demo, "source_dataset": filename[:255],
    } for sid, t, h, a, b, c, d, e, der in zip(new["station_id"].tolist(), tss, hours, aq, p25, p10, n2, s2,
                                              new["aqi_derived"].tolist())]
    _bulk(db, AirQualityReading, out)

    rep["inserted_records"] = len(out)
    rep["skipped_existing"] = skipped
    imp.original_records = rep["original_records"]
    imp.final_records = rep["final_cleaned_records"]
    imp.inserted_records = len(out)
    imp.skipped_existing = skipped
    db.add(DataQualityReport(import_id=imp.import_id, report=rep))


def clear_dataset(db: Session, is_demo: bool) -> int:
    """Remove everything belonging to the demo (or real) dataset. Used by 'reset demo data'."""
    imp_ids = list(db.scalars(select(DataImport.import_id).where(DataImport.is_demo == is_demo)))
    if not imp_ids:
        return 0
    db.execute(delete(AirQualityReading).where(AirQualityReading.is_demo == is_demo))
    db.execute(delete(RawRecord).where(RawRecord.import_id.in_(imp_ids)))
    db.execute(delete(DataQualityReport).where(DataQualityReport.import_id.in_(imp_ids)))
    db.execute(delete(DataImport).where(DataImport.import_id.in_(imp_ids)))
    db.execute(delete(MonitoringStation).where(MonitoringStation.is_demo == is_demo))
    db.commit()
    return len(imp_ids)
