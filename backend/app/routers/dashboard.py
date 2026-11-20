from fastapi import APIRouter, Depends

from .. import insights
from ..deps import Ctx, get_ctx
from ..sql_analytics import queries as Q
from ..sql_analytics.scope import run

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

PCOLS = list(Q.POLLUTANT_COLS)


def available_pollutants(k: dict) -> list[str]:
    return [p for p in PCOLS if (k.get(f"n_{p}") or 0) > 0]


def completeness(k: dict) -> float | None:
    """Share of non-null cells among the fields that exist at all in this dataset."""
    if not k or not k.get("records"):
        return None
    fields = (["aqi"] if k["aqi_n"] else []) + available_pollutants(k)
    if not fields:
        return 0.0
    present = (k["aqi_n"] if "aqi" in fields else 0) + sum(k[f"n_{p}"] for p in fields if p != "aqi")
    return round(100.0 * present / (k["records"] * len(fields)), 1)


def _pct(cur, prev):
    if cur is None or prev in (None, 0):
        return None
    return round((cur - prev) / prev * 100, 1)


@router.get("/overview")
def overview(ctx: Ctx = Depends(get_ctx)):
    where, params = ctx.scope.where()
    k = run(ctx.db, Q.kpis(where), params)[0]
    if not k["records"]:
        return {"meta": ctx.meta, "has_data": False, "kpis": None, "insights": [], "timeline": [], "categories": []}

    extremes = run(ctx.db, Q.extremes(where), params)
    cats = run(ctx.db, Q.category_distribution(where), params)
    timeline = run(ctx.db, Q.monthly_timeline(where), params)

    prev_scope = ctx.scope.previous()
    prev = None
    if prev_scope:
        pw, pp = prev_scope.where()
        cand = run(ctx.db, Q.kpis(pw), pp)[0]
        prev = cand if cand["records"] else None

    ex = {e["kind"]: e for e in extremes}
    comp, pcomp = completeness(k), (completeness(prev) if prev else None)

    def card(value, p, **extra):
        return {"value": value, "previous": p, "change_pct": _pct(value, p), **extra}

    kpis = {
        "avg_aqi": card(k["avg_aqi"], prev["avg_aqi"] if prev else None),
        "max_aqi": card(k["max_aqi"], prev["max_aqi"] if prev else None,
                        station=ex.get("highest", {}).get("station"), at=ex.get("highest", {}).get("ts")),
        "min_aqi": card(k["min_aqi"], prev["min_aqi"] if prev else None,
                        station=ex.get("lowest", {}).get("station"), at=ex.get("lowest", {}).get("ts")),
        "stations": card(k["stations"], prev["stations"] if prev else None),
        "records": card(k["records"], prev["records"] if prev else None),
        "completeness": card(comp, pcomp),
    }
    return {
        "meta": ctx.meta, "has_data": True, "kpis": kpis,
        "comparison": {"available": prev is not None,
                       "label": "vs previous year" if ctx.scope.year is not None else "vs previous period"},
        "available_pollutants": available_pollutants(k),
        "has_hourly": (k["n_hourly"] or 0) > 0,
        "coverage": {"first": k["first_ts"], "last": k["last_ts"]},
        "categories": cats, "timeline": timeline,
        "insights": insights.overview_insights(k, prev, extremes, cats),
    }
