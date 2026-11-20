from fastapi import APIRouter, Depends
from sqlalchemy import select

from ..deps import Ctx, get_ctx
from ..models import DataImport
from ..sql_analytics import queries as Q
from ..sql_analytics.scope import run

router = APIRouter(prefix="/api/data-quality", tags=["data-quality"])
FIELDS = ["aqi", "pm25", "pm10", "no2", "so2"]


@router.get("/summary")
def summary(ctx: Ctx = Depends(get_ctx)):
    db, is_demo = ctx.db, ctx.scope.is_demo
    flag = {"is_demo": 1 if is_demo else 0}
    imports = list(db.scalars(select(DataImport).where(DataImport.is_demo == is_demo, DataImport.status == "completed")
                              .order_by(DataImport.import_id)))
    reports = [i.report.report for i in imports if i.report]
    if not reports:
        return {"meta": ctx.meta, "has_data": False}

    def tot(key):
        return sum(r.get(key, 0) for r in reports)

    orig = tot("original_records")
    final = tot("final_cleaned_records")
    invalid_by = {f: sum(sum(r["invalid_values"].get(f, {}).values()) for r in reports) for f in FIELDS}
    before_pct, after_pct = {}, {}
    for f in FIELDS:
        mb = sum(r["missing_before"].get(f, 0) + sum(r["invalid_values"].get(f, {}).values()) for r in reports
                 if f in r["missing_before"])
        ma = sum(r["missing_after"].get(f, 0) for r in reports if f in r["missing_after"])
        n_o = sum(r["original_records"] for r in reports if f in r["missing_before"])
        n_f = sum(r["final_cleaned_records"] for r in reports if f in r["missing_after"])
        if n_o:
            before_pct[f] = round(100 * mb / n_o, 2)
            after_pct[f] = round(100 * ma / n_f, 2) if n_f else None

    where, params = ctx.scope.where()
    by_station = run(db, Q.missing_by_station(where), params)
    present = {f: sum(s[f"present_{f}"] for s in by_station) for f in FIELDS}
    avail = [f for f in FIELDS if present[f] > 0]
    for s in by_station:
        cells = s["records"] * len(avail)
        got = sum(s[f"present_{f}"] for f in avail)
        s["completeness_pct"] = round(100.0 * got / cells, 1) if cells else None
        s["missing_pct"] = {f: round(100.0 * s[f"missing_{f}"] / s["records"], 1) for f in avail}
    total_records = sum(s["records"] for s in by_station)
    total_cells = total_records * len(avail)
    completeness = round(100.0 * sum(present[f] for f in avail) / total_cells, 1) if total_cells else None

    dup_rows = run(db, Q.duplicates(), flag)
    status = run(db, Q.raw_status(), flag)
    latest = reports[-1]
    return {
        "meta": ctx.meta, "has_data": True,
        "totals": {
            "records_processed": orig, "records_retained": final,
            "duplicates_removed": tot("duplicates_removed"), "conflicting_duplicates": tot("conflicting_duplicates"),
            "aggregated_subhourly": tot("aggregated_subhourly"), "invalid_timestamps": tot("invalid_timestamps"),
            "no_measurement_rows": tot("no_measurement_rows"),
            "missing_values": tot("missing_cells_detected"), "invalid_cells": tot("invalid_cells_total"),
            "invalid_aqi": invalid_by["aqi"], "invalid_by_field": invalid_by,
            "completeness_pct": completeness, "imports": len(imports),
            "all_reconciled": all(r.get("reconciled") for r in reports),
        },
        "before_after": {
            "records": [{"stage": "Raw upload", "records": orig}, {"stage": "After cleaning", "records": final}],
            "problem_rate_pct": [{"field": f, "before": before_pct[f], "after": after_pct[f]} for f in before_pct],
        },
        "available_fields": avail,
        "station_missing": by_station,
        "duplicates": {"keys": dup_rows[0]["duplicate_keys"] if dup_rows else 0,
                       "extra_rows": dup_rows[0]["total_extra_rows"] if dup_rows else 0, "examples": dup_rows},
        "record_outcomes": status,
        "latest_report": {"filename": imports[-1].filename, "import_id": imports[-1].import_id, **latest},
    }
