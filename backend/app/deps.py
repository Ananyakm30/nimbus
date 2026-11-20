"""Shared request dependencies: dataset selection (demo vs real) and the filter scope."""
from dataclasses import dataclass
from datetime import date
from typing import Annotated, Literal

from fastapi import Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .database import get_db
from .models import DataImport
from .sql_analytics.scope import Scope


@dataclass
class Ctx:
    db: Session
    scope: Scope
    meta: dict


def _has(db: Session, is_demo: bool) -> bool:
    return bool(db.scalar(select(func.count()).select_from(DataImport).where(
        DataImport.is_demo == is_demo, DataImport.status == "completed")))


def get_ctx(
    db: Session = Depends(get_db),
    dataset: Annotated[Literal["auto", "real", "demo"], Query(description="Which dataset to analyse")] = "auto",
    year: Annotated[int | None, Query(ge=2000, le=2100)] = None,
    month: Annotated[int | None, Query(ge=1, le=12)] = None,
    station_id: Annotated[list[int] | None, Query()] = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> Ctx:
    if date_from and date_to and date_from > date_to:
        raise HTTPException(422, "date_from must be on or before date_to")
    has_real, has_demo = _has(db, False), _has(db, True)
    is_demo = dataset == "demo" or (dataset == "auto" and not has_real)
    mode = "demo" if is_demo else "real"
    scope = Scope(is_demo=is_demo, year=year, month=month, stations=tuple(station_id) if station_id else None,
                  date_from=date_from, date_to=date_to)
    meta = {"dataset": mode, "is_demo": is_demo, "has_real": has_real, "has_demo": has_demo,
            "demo_notice": "DEMO DATA - synthetic sample for UI testing, not real measurements." if is_demo else None,
            "has_data": has_demo if is_demo else has_real}
    return Ctx(db=db, scope=scope, meta=meta)
