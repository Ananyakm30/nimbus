"""Plain-language insights generated from query results (nothing hard-coded)."""
from __future__ import annotations

MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
          "November", "December"]
DOW = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
PNAMES = {"pm25": "PM2.5", "pm10": "PM10", "no2": "NO2", "so2": "SO2"}


def _hr(h: int) -> str:
    return f"{h:02d}:00"


def ranking_insights(rows: list[dict]) -> list[str]:
    if len(rows) < 2:
        return ["Only one station is available, so no comparison can be made."] if rows else []
    hi, lo = rows[0], rows[-1]
    out = [f"{hi['station']} recorded the highest average AQI ({hi['avg_aqi']}), "
           f"{round(hi['avg_aqi'] / lo['avg_aqi'] * 100 - 100)}% higher than {lo['station']} ({lo['avg_aqi']}) "
           "during the selected period."]
    above = [r for r in rows if (r["pct_vs_city"] or 0) > 0]
    out.append(f"{len(above)} of {len(rows)} stations are above the city-wide average of {rows[0]['city_avg']}.")
    bad = [r for r in rows if r["category"] in ("Poor", "Very Poor", "Severe")]
    if bad:
        out.append(f"{len(bad)} station(s) average in the Poor-or-worse range: {', '.join(r['station'] for r in bad[:4])}.")
    return out


def overview_insights(k: dict, prev: dict | None, extremes: list[dict], cats: list[dict]) -> list[str]:
    out = []
    if k.get("avg_aqi") is not None and prev and prev.get("avg_aqi"):
        d = (k["avg_aqi"] - prev["avg_aqi"]) / prev["avg_aqi"] * 100
        out.append(f"Average AQI is {abs(d):.1f}% {'higher' if d > 0 else 'lower'} than the previous comparable period "
                   f"({prev['avg_aqi']} -> {k['avg_aqi']}).")
    hi = next((e for e in extremes if e["kind"] == "highest"), None)
    if hi:
        out.append(f"The peak reading of {hi['aqi']:.0f} AQI was recorded at {hi['station']} on {str(hi['ts'])[:10]}.")
    if cats:
        top = max(cats, key=lambda c: c["readings"])
        out.append(f"{top['share_pct']}% of readings fall in the '{top['category']}' category.")
        worse = sum(c["share_pct"] for c in cats if c["category"] in ("Poor", "Very Poor", "Severe"))
        if worse:
            out.append(f"{worse:.1f}% of readings were Poor or worse (AQI above 200).")
    return out


def yearly_insights(city: list[dict], station_rows: list[dict]) -> list[str]:
    out = []
    if len(city) >= 2:
        a, b = city[0], city[-1]
        d = (b["avg_aqi"] - a["avg_aqi"]) / a["avg_aqi"] * 100 if a["avg_aqi"] else 0
        out.append(f"City-wide average AQI moved from {a['avg_aqi']} in {a['year']} to {b['avg_aqi']} in {b['year']} "
                   f"({d:+.1f}%).")
        best = min(city, key=lambda r: r["avg_aqi"])
        worst = max(city, key=lambda r: r["avg_aqi"])
        out.append(f"{best['year']} had the cleanest air on record in this selection (AQI {best['avg_aqi']}); "
                   f"{worst['year']} had the most polluted (AQI {worst['avg_aqi']}).")
        partial = [str(r["year"]) for r in city if r["months_covered"] < 12]
        if partial:
            out.append(f"Note: {', '.join(partial)} cover fewer than 12 months, so year-to-year comparisons involving "
                       "them may reflect seasonality rather than real change.")
    latest = {}
    for r in station_rows:
        latest[r["station"]] = r
    imp = [s for s, r in latest.items() if r["trend"] == "improving"]
    det = [s for s, r in latest.items() if r["trend"] == "deteriorating"]
    if latest:
        out.append(f"In the latest year, {len(imp)} station(s) improved and {len(det)} deteriorated"
                   + (f" (largest rise: {max((latest[s] for s in det), key=lambda r: r['pct_change'] or 0)['station']})" if det else "")
                   + ".")
    return out


def monthly_insights(moy: list[dict], seasons: list[dict], days: list[dict]) -> list[str]:
    out = []
    if moy:
        hi, lo = max(moy, key=lambda r: r["avg_aqi"]), min(moy, key=lambda r: r["avg_aqi"])
        out.append(f"{MONTHS[hi['month']]} is typically the most polluted month (AQI {hi['avg_aqi']}) and "
                   f"{MONTHS[lo['month']]} the cleanest ({lo['avg_aqi']}).")
    if len(seasons) >= 2:
        out.append(f"{seasons[0]['season']} averages {seasons[0]['avg_aqi']} AQI versus {seasons[-1]['avg_aqi']} in "
                   f"{seasons[-1]['season']}.")
    if days:
        out.append(f"The single worst day was {days[0]['day']} with a citywide average AQI of {days[0]['avg_aqi']}.")
    return out


def hourly_insights(hours: list[dict], dow: list[dict]) -> list[str]:
    out = []
    if hours:
        peaks = sorted([h for h in hours if h["is_peak"]], key=lambda h: h["peak_rank"])
        out.append("Pollution peaks around " + ", ".join(_hr(h["hour"]) for h in peaks) +
                   f" (highest: {_hr(peaks[0]['hour'])} at AQI {peaks[0]['avg_aqi']}).")
        lo = min(hours, key=lambda h: h["avg_aqi"])
        out.append(f"The cleanest hour is {_hr(lo['hour'])} (AQI {lo['avg_aqi']}), "
                   f"{abs(lo['vs_daily_mean'])} below the daily mean.")
    if dow:
        hi = max(dow, key=lambda r: r["avg_aqi"])
        lo = min(dow, key=lambda r: r["avg_aqi"])
        out.append(f"{DOW[hi['day_of_week']]}s average the highest AQI ({hi['avg_aqi']}); {DOW[lo['day_of_week']]}s the lowest ({lo['avg_aqi']}).")
    return out


def pollutant_insights(summary: dict, by_station: list[dict], avail: list[str]) -> list[str]:
    out = []
    for p in avail:
        rows = [r for r in by_station if r.get(p) is not None]
        if len(rows) >= 2:
            hi = max(rows, key=lambda r: r[p])
            lo = min(rows, key=lambda r: r[p])
            out.append(f"{PNAMES[p]} is highest at {hi['station']} ({hi[p]} ug/m3) and lowest at {lo['station']} ({lo[p]} ug/m3).")
    if "pm25" in avail and "pm10" in avail and summary.get("avg_pm25"):
        out.append(f"PM2.5 makes up about {summary['avg_pm25'] / summary['avg_pm10'] * 100:.0f}% of PM10 mass on average.")
    missing = [PNAMES[p] for p in PNAMES if p not in avail]
    if missing:
        out.append(f"Not available in this dataset: {', '.join(missing)}.")
    return out
