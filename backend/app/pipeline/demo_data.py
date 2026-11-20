"""Generate the clearly-labelled DEMO sample file (synthetic - NOT real measurements).

The file is deliberately messy (duplicates, gaps, sentinel codes, bad timestamps, mixed date formats) so the
cleaning pipeline has something real to do. Station names are real Bengaluru monitoring locations; the
coordinates are approximate and only used for demo map placement.
"""
from pathlib import Path

import numpy as np
import pandas as pd

STATIONS = {  # name: (lat, lon, relative pollution level)
    "Silk Board": (12.9177, 77.6238, 1.28),
    "BTM Layout": (12.9166, 77.6101, 1.05),
    "Peenya": (13.0285, 77.5197, 1.35),
    "Hebbal": (13.0358, 77.5970, 1.10),
    "Jayanagar 5th Block": (12.9250, 77.5938, 0.82),
    "City Railway Station": (12.9780, 77.5700, 1.22),
    "Bapuji Nagar": (12.9570, 77.5410, 0.95),
    "Whitefield": (12.9698, 77.7500, 0.78),
    "Kasturi Nagar": (13.0010, 77.6600, 0.88),
}
SEASON = {1: 1.25, 2: 1.15, 3: 1.0, 4: 0.9, 5: 0.8, 6: 0.55, 7: 0.45, 8: 0.5, 9: 0.6, 10: 0.85, 11: 1.15, 12: 1.3}
HOUR_SHAPE = {0: .75, 3: .65, 6: 1.0, 9: 1.35, 12: .9, 15: .85, 18: 1.2, 21: 1.1}


def generate(path: Path, seed: int = 7) -> Path:
    from .cleaning import cpcb_aqi

    rng = np.random.default_rng(seed)
    days = pd.date_range("2021-01-01", "2024-12-31", freq="D")
    hours = list(HOUR_SHAPE)
    frames = []
    for si, (name, (lat, lon, lvl)) in enumerate(STATIONS.items()):
        idx = pd.MultiIndex.from_product([days, hours], names=["d", "h"]).to_frame(index=False)
        ts = idx["d"] + pd.to_timedelta(idx["h"], unit="h")
        yr = (idx["d"].dt.year - 2021).to_numpy()
        base = 38 * lvl * idx["d"].dt.month.map(SEASON).to_numpy() * idx["h"].map(HOUR_SHAPE).to_numpy()
        base = base * (1 - 0.035 * yr) * np.where(idx["d"].dt.dayofweek >= 5, 0.92, 1.0)
        base = base * rng.lognormal(0, 0.22, len(idx))
        pm25 = base
        pm10 = base * rng.uniform(1.7, 2.3, len(idx))
        no2 = 22 * lvl * idx["h"].map(HOUR_SHAPE).to_numpy() * rng.lognormal(0, 0.3, len(idx)) * (1 + 0.15 * (lvl > 1.2))
        so2 = 9 * lvl * rng.lognormal(0, 0.35, len(idx))
        f = pd.DataFrame({"station": name, "latitude": lat, "longitude": lon, "ts": ts,
                          "pm25": pm25, "pm10": pm10, "no2": no2, "so2": so2})
        f["aqi"] = cpcb_aqi(f.rename(columns={}))
        # a sensor outage: Whitefield loses PM2.5 for most of mid-2022
        if name == "Whitefield":
            f.loc[(f.ts >= "2022-05-01") & (f.ts < "2022-09-15"), ["pm25", "aqi"]] = np.nan
        frames.append(f)
    df = pd.concat(frames, ignore_index=True)

    for col, rate in (("aqi", .015), ("pm25", .02), ("pm10", .03), ("no2", .025), ("so2", .05)):
        df.loc[rng.random(len(df)) < rate, col] = np.nan
    for col in ("pm10", "no2"):  # sentinel codes
        df.loc[rng.random(len(df)) < .002, col] = -999
    df.loc[rng.random(len(df)) < .0007, "pm25"] = 4500  # sensor spike beyond physical limits

    out = df.copy()
    out["Date"] = out["ts"].dt.strftime("%d-%m-%Y")  # Indian dd-mm-yyyy
    out["Time"] = out["ts"].dt.strftime("%H:%M")
    out = out.drop(columns="ts").rename(columns={"station": "Station", "latitude": "Latitude", "longitude": "Longitude",
                                                 "pm25": "PM2.5 (ug/m3)", "pm10": "PM10 (ug/m3)",
                                                 "no2": "NO2 (ug/m3)", "so2": "SO2 (ug/m3)", "aqi": "AQI"})
    out = out[["Station", "Latitude", "Longitude", "Date", "Time", "AQI", "PM2.5 (ug/m3)", "PM10 (ug/m3)",
               "NO2 (ug/m3)", "SO2 (ug/m3)"]].round(1)
    dups = out.sample(frac=.012, random_state=1)
    out = pd.concat([out, dups], ignore_index=True)
    bad = rng.choice(len(out), size=40, replace=False)
    out.loc[bad[:20], "Date"] = "31-02-2023"
    out.loc[bad[20:], "Date"] = "not available"
    out = out.sample(frac=1, random_state=3).reset_index(drop=True)
    path.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(path, index=False)
    return path
