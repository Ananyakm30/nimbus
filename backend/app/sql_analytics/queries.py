"""Analytical SQL. Every number on the dashboard comes from one of these queries.

Written in portable SQL (MySQL 8 / SQLite 3.25+): CTEs, window functions, CASE and plain aggregates only.
`{where}` is always a WHERE clause over alias `r` (air_quality_readings) built from bound parameters.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

POLLUTANT_COLS = {"pm25": "PM2.5", "pm10": "PM10", "no2": "NO2", "so2": "SO2"}
SORTABLE = {"ts", "aqi", "pm25", "pm10", "no2", "so2", "station"}

# bin edges (ug/m3) used for pollutant histograms - CPCB "Good/Satisfactory/..." concentration breakpoints
BIN_EDGES = {
    "pm25": [30, 60, 90, 120, 250],
    "pm10": [50, 100, 250, 350, 430],
    "no2": [40, 80, 180, 280, 400],
    "so2": [40, 80, 380, 800, 1600],
}

SEASON_CASE = """CASE WHEN {m} IN (12, 1, 2) THEN 'Winter' WHEN {m} IN (3, 4, 5) THEN 'Summer'
            WHEN {m} IN (6, 7, 8, 9) THEN 'Monsoon' ELSE 'Post-monsoon' END"""


def cat(expr: str) -> str:
    """CPCB AQI category as a CASE expression."""
    return (f"CASE WHEN {expr} IS NULL THEN NULL WHEN {expr} <= 50 THEN 'Good' WHEN {expr} <= 100 THEN 'Satisfactory' "
            f"WHEN {expr} <= 200 THEN 'Moderate' WHEN {expr} <= 300 THEN 'Poor' WHEN {expr} <= 400 THEN 'Very Poor' "
            f"ELSE 'Severe' END")


FROM = "FROM air_quality_readings r JOIN monitoring_stations s ON s.station_id = r.station_id"


def station_list() -> str:
    return """SELECT s.station_id, s.name, s.latitude, s.longitude, s.coordinate_source,
       COUNT(r.reading_id) AS records, COUNT(r.aqi) AS aqi_records, ROUND(AVG(r.aqi), 1) AS avg_aqi,
       MIN(r.ts) AS first_reading, MAX(r.ts) AS last_reading
FROM monitoring_stations s
LEFT JOIN air_quality_readings r ON r.station_id = s.station_id
WHERE s.is_demo = :is_demo
GROUP BY s.station_id, s.name, s.latitude, s.longitude, s.coordinate_source
ORDER BY s.name"""


def kpis(where: str) -> str:
    return f"""SELECT COUNT(*) AS records, COUNT(r.aqi) AS aqi_n, ROUND(AVG(r.aqi), 1) AS avg_aqi,
       MAX(r.aqi) AS max_aqi, MIN(r.aqi) AS min_aqi, COUNT(DISTINCT r.station_id) AS stations,
       COUNT(r.pm25) AS n_pm25, COUNT(r.pm10) AS n_pm10, COUNT(r.no2) AS n_no2, COUNT(r.so2) AS n_so2,
       MIN(r.ts) AS first_ts, MAX(r.ts) AS last_ts, COUNT(r.hour) AS n_hourly
FROM air_quality_readings r
{where}"""


def extremes(where: str) -> str:
    return f"""WITH hi AS (
    SELECT s.name AS station, r.ts, r.aqi
    {FROM}
    {where} AND r.aqi IS NOT NULL
    ORDER BY r.aqi DESC, r.ts
    LIMIT 1),
lo AS (
    SELECT s.name AS station, r.ts, r.aqi
    {FROM}
    {where} AND r.aqi IS NOT NULL
    ORDER BY r.aqi ASC, r.ts
    LIMIT 1)
SELECT 'highest' AS kind, station, ts, aqi FROM hi
UNION ALL
SELECT 'lowest' AS kind, station, ts, aqi FROM lo"""


def category_distribution(where: str) -> str:
    return f"""WITH c AS (
    SELECT {cat('r.aqi')} AS category
    FROM air_quality_readings r
    {where} AND r.aqi IS NOT NULL)
SELECT category, COUNT(*) AS readings,
       ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS share_pct
FROM c
GROUP BY category"""


def monthly_timeline(where: str) -> str:
    return f"""SELECT r.year, r.month, r.year * 100 + r.month AS ym, ROUND(AVG(r.aqi), 1) AS avg_aqi,
       MAX(r.aqi) AS max_aqi, COUNT(r.aqi) AS readings
FROM air_quality_readings r
{where} AND r.aqi IS NOT NULL
GROUP BY r.year, r.month
ORDER BY ym"""


def rankings(where: str) -> str:
    return f"""WITH station_stats AS (
    SELECT s.station_id, s.name AS station, COUNT(r.aqi) AS readings, AVG(r.aqi) AS avg_aqi,
           MIN(r.aqi) AS min_aqi, MAX(r.aqi) AS max_aqi
    {FROM}
    {where} AND r.aqi IS NOT NULL
    GROUP BY s.station_id, s.name),
city AS (
    SELECT AVG(r.aqi) AS city_avg FROM air_quality_readings r {where} AND r.aqi IS NOT NULL)
SELECT ss.station_id, ss.station, ss.readings, ROUND(ss.avg_aqi, 1) AS avg_aqi, ss.min_aqi, ss.max_aqi,
       RANK() OVER (ORDER BY ss.avg_aqi DESC) AS pollution_rank,
       DENSE_RANK() OVER (ORDER BY ROUND(ss.avg_aqi, 0) DESC) AS dense_rank,
       ROUND(100.0 * (ss.avg_aqi - c.city_avg) / NULLIF(c.city_avg, 0), 1) AS pct_vs_city,
       ROUND(c.city_avg, 1) AS city_avg,
       {cat('ss.avg_aqi')} AS category
FROM station_stats ss CROSS JOIN city c
ORDER BY pollution_rank, ss.station"""


def yearly_city(where: str) -> str:
    return f"""WITH yearly AS (
    SELECT r.year, AVG(r.aqi) AS avg_aqi, COUNT(r.aqi) AS readings, COUNT(DISTINCT r.month) AS months_covered
    FROM air_quality_readings r
    {where} AND r.aqi IS NOT NULL
    GROUP BY r.year)
SELECT year, ROUND(avg_aqi, 1) AS avg_aqi, readings, months_covered,
       ROUND(LAG(avg_aqi) OVER (ORDER BY year), 1) AS prev_year_aqi,
       ROUND(LEAD(avg_aqi) OVER (ORDER BY year), 1) AS next_year_aqi,
       ROUND(100.0 * (avg_aqi - LAG(avg_aqi) OVER (ORDER BY year)) / NULLIF(LAG(avg_aqi) OVER (ORDER BY year), 0), 1) AS pct_change,
       CASE WHEN LAG(avg_aqi) OVER (ORDER BY year) IS NULL THEN 'baseline'
            WHEN avg_aqi < LAG(avg_aqi) OVER (ORDER BY year) * 0.98 THEN 'improving'
            WHEN avg_aqi > LAG(avg_aqi) OVER (ORDER BY year) * 1.02 THEN 'deteriorating'
            ELSE 'stable' END AS trend
FROM yearly
ORDER BY year"""


def yearly_station(where: str) -> str:
    return f"""WITH yearly AS (
    SELECT s.station_id, s.name AS station, r.year, AVG(r.aqi) AS avg_aqi, COUNT(r.aqi) AS readings,
           COUNT(DISTINCT r.month) AS months_covered
    {FROM}
    {where} AND r.aqi IS NOT NULL
    GROUP BY s.station_id, s.name, r.year)
SELECT station_id, station, year, ROUND(avg_aqi, 1) AS avg_aqi, readings, months_covered,
       ROUND(LAG(avg_aqi) OVER (PARTITION BY station_id ORDER BY year), 1) AS prev_year_aqi,
       ROUND(100.0 * (avg_aqi - LAG(avg_aqi) OVER (PARTITION BY station_id ORDER BY year))
             / NULLIF(LAG(avg_aqi) OVER (PARTITION BY station_id ORDER BY year), 0), 1) AS pct_change,
       CASE WHEN LAG(avg_aqi) OVER (PARTITION BY station_id ORDER BY year) IS NULL THEN 'baseline'
            WHEN avg_aqi < LAG(avg_aqi) OVER (PARTITION BY station_id ORDER BY year) * 0.98 THEN 'improving'
            WHEN avg_aqi > LAG(avg_aqi) OVER (PARTITION BY station_id ORDER BY year) * 1.02 THEN 'deteriorating'
            ELSE 'stable' END AS trend
FROM yearly
ORDER BY station, year"""


def month_of_year(where: str) -> str:
    return f"""WITH m AS (
    SELECT r.month, AVG(r.aqi) AS avg_aqi, COUNT(r.aqi) AS readings
    FROM air_quality_readings r
    {where} AND r.aqi IS NOT NULL
    GROUP BY r.month)
SELECT month, ROUND(avg_aqi, 1) AS avg_aqi, readings,
       {SEASON_CASE.format(m='month')} AS season,
       RANK() OVER (ORDER BY avg_aqi DESC) AS pollution_rank,
       ROUND(LAG(avg_aqi) OVER (ORDER BY month), 1) AS prev_month_aqi,
       ROUND(avg_aqi - AVG(avg_aqi) OVER (), 1) AS vs_annual_mean
FROM m
ORDER BY month"""


def seasonal(where: str) -> str:
    return f"""WITH s AS (
    SELECT {SEASON_CASE.format(m='r.month')} AS season, r.aqi, r.pm25, r.pm10
    FROM air_quality_readings r
    {where} AND r.aqi IS NOT NULL)
SELECT season, COUNT(*) AS readings, ROUND(AVG(aqi), 1) AS avg_aqi, ROUND(MAX(aqi), 0) AS max_aqi,
       ROUND(AVG(pm25), 1) AS avg_pm25, ROUND(AVG(pm10), 1) AS avg_pm10
FROM s
GROUP BY season
ORDER BY avg_aqi DESC"""


def hourly(where: str) -> str:
    return f"""WITH h AS (
    SELECT r.hour, AVG(r.aqi) AS avg_aqi, COUNT(r.aqi) AS readings
    FROM air_quality_readings r
    {where} AND r.hour IS NOT NULL AND r.aqi IS NOT NULL
    GROUP BY r.hour)
SELECT hour, ROUND(avg_aqi, 1) AS avg_aqi, readings,
       RANK() OVER (ORDER BY avg_aqi DESC) AS peak_rank,
       CASE WHEN RANK() OVER (ORDER BY avg_aqi DESC) <= 3 THEN 1 ELSE 0 END AS is_peak,
       ROUND(avg_aqi - AVG(avg_aqi) OVER (), 1) AS vs_daily_mean,
       ROUND(LEAD(avg_aqi) OVER (ORDER BY hour) - avg_aqi, 1) AS change_to_next
FROM h
ORDER BY hour"""


def day_of_week(where: str) -> str:
    return f"""SELECT r.day_of_week, ROUND(AVG(r.aqi), 1) AS avg_aqi, COUNT(r.aqi) AS readings,
       RANK() OVER (ORDER BY AVG(r.aqi) DESC) AS pollution_rank
FROM air_quality_readings r
{where} AND r.aqi IS NOT NULL
GROUP BY r.day_of_week
ORDER BY r.day_of_week"""


def hour_by_dow(where: str) -> str:
    return f"""SELECT r.day_of_week, r.hour, ROUND(AVG(r.aqi), 1) AS avg_aqi, COUNT(r.aqi) AS readings
FROM air_quality_readings r
{where} AND r.aqi IS NOT NULL AND r.hour IS NOT NULL
GROUP BY r.day_of_week, r.hour
ORDER BY r.day_of_week, r.hour"""


def pollutant_summary(where: str) -> str:
    cols = ", ".join(f"ROUND(AVG(r.{c}), 1) AS avg_{c}, ROUND(MIN(r.{c}), 1) AS min_{c}, ROUND(MAX(r.{c}), 1) AS max_{c}, "
                     f"COUNT(r.{c}) AS n_{c}" for c in POLLUTANT_COLS)
    return f"SELECT COUNT(*) AS records, {cols}\nFROM air_quality_readings r\n{where}"


def pollutant_by_station(where: str) -> str:
    avg = ", ".join(f"AVG(r.{c}) AS {c}" for c in POLLUTANT_COLS)
    rk = ",\n       ".join(f"RANK() OVER (ORDER BY {c} DESC) AS rank_{c}" for c in POLLUTANT_COLS)
    rd = ", ".join(f"ROUND({c}, 1) AS {c}" for c in POLLUTANT_COLS)
    return f"""WITH st AS (
    SELECT s.station_id, s.name AS station, COUNT(*) AS records, {avg}
    {FROM}
    {where}
    GROUP BY s.station_id, s.name)
SELECT station_id, station, records, {rd},
       {rk}
FROM st
ORDER BY station"""


def pollutant_monthly(where: str) -> str:
    avg = ", ".join(f"ROUND(AVG(r.{c}), 1) AS {c}" for c in POLLUTANT_COLS)
    return f"""SELECT r.year, r.month, r.year * 100 + r.month AS ym, {avg}
FROM air_quality_readings r
{where}
GROUP BY r.year, r.month
ORDER BY ym"""


def pollutant_monthly_seasonality(where: str) -> str:
    avg = ", ".join(f"ROUND(AVG(r.{c}), 1) AS {c}" for c in POLLUTANT_COLS)
    return f"""SELECT r.month, {avg}
FROM air_quality_readings r
{where}
GROUP BY r.month
ORDER BY r.month"""


def pollutant_distribution(where: str, col: str) -> str:
    if col not in BIN_EDGES:
        raise ValueError("unknown pollutant")
    e = BIN_EDGES[col]
    labels = [f"0-{e[0]}"] + [f"{e[i] + 1}-{e[i + 1]}" for i in range(len(e) - 1)] + [f">{e[-1]}"]
    whens = [f"WHEN r.{col} <= {e[0]} THEN '{labels[0]}'"] + \
            [f"WHEN r.{col} <= {e[i + 1]} THEN '{labels[i + 1]}'" for i in range(len(e) - 1)]
    order = [f"WHEN '{l}' THEN {i}" for i, l in enumerate(labels)]
    return f"""WITH b AS (
    SELECT CASE {' '.join(whens)} ELSE '{labels[-1]}' END AS bin
    FROM air_quality_readings r
    {where} AND r.{col} IS NOT NULL)
SELECT bin, COUNT(*) AS readings, ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS share_pct,
       CASE bin {' '.join(order)} END AS bin_order
FROM b
GROUP BY bin
ORDER BY bin_order"""


def polluted_days(where: str) -> str:
    return f"""WITH daily AS (
    SELECT r.day, AVG(r.aqi) AS avg_aqi, MAX(r.aqi) AS peak_aqi, COUNT(r.aqi) AS readings,
           COUNT(DISTINCT r.station_id) AS stations
    FROM air_quality_readings r
    {where} AND r.aqi IS NOT NULL
    GROUP BY r.day
    HAVING COUNT(r.aqi) >= 3)
SELECT day, ROUND(avg_aqi, 1) AS avg_aqi, peak_aqi, readings, stations,
       DENSE_RANK() OVER (ORDER BY avg_aqi DESC) AS period_rank
FROM daily
ORDER BY avg_aqi DESC, day
LIMIT 10"""


def polluted_months(where: str) -> str:
    return f"""WITH mo AS (
    SELECT r.year, r.month, AVG(r.aqi) AS avg_aqi, COUNT(r.aqi) AS readings
    FROM air_quality_readings r
    {where} AND r.aqi IS NOT NULL
    GROUP BY r.year, r.month
    HAVING COUNT(r.aqi) >= 10)
SELECT year, month, ROUND(avg_aqi, 1) AS avg_aqi, readings,
       RANK() OVER (ORDER BY avg_aqi DESC) AS period_rank
FROM mo
ORDER BY avg_aqi DESC
LIMIT 5"""


def map_stations(where: str) -> str:
    return f"""WITH latest AS (
    SELECT r.station_id, r.ts, r.aqi, r.pm25, r.pm10, r.no2, r.so2, 1 AS rn
    FROM air_quality_readings r
    JOIN (SELECT r.station_id, MAX(r.ts) AS ts
          FROM air_quality_readings r
          {where} AND r.aqi IS NOT NULL
          GROUP BY r.station_id) m ON m.station_id = r.station_id AND m.ts = r.ts),
avgs AS (
    SELECT r.station_id, COUNT(r.aqi) AS readings, AVG(r.aqi) AS avg_aqi, AVG(r.pm25) AS avg_pm25,
           AVG(r.pm10) AS avg_pm10, AVG(r.no2) AS avg_no2, AVG(r.so2) AS avg_so2
    FROM air_quality_readings r
    {where}
    GROUP BY r.station_id)
SELECT s.station_id, s.name, s.latitude, s.longitude, s.coordinate_source,
       a.readings, ROUND(a.avg_aqi, 1) AS avg_aqi, ROUND(a.avg_pm25, 1) AS avg_pm25, ROUND(a.avg_pm10, 1) AS avg_pm10,
       ROUND(a.avg_no2, 1) AS avg_no2, ROUND(a.avg_so2, 1) AS avg_so2,
       l.ts AS latest_ts, l.aqi AS latest_aqi, l.pm25 AS latest_pm25, l.pm10 AS latest_pm10,
       l.no2 AS latest_no2, l.so2 AS latest_so2,
       {cat('a.avg_aqi')} AS category
FROM monitoring_stations s
JOIN avgs a ON a.station_id = s.station_id
LEFT JOIN latest l ON l.station_id = s.station_id AND l.rn = 1
ORDER BY a.avg_aqi DESC"""


def map_history(where: str) -> str:
    return f"""WITH m AS (
    SELECT r.station_id, r.year * 100 + r.month AS ym, AVG(r.aqi) AS avg_aqi
    FROM air_quality_readings r
    {where} AND r.aqi IS NOT NULL
    GROUP BY r.station_id, r.year, r.month),
ranked AS (
    SELECT m.*, ROW_NUMBER() OVER (PARTITION BY station_id ORDER BY ym DESC) AS rn FROM m)
SELECT station_id, ym, ROUND(avg_aqi, 1) AS avg_aqi
FROM ranked
WHERE rn <= 24
ORDER BY station_id, ym"""


def missing_by_station(where: str) -> str:
    sums = ", ".join(f"SUM(CASE WHEN r.{c} IS NULL THEN 1 ELSE 0 END) AS missing_{c}" for c in ["aqi", *POLLUTANT_COLS])
    cnts = ", ".join(f"COUNT(r.{c}) AS present_{c}" for c in ["aqi", *POLLUTANT_COLS])
    return f"""SELECT s.station_id, s.name AS station, COUNT(*) AS records, {sums}, {cnts},
       MIN(r.ts) AS first_reading, MAX(r.ts) AS last_reading
{FROM}
{where}
GROUP BY s.station_id, s.name
ORDER BY s.name"""


def duplicates(is_demo_param: str = ":is_demo") -> str:
    return f"""WITH dup AS (
    SELECT rr.import_id, rr.station_raw, rr.ts_raw, COUNT(*) AS copies, MIN(rr.row_number) AS first_row
    FROM raw_records rr JOIN data_imports di ON di.import_id = rr.import_id
    WHERE di.is_demo = {is_demo_param} AND rr.ts_raw IS NOT NULL AND rr.ts_raw <> ''
    GROUP BY rr.import_id, rr.station_raw, rr.ts_raw
    HAVING COUNT(*) > 1)
SELECT import_id, station_raw AS station, ts_raw AS timestamp_raw, copies, first_row,
       SUM(copies - 1) OVER () AS total_extra_rows, COUNT(*) OVER () AS duplicate_keys
FROM dup
ORDER BY copies DESC, import_id, first_row
LIMIT 25"""


def raw_status(is_demo_param: str = ":is_demo") -> str:
    return f"""SELECT rr.status, COUNT(*) AS records,
       ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS share_pct
FROM raw_records rr JOIN data_imports di ON di.import_id = rr.import_id
WHERE di.is_demo = {is_demo_param}
GROUP BY rr.status
ORDER BY records DESC"""


def readings_page(where: str, sort: str, direction: str) -> str:
    col = {"ts": "r.ts", "station": "s.name"}.get(sort, f"r.{sort}")
    return f"""SELECT r.reading_id, s.name AS station, r.ts, r.aqi, r.pm25, r.pm10, r.no2, r.so2, r.aqi_derived
{FROM}
{where}
ORDER BY {col} {direction}, r.reading_id
LIMIT :limit OFFSET :offset"""


def readings_count(where: str) -> str:
    return f"SELECT COUNT(*) AS n FROM air_quality_readings r {where}"


@dataclass
class QueryDef:
    id: str
    title: str
    endpoint: str
    explanation: str
    features: list[str]
    build: Callable[[str], str]
    needs_where: bool = True
    extra: dict = field(default_factory=dict)


REGISTRY: list[QueryDef] = [
    QueryDef("station_list", "Monitoring stations & coverage", "GET /api/air-quality/stations",
             "Lists every station with its record count, average AQI and first/last reading using a LEFT JOIN so "
             "stations with no data still appear.", ["LEFT JOIN", "GROUP BY"], lambda w: station_list(), False),
    QueryDef("kpis", "Headline KPIs", "GET /api/dashboard/overview",
             "Counts, average, highest and lowest AQI and per-pollutant coverage for the selected filters. "
             "Run twice (current and previous period) to calculate the change.", ["Aggregates"], kpis),
    QueryDef("extremes", "Highest and lowest AQI readings", "GET /api/dashboard/overview",
             "Finds the single highest and lowest AQI reading and where/when it occurred: two top-1 CTEs joined to "
             "the station table and combined with UNION ALL.", ["CTE", "JOIN", "UNION ALL"], extremes),
    QueryDef("category_distribution", "AQI category distribution", "GET /api/dashboard/overview",
             "Buckets every reading into a CPCB category with CASE and computes each share with SUM() OVER ().",
             ["CTE", "CASE", "Window"], category_distribution),
    QueryDef("monthly_timeline", "Monthly average AQI timeline", "GET /api/air-quality/trends/monthly",
             "Average and peak AQI for every calendar month in the data.", ["GROUP BY"], monthly_timeline),
    QueryDef("rankings", "Station ranking by average AQI", "GET /api/air-quality/rankings",
             "Ranks stations with RANK() and DENSE_RANK(), compares each against the city-wide average via a CTE "
             "cross join, and labels the CPCB category with CASE.",
             ["CTE", "JOIN", "RANK", "DENSE_RANK", "CASE", "Subquery"], rankings),
    QueryDef("yearly_city", "Year-over-year AQI (city)", "GET /api/air-quality/trends/yearly",
             "Annual averages with LAG() for the previous year, LEAD() for the next, percentage change and an "
             "improving / deteriorating label (2% tolerance band).", ["CTE", "LAG", "LEAD", "CASE"], yearly_city),
    QueryDef("yearly_station", "Year-over-year AQI by station", "GET /api/air-quality/trends/yearly",
             "Same as above but partitioned by station so each station is compared with its own history.",
             ["CTE", "JOIN", "LAG", "PARTITION BY"], yearly_station),
    QueryDef("month_of_year", "Seasonality: average AQI by month", "GET /api/air-quality/trends/monthly",
             "Collapses all years into the 12 calendar months, assigns a season with CASE, ranks months and "
             "compares each with the annual mean.", ["CTE", "CASE", "RANK", "LAG", "AVG OVER"], month_of_year),
    QueryDef("seasonal", "Seasonal comparison", "GET /api/air-quality/trends/monthly",
             "Winter / Summer / Monsoon / Post-monsoon averages for AQI and particulate matter.",
             ["CTE", "CASE", "GROUP BY"], seasonal),
    QueryDef("hourly", "Hourly AQI distribution & peak hours", "GET /api/air-quality/trends/hourly",
             "Average AQI per hour of day, the three highest hours flagged with RANK(), and each hour's "
             "deviation from the daily mean.", ["CTE", "RANK", "LEAD", "AVG OVER", "CASE"], hourly),
    QueryDef("day_of_week", "Day-of-week AQI pattern", "GET /api/air-quality/trends/hourly",
             "Average AQI per weekday (0 = Monday), ranked.", ["GROUP BY", "RANK"], day_of_week),
    QueryDef("hour_by_dow", "Hour x weekday heat grid", "GET /api/air-quality/trends/hourly",
             "Average AQI for each weekday-hour combination.", ["GROUP BY"], hour_by_dow),
    QueryDef("pollutant_summary", "Pollutant averages and coverage", "GET /api/air-quality/pollutants",
             "Average / min / max / non-null count for each pollutant; zero counts mean the pollutant is not "
             "available and is hidden in the UI.", ["Aggregates"], pollutant_summary),
    QueryDef("pollutant_by_station", "Station-wise pollutant comparison", "GET /api/air-quality/pollutants",
             "Average concentration per station with a window RANK() for every pollutant.",
             ["CTE", "JOIN", "RANK"], pollutant_by_station),
    QueryDef("pollutant_monthly", "Monthly pollutant timeline", "GET /api/air-quality/pollutants",
             "Monthly average of each pollutant across the selected period.", ["GROUP BY"], pollutant_monthly),
    QueryDef("pollutant_distribution", "Pollutant concentration distribution", "GET /api/air-quality/pollutants",
             "Histogram of one pollutant using CASE bins at the CPCB concentration breakpoints (PM2.5 shown here).",
             ["CTE", "CASE", "SUM OVER"], lambda w: pollutant_distribution(w, "pm25")),
    QueryDef("polluted_days", "Most polluted days", "GET /api/air-quality/trends/monthly",
             "Top 10 days by average AQI across stations, requiring at least 3 readings, ranked with DENSE_RANK().",
             ["CTE", "HAVING", "DENSE_RANK"], polluted_days),
    QueryDef("polluted_months", "Most polluted months", "GET /api/air-quality/trends/monthly",
             "Top 5 calendar months by average AQI (min. 10 readings).", ["CTE", "HAVING", "RANK"], polluted_months),
    QueryDef("map_stations", "Map: station summary with latest reading", "GET /api/air-quality/map",
             "Per-station averages plus the latest reading, found by joining each reading to its station's MAX(ts) "
             "(a derived-table subquery that uses the unique station+timestamp index).",
             ["CTE", "JOIN", "Subquery", "CASE"], map_stations),
    QueryDef("map_history", "Map: 24-month AQI mini-series", "GET /api/air-quality/map",
             "Latest 24 monthly averages per station, trimmed with ROW_NUMBER() inside the partition.",
             ["CTE", "ROW_NUMBER"], map_history),
    QueryDef("missing_by_station", "Missing values by station", "GET /api/data-quality/summary",
             "Counts NULL AQI/pollutant cells per station with SUM(CASE ...) and COUNT().", ["JOIN", "CASE"],
             missing_by_station),
    QueryDef("duplicates", "Duplicate record identification", "GET /api/data-quality/summary",
             "Finds station+timestamp pairs that appear more than once in the preserved raw records, with the "
             "total number of surplus rows computed by a window SUM.", ["CTE", "JOIN", "HAVING", "SUM OVER"],
             lambda w: duplicates(), False),
    QueryDef("raw_status", "Raw-record outcome summary", "GET /api/data-quality/summary",
             "What happened to every uploaded row: retained, duplicate, invalid timestamp, etc.",
             ["JOIN", "GROUP BY", "SUM OVER"], lambda w: raw_status(), False),
]
BY_ID = {q.id: q for q in REGISTRY}
