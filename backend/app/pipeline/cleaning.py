"""Pure-Pandas cleaning pipeline. No database access: input DataFrame in, cleaned frame + report out.

Every input row ends in exactly one terminal status, so that
    original = retained + aggregated + duplicates + conflicts + invalid_timestamps + no_measurements
and nothing is ever dropped silently.
"""
from __future__ import annotations

import re
import warnings
from dataclasses import dataclass, field
from datetime import datetime

import numpy as np
import pandas as pd

FIELDS = ["aqi", "pm25", "pm10", "no2", "so2"]
LABELS = {"aqi": "AQI", "pm25": "PM2.5", "pm10": "PM10", "no2": "NO2", "so2": "SO2"}
POLLUTANTS = ["pm25", "pm10", "no2", "so2"]

# Physical plausibility ranges (CPCB AQI is defined on 0-500; concentrations in ug/m3).
VALID_RANGE = {"aqi": (0, 500), "pm25": (0, 1000), "pm10": (0, 2000), "no2": (0, 1000), "so2": (0, 2000)}
SENTINELS = {-999.0, -99.0, -9999.0, 9999.0, 99999.0}
MISSING_MARKERS = {"", "na", "n/a", "nan", "null", "none", "-", "--", "---", "nil", "missing", "#n/a"}
MIN_YEAR = 2000

HEADER_PATTERNS: list[tuple[str, str]] = [
    ("lat", r"^(lat|latitude)$"),
    ("lon", r"^(lon|lng|long|longitude)$"),
    ("station", r"^(station|station name|site|site name|monitoring station|monitoring location|location|location name|area)$"),
    ("timestamp", r"^(timestamp|date ?time|time ?stamp|to ?date|from ?date|recorded at)$"),
    ("date", r"^(date|sampling date|observation date|day)$"),
    ("time", r"^(time|hour|hr|hours)$"),
    ("aqi", r"^(aqi|air quality index|overall aqi|aqi value|aqi index)$"),
    ("pm25", r"^pm ?2\.?5\b"),
    ("pm10", r"^pm ?10\b"),
    ("no2", r"^(no ?2\b|nitrogen dioxide)"),
    ("so2", r"^(so ?2\b|sulphur dioxide|sulfur dioxide)"),
]

# CPCB National AQI breakpoints (concentration -> sub-index). Same points as sql/00_breakpoints.sql.
_BP = {
    "pm25": ([0, 30, 31, 60, 61, 90, 91, 120, 121, 250, 251, 500]),
    "pm10": ([0, 50, 51, 100, 101, 250, 251, 350, 351, 430, 431, 800]),
    "no2": ([0, 40, 41, 80, 81, 180, 181, 280, 281, 400, 401, 800]),
    "so2": ([0, 40, 41, 80, 81, 380, 381, 800, 801, 1600, 1601, 3200]),
}
_IDX = [0, 50, 51, 100, 101, 200, 201, 300, 301, 400, 401, 500]


class PipelineError(ValueError):
    """Raised when a file cannot be processed (bad format / no usable columns)."""


@dataclass
class CleanResult:
    clean: pd.DataFrame
    row_status: pd.DataFrame  # one row per original row: row_number, station_raw, ts_raw, status, reason
    report: dict
    coords: dict = field(default_factory=dict)


def norm_header(c) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[_\-]+", " ", str(c).strip().lower()))


def detect_columns(columns) -> tuple[dict[str, str], list[str]]:
    mapping: dict[str, str] = {}
    used: set[str] = set()
    for fld, pat in HEADER_PATTERNS:
        for c in columns:
            if c in used:
                continue
            if re.search(pat, norm_header(c)):
                mapping[fld] = c
                used.add(c)
                break
    return mapping, [c for c in columns if c not in used]


def _parse_dt(s: pd.Series) -> pd.Series:
    s = s.astype("string").str.strip()
    blank = s.isna() | s.str.lower().isin(MISSING_MARKERS)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        out = pd.to_datetime(s.where(~blank), format="ISO8601", errors="coerce")
        todo = out.isna() & ~blank
        if todo.any():
            out.loc[todo] = pd.to_datetime(s[todo], dayfirst=True, format="mixed", errors="coerce")
    if getattr(out.dt, "tz", None) is not None:
        out = out.dt.tz_convert("Asia/Kolkata").dt.tz_localize(None)
    return out.astype("datetime64[ns]")


def _time_offset(s: pd.Series) -> pd.Series:
    """Hour-of-day column -> timedelta. Accepts 0-23 numbers or 'HH:MM[:SS]' strings."""
    s = s.astype("string").str.strip()
    num = pd.to_numeric(s, errors="coerce")
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        parsed = pd.to_datetime(s.where(num.isna()), format="mixed", errors="coerce")
    hrs = num.where((num >= 0) & (num <= 24)) * 3600
    from_str = parsed.dt.hour * 3600 + parsed.dt.minute * 60
    secs = hrs.fillna(from_str)
    return pd.to_timedelta(secs, unit="s")


def cpcb_aqi(df: pd.DataFrame) -> pd.Series:
    """Max sub-index across available pollutants. CPCB: >=3 pollutants incl. PM2.5 or PM10."""
    subs = pd.DataFrame({
        p: np.interp(df[p].to_numpy(dtype=float), _BP[p], _IDX) if p in df else np.nan for p in _BP
    }, index=df.index).where(df[[p for p in _BP]].notna())
    enough = subs.notna().sum(axis=1) >= 3
    has_pm = subs[["pm25", "pm10"]].notna().any(axis=1)
    return subs.max(axis=1).round().where(enough & has_pm)


def clean_dataframe(raw: pd.DataFrame, filename: str, station_override: str | None = None) -> CleanResult:
    if raw.empty:
        raise PipelineError("The file contains no data rows.")
    raw = raw.copy()
    raw.columns = [str(c).strip() for c in raw.columns]
    mapping, unmapped = detect_columns(list(raw.columns))

    has_ts = "timestamp" in mapping or "date" in mapping
    measured = [f for f in FIELDS if f in mapping]
    if not has_ts:
        raise PipelineError(
            "No timestamp column found. Expected a header such as Date, Timestamp or DateTime. "
            f"Columns seen: {', '.join(map(str, raw.columns[:15]))}")
    if not measured:
        raise PipelineError(
            "No AQI or pollutant columns recognised (AQI, PM2.5, PM10, NO2, SO2 in wide format). "
            f"Columns seen: {', '.join(map(str, raw.columns[:15]))}")

    n = len(raw)
    decisions: list[str] = []
    df = pd.DataFrame(index=raw.index)
    df["row_number"] = np.arange(2, n + 2)  # row 1 is the header

    # ---- 1. timestamps -------------------------------------------------------------------------
    if "timestamp" in mapping:
        ts_src = raw[mapping["timestamp"]]
        ts = _parse_dt(ts_src)
        has_time = bool(((ts.dt.hour != 0) | (ts.dt.minute != 0)).fillna(False).any())
        if "time" in mapping:
            has_time = True
    else:
        ts_src = raw[mapping["date"]]
        ts = _parse_dt(ts_src)
        if "time" in mapping:
            off = _time_offset(raw[mapping["time"]])
            ts = ts + off.fillna(pd.Timedelta(0))
            has_time = bool(off.notna().any())
        else:
            has_time = False
    df["ts_raw"] = ts_src.astype("string").str.strip()
    bad_ts = ts.isna() | (ts.dt.year < MIN_YEAR) | (ts > pd.Timestamp(datetime.now()) + pd.Timedelta(days=1))
    ts = ts.where(~bad_ts)

    # ---- 2. station ----------------------------------------------------------------------------
    fallback = (station_override or "").strip() or re.sub(r"[_\-]+", " ", re.sub(r"\.[A-Za-z0-9]+$", "", filename)).strip() \
        or "Unknown station"
    if "station" in mapping:
        st = raw[mapping["station"]].astype("string").str.strip().str.replace(r"\s+", " ", regex=True)
        st_blank = st.isna() | st.str.lower().isin(MISSING_MARKERS)
        st = st.where(~st_blank, fallback)
        canon = {}
        for v in st.dropna():
            canon.setdefault(v.lower(), v)
        st = st.map(lambda v: canon.get(v.lower(), v))
        if st_blank.any():
            decisions.append(f"{int(st_blank.sum())} rows had no station name and were assigned '{fallback}'.")
    else:
        st = pd.Series(fallback, index=raw.index, dtype="string")
        decisions.append(f"No station column; all rows assigned to '{fallback}' (from "
                         f"{'the supplied station name' if station_override else 'the file name'}).")
    df["station_raw"] = st

    # ---- 3. numeric conversion + validation ----------------------------------------------------
    invalid: dict[str, dict[str, int]] = {}
    missing_before: dict[str, int] = {}
    for f in measured:
        s = raw[mapping[f]].astype("string").str.strip()
        blank = s.isna() | s.str.lower().isin(MISSING_MARKERS)
        num = pd.to_numeric(s.where(~blank), errors="coerce")
        non_numeric = (~blank) & num.isna()
        sentinel = num.isin(SENTINELS)
        lo, hi = VALID_RANGE[f]
        out_of_range = (~sentinel) & num.notna() & ((num < lo) | (num > hi))
        invalid[f] = {"non_numeric": int(non_numeric.sum()), "sentinel_codes": int(sentinel.sum()),
                      "out_of_range": int(out_of_range.sum())}
        missing_before[f] = int(blank.sum())  # genuinely empty / NA markers
        df[f] = num.where(~(sentinel | out_of_range))
    total_invalid_cells = sum(sum(v.values()) for v in invalid.values())
    if total_invalid_cells:
        decisions.append(f"{total_invalid_cells} invalid cells (non-numeric, sentinel codes such as -999, or values "
                         "outside physical limits) were set to missing - never to zero - and counted.")
    for f in FIELDS:
        if f not in measured:
            df[f] = np.nan

    # ---- 4. row decisions ----------------------------------------------------------------------
    df["ts"] = ts
    status = pd.Series("retained", index=df.index, dtype="object")
    reason = pd.Series("", index=df.index, dtype="object")
    status[bad_ts] = "invalid_timestamp"
    reason[bad_ts] = "Timestamp missing, unparseable or outside plausible range"

    live = status == "retained"
    key = ["station_raw", "ts"]
    dup_exact = df[live].duplicated(subset=key + FIELDS, keep="first")
    status[dup_exact[dup_exact].index] = "duplicate"
    reason[dup_exact[dup_exact].index] = "Exact duplicate of an earlier row (same station, time and values)"

    live = status == "retained"
    dup_key = df[live].duplicated(subset=key, keep="first")
    status[dup_key[dup_key].index] = "conflicting_duplicate"
    reason[dup_key[dup_key].index] = "Same station and timestamp as an earlier row but different values; first kept"

    live = status == "retained"
    empty = df[live][FIELDS].isna().all(axis=1)
    status[empty[empty].index] = "no_measurements"
    reason[empty[empty].index] = "No valid AQI or pollutant value after validation"

    # ---- 5. hourly standardisation / aggregation ----------------------------------------------
    kept = df[status == "retained"].copy()
    kept["ts_std"] = kept["ts"].dt.floor("h") if has_time else kept["ts"].dt.normalize()
    grp = kept.groupby(["station_raw", "ts_std"], sort=True)
    sizes = grp["ts"].transform("size")
    if (sizes > 1).any():
        first = ~kept.duplicated(subset=["station_raw", "ts_std"], keep="first")
        folded = kept.index[~first]
        status[folded] = "aggregated"
        reason[folded] = "Sub-hourly reading folded into the hourly mean for its station"
        decisions.append(f"{len(folded)} sub-hourly rows were averaged into hourly means (NaN ignored per column).")
    agg = grp[FIELDS].mean().reset_index()
    agg = agg.rename(columns={"ts_std": "ts"})
    clean = agg.copy()
    clean["hour"] = clean["ts"].dt.hour.astype("Int64") if has_time else pd.array([pd.NA] * len(clean), dtype="Int64")
    clean["aqi_derived"] = False

    # ---- 6. AQI derivation (flagged; reported values are never overwritten) --------------------
    need = clean["aqi"].isna()
    if need.any():
        derived = cpcb_aqi(clean)
        fill = need & derived.notna()
        clean.loc[fill, "aqi"] = derived[fill]
        clean.loc[fill, "aqi_derived"] = True
        if fill.any():
            decisions.append(f"AQI was derived (CPCB max sub-index, needs >=3 pollutants incl. a PM) for {int(fill.sum())} "
                             "rows with no reported AQI; these rows are flagged aqi_derived.")
    if not has_time:
        decisions.append("Source has daily resolution (no time-of-day), so hourly analysis is unavailable for it.")
    decisions.append("Missing pollutant readings are kept as NULL (never imputed or treated as zero).")

    # ---- 7. report -----------------------------------------------------------------------------
    counts = status.value_counts().to_dict()
    final = len(clean)
    avail = [f for f in FIELDS if clean[f].notna().any()]
    missing_after = {f: int(clean[f].isna().sum()) for f in measured}
    station_missing = {}
    for sname, g in clean.groupby("station_raw"):
        station_missing[str(sname)] = {
            "records": int(len(g)),
            **{f: round(float(g[f].isna().mean() * 100), 2) for f in measured},
        }
    reconciled = n == (counts.get("retained", 0) + counts.get("aggregated", 0) + counts.get("duplicate", 0)
                       + counts.get("conflicting_duplicate", 0) + counts.get("invalid_timestamp", 0)
                       + counts.get("no_measurements", 0))
    report = {
        "original_records": n,
        "records_retained": int(counts.get("retained", 0) + counts.get("aggregated", 0)),
        "duplicates_removed": int(counts.get("duplicate", 0)),
        "conflicting_duplicates": int(counts.get("conflicting_duplicate", 0)),
        "aggregated_subhourly": int(counts.get("aggregated", 0)),
        "invalid_timestamps": int(counts.get("invalid_timestamp", 0)),
        "no_measurement_rows": int(counts.get("no_measurements", 0)),
        "final_cleaned_records": final,
        "invalid_values": invalid,
        "invalid_cells_total": total_invalid_cells,
        "missing_cells_detected": int(sum(missing_before.values())),
        "missing_before": missing_before,
        "missing_after": missing_after,
        "station_missing": station_missing,
        "columns_mapped": {k: v for k, v in mapping.items()},
        "columns_unmapped": [str(c) for c in unmapped],
        "available_fields": avail,
        "resolution": "hourly" if has_time else "daily",
        "stations": int(clean["station_raw"].nunique()),
        "date_min": clean["ts"].min().isoformat() if final else None,
        "date_max": clean["ts"].max().isoformat() if final else None,
        "completeness_pct": round(float(100 * clean[avail].notna().to_numpy().mean()), 2) if final and avail else 0.0,
        "aqi_derived_rows": int(clean["aqi_derived"].sum()),
        "reconciled": bool(reconciled),
        "decisions": decisions,
    }

    # ---- 8. coordinates from the dataset (never invented) --------------------------------------
    coords: dict[str, tuple[float, float]] = {}
    if "lat" in mapping and "lon" in mapping:
        la = pd.to_numeric(raw[mapping["lat"]], errors="coerce")
        lo_ = pd.to_numeric(raw[mapping["lon"]], errors="coerce")
        ok = la.between(8, 38) & lo_.between(68, 98)
        tmp = pd.DataFrame({"s": st, "la": la.where(ok), "lo": lo_.where(ok)}).dropna()
        for sname, g in tmp.groupby("s"):
            coords[str(sname)] = (float(g["la"].median()), float(g["lo"].median()))
        report["coordinates_in_dataset"] = len(coords)
    else:
        report["coordinates_in_dataset"] = 0

    row_status = pd.DataFrame({
        "row_number": df["row_number"], "station_raw": df["station_raw"].astype(object),
        "ts_raw": df["ts_raw"].astype(object), "status": status, "reason": reason,
    })
    clean = clean.rename(columns={"station_raw": "station"})
    return CleanResult(clean=clean, row_status=row_status, report=report, coords=coords)
