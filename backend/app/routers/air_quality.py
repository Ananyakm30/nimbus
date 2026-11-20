from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from .. import insights
from ..deps import Ctx, get_ctx
from ..sql_analytics import queries as Q
from ..sql_analytics.scope import run
from .dashboard import available_pollutants

router = APIRouter(prefix="/api/air-quality", tags=["air-quality"])


@router.get("/stations")
def stations(ctx: Ctx = Depends(get_ctx)):
    rows = run(ctx.db, Q.station_list(), {"is_demo": 1 if ctx.scope.is_demo else 0})
    return {"meta": ctx.meta, "items": rows, "total": len(rows)}


@router.get("/rankings")
def rankings(
    ctx: Ctx = Depends(get_ctx),
    search: Annotated[str | None, Query(max_length=100)] = None,
    sort_by: Literal["pollution_rank", "station", "avg_aqi", "readings"] = "pollution_rank",
    order: Literal["asc", "desc"] = "asc",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=200)] = 25,
):
    where, params = ctx.scope.where()
    rows = run(ctx.db, Q.rankings(where), params)  # ranks are computed over ALL stations in SQL
    ins = insights.ranking_insights(rows)
    cats: dict[str, int] = {}
    for r in rows:
        cats[r["category"]] = cats.get(r["category"], 0) + 1
    view = [r for r in rows if not search or search.lower() in r["station"].lower()]
    view.sort(key=lambda r: (r[sort_by] is None, r[sort_by]), reverse=(order == "desc"))
    start = (page - 1) * page_size
    return {"meta": ctx.meta, "total": len(view), "page": page, "page_size": page_size,
            "items": view[start:start + page_size], "highest": rows[:3], "lowest": list(reversed(rows[-3:])),
            "city_avg": rows[0]["city_avg"] if rows else None, "category_counts": cats, "insights": ins}


@router.get("/trends/yearly")
def trends_yearly(ctx: Ctx = Depends(get_ctx)):
    where, params = ctx.scope.where()
    city = run(ctx.db, Q.yearly_city(where), params)
    st = run(ctx.db, Q.yearly_station(where), params)
    latest: dict[str, dict] = {}
    for r in st:
        latest[r["station"]] = r
    summary = {k: sum(1 for r in latest.values() if r["trend"] == k) for k in ("improving", "deteriorating", "stable", "baseline")}
    return {"meta": ctx.meta, "city": city, "stations": st, "trend_summary": summary,
            "insights": insights.yearly_insights(city, st)}


@router.get("/trends/monthly")
def trends_monthly(ctx: Ctx = Depends(get_ctx)):
    where, params = ctx.scope.where()
    moy = run(ctx.db, Q.month_of_year(where), params)
    seasons = run(ctx.db, Q.seasonal(where), params)
    days = run(ctx.db, Q.polluted_days(where), params)
    return {"meta": ctx.meta, "timeline": run(ctx.db, Q.monthly_timeline(where), params), "month_of_year": moy,
            "seasonal": seasons, "polluted_days": days, "polluted_months": run(ctx.db, Q.polluted_months(where), params),
            "insights": insights.monthly_insights(moy, seasons, days)}


@router.get("/trends/hourly")
def trends_hourly(ctx: Ctx = Depends(get_ctx)):
    where, params = ctx.scope.where()
    hours = run(ctx.db, Q.hourly(where), params)
    dow = run(ctx.db, Q.day_of_week(where), params)
    return {"meta": ctx.meta, "hourly_available": bool(hours), "hourly": hours, "day_of_week": dow,
            "heatmap": run(ctx.db, Q.hour_by_dow(where), params),
            "insights": insights.hourly_insights(hours, dow) if hours else (
                insights.hourly_insights([], dow) + ["This dataset has daily resolution (no time-of-day), "
                                                     "so hourly analysis is unavailable."])}


@router.get("/pollutants")
def pollutants(ctx: Ctx = Depends(get_ctx), pollutant: Literal["pm25", "pm10", "no2", "so2"] | None = None):
    where, params = ctx.scope.where()
    summ = run(ctx.db, Q.pollutant_summary(where), params)[0]
    if not summ["records"]:
        return {"meta": ctx.meta, "has_data": False, "available": [], "insights": []}
    k = {f"n_{p}": summ[f"n_{p}"] for p in Q.POLLUTANT_COLS}
    avail = available_pollutants(k)
    by_station = run(ctx.db, Q.pollutant_by_station(where), params)
    focus = pollutant if pollutant in avail else (avail[0] if avail else None)
    dist = run(ctx.db, Q.pollutant_distribution(where, focus), params) if focus else []
    return {
        "meta": ctx.meta, "has_data": True, "available": avail, "labels": Q.POLLUTANT_COLS, "focus": focus,
        "summary": summ, "by_station": by_station,
        "monthly": run(ctx.db, Q.pollutant_monthly(where), params),
        "seasonality": run(ctx.db, Q.pollutant_monthly_seasonality(where), params),
        "distribution": dist,
        "insights": insights.pollutant_insights(summ, by_station, avail),
    }


@router.get("/map")
def map_data(ctx: Ctx = Depends(get_ctx)):
    where, params = ctx.scope.where()
    rows = run(ctx.db, Q.map_stations(where), params)
    hist: dict[int, list] = {}
    for h in run(ctx.db, Q.map_history(where), params):
        hist.setdefault(h["station_id"], []).append({"ym": h["ym"], "avg_aqi": h["avg_aqi"]})
    for r in rows:
        r["history"] = hist.get(r["station_id"], [])
    mapped = [r for r in rows if r["latitude"] is not None and r["longitude"] is not None]
    return {
        "meta": ctx.meta, "stations": rows, "mapped": len(mapped), "unmapped": len(rows) - len(mapped),
        "coordinates_complete": bool(rows) and len(mapped) == len(rows),
        "note": None if rows and len(mapped) == len(rows) else
        "Geospatial data is incomplete: the dataset provides no coordinates for some or all stations, and none have been guessed.",
    }


@router.get("/readings")
def readings(
    ctx: Ctx = Depends(get_ctx),
    sort: Literal["ts", "aqi", "pm25", "pm10", "no2", "so2", "station"] = "ts",
    direction: Literal["asc", "desc"] = "desc",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=200)] = 25,
):
    """Row-level drill-down behind every chart."""
    if sort not in Q.SORTABLE:
        raise HTTPException(422, "invalid sort column")
    where, params = ctx.scope.where()
    total = run(ctx.db, Q.readings_count(where), params)[0]["n"]
    items = run(ctx.db, Q.readings_page(where, sort, direction.upper()),
                {**params, "limit": page_size, "offset": (page - 1) * page_size})
    return {"meta": ctx.meta, "total": total, "page": page, "page_size": page_size, "items": items}
