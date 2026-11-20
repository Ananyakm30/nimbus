import pandas as pd
import pytest

from app.pipeline.cleaning import PipelineError, clean_dataframe


def frame(rows, cols):
    return pd.DataFrame(rows, columns=cols, dtype=str)


COLS = ["Station", "Date", "Time", "PM2.5", "PM10", "NO2"]


def test_accounting_and_rules():
    rows = [
        ["Hebbal", "05-01-2023", "10:00", "40", "80", "20"],
        ["Hebbal", "05-01-2023", "10:00", "40", "80", "20"],      # exact duplicate
        ["Hebbal", "05-01-2023", "10:00", "55", "80", "20"],      # conflicting duplicate
        ["Hebbal", "05-01-2023", "11:00", "-999", "90", ""],      # sentinel + blank -> NULL, never zero
        ["Hebbal", "32-13-2023", "12:00", "10", "20", "5"],       # invalid timestamp
        ["Hebbal", "05-01-2023", "13:00", "", "", ""],            # no measurements
        ["Hebbal", "05-01-2023", "14:10", "30", "60", "10"],      # sub-hourly pair -> hourly mean
        ["Hebbal", "05-01-2023", "14:40", "50", "100", "30"],
    ]
    r = clean_dataframe(frame(rows, COLS), "x.csv")
    rep = r.report
    assert rep["original_records"] == 8 and rep["reconciled"]
    assert rep["duplicates_removed"] == 1 and rep["conflicting_duplicates"] == 1
    assert rep["invalid_timestamps"] == 1 and rep["no_measurement_rows"] == 1 and rep["aggregated_subhourly"] == 1
    assert rep["final_cleaned_records"] == 3
    c = r.clean.sort_values("ts").reset_index(drop=True)
    assert pd.isna(c.loc[1, "pm25"]) and c.loc[1, "pm10"] == 90          # sentinel nulled, not zeroed
    assert c.loc[2, "pm25"] == 40 and c.loc[2, "hour"] == 14             # mean of 30 and 50
    assert (r.row_status.status != "").all() and len(r.row_status) == 8   # every row has a documented outcome


def test_day_first_and_iso_dates():
    r = clean_dataframe(frame([["A", "03-04-2022", "09:00", "10", "20", "5"], ["A", "2022-04-04", "09:00", "10", "20", "5"]], COLS), "a.csv")
    ts = sorted(r.clean["ts"].dt.strftime("%Y-%m-%d").tolist())
    assert ts == ["2022-04-03", "2022-04-04"]


def test_rejects_unusable_files():
    with pytest.raises(PipelineError):
        clean_dataframe(frame([["a", "b"]], ["foo", "bar"]), "x.csv")
    with pytest.raises(PipelineError):
        clean_dataframe(frame([["2023-01-01", "x"]], ["Date", "bar"]), "x.csv")


def test_missing_pollutant_columns_are_tolerated():
    r = clean_dataframe(frame([["2023-01-01", "55"], ["2023-01-02", "60"]], ["Date", "AQI"]), "Solo Station.csv")
    assert r.report["resolution"] == "daily" and r.report["available_fields"] == ["aqi"]
    assert r.clean["station"].iloc[0] == "Solo Station"
