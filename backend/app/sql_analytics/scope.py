"""Filter scope -> bound WHERE clause, plus query execution helper."""
from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import date, timedelta

from sqlalchemy import text
from sqlalchemy.orm import Session


@dataclass(frozen=True)
class Scope:
    is_demo: bool
    year: int | None = None
    month: int | None = None
    stations: tuple[int, ...] | None = None
    date_from: date | None = None
    date_to: date | None = None

    def where(self) -> tuple[str, dict]:
        parts = ["r.is_demo = :is_demo"]
        params: dict = {"is_demo": 1 if self.is_demo else 0}
        if self.year is not None:
            parts.append("r.year = :year")
            params["year"] = self.year
        if self.month is not None:
            parts.append("r.month = :month")
            params["month"] = self.month
        if self.stations:
            names = [f":st{i}" for i in range(len(self.stations))]
            parts.append(f"r.station_id IN ({', '.join(names)})")
            params.update({f"st{i}": int(s) for i, s in enumerate(self.stations)})
        if self.date_from is not None:
            parts.append("r.day >= :date_from")
            params["date_from"] = self.date_from.isoformat()
        if self.date_to is not None:
            parts.append("r.day <= :date_to")
            params["date_to"] = self.date_to.isoformat()
        return "WHERE " + " AND ".join(parts), params

    def previous(self) -> "Scope | None":
        """Comparable previous period, or None when the filters give no sensible comparison."""
        if self.year is not None:
            return replace(self, year=self.year - 1, date_from=None, date_to=None)
        if self.date_from and self.date_to and self.date_to >= self.date_from:
            span = (self.date_to - self.date_from).days + 1
            return replace(self, date_from=self.date_from - timedelta(days=span), date_to=self.date_from - timedelta(days=1))
        return None


def run(db: Session, sql: str, params: dict | None = None) -> list[dict]:
    return [dict(r) for r in db.execute(text(sql), params or {}).mappings()]
