import io

import pandas as pd


def test_empty_state(client):
    r = client.get("/api/dashboard/overview").json()
    assert r["has_data"] is False and r["meta"]["dataset"] == "demo"
    assert client.get("/api/health").json() == {"status": "ok"}


def test_load_demo_and_repeat_is_idempotent(client):
    r = client.post("/api/data/demo")
    assert r.status_code == 201, r.text
    rep = r.json()["report"]
    assert rep["reconciled"] and rep["duplicates_removed"] > 0 and rep["invalid_timestamps"] > 0
    again = client.post("/api/data/demo").json()
    assert again["status"] == "already_imported"
    assert client.get("/api/data/imports").json()["total"] == 1


def test_overview_and_filters(client):
    o = client.get("/api/dashboard/overview").json()
    assert o["meta"]["is_demo"] and o["kpis"]["stations"]["value"] == 9
    y = client.get("/api/dashboard/overview?year=2023").json()
    assert y["comparison"]["available"] and y["kpis"]["avg_aqi"]["change_pct"] is not None
    assert y["kpis"]["records"]["value"] < o["kpis"]["records"]["value"]
    one = client.get("/api/dashboard/overview?station_id=1&month=1").json()
    assert one["kpis"]["stations"]["value"] == 1
    assert client.get("/api/dashboard/overview?month=13").status_code == 422
    assert client.get("/api/dashboard/overview?date_from=2024-02-01&date_to=2024-01-01").status_code == 422


def test_rankings_sql_window_functions(client):
    r = client.get("/api/air-quality/rankings").json()
    ranks = [i["pollution_rank"] for i in r["items"]]
    assert ranks == sorted(ranks) and ranks[0] == 1
    assert r["items"][0]["avg_aqi"] >= r["items"][-1]["avg_aqi"]
    s = client.get("/api/air-quality/rankings?search=peen").json()
    assert s["total"] == 1 and s["items"][0]["station"] == "Peenya"
    assert s["items"][0]["pollution_rank"] == next(i["pollution_rank"] for i in r["items"] if i["station"] == "Peenya")
    assert client.get("/api/air-quality/rankings?page_size=3&page=2").json()["items"].__len__() == 3


def test_trends(client):
    y = client.get("/api/air-quality/trends/yearly").json()
    assert [c["year"] for c in y["city"]] == [2021, 2022, 2023, 2024] and y["city"][0]["trend"] == "baseline"
    assert y["city"][1]["prev_year_aqi"] == y["city"][0]["avg_aqi"]
    m = client.get("/api/air-quality/trends/monthly").json()
    assert len(m["month_of_year"]) == 12 and len(m["polluted_days"]) == 10 and m["insights"]
    h = client.get("/api/air-quality/trends/hourly").json()
    assert h["hourly_available"] and sum(x["is_peak"] for x in h["hourly"]) >= 3


def test_pollutants_map_and_readings(client):
    p = client.get("/api/air-quality/pollutants?pollutant=pm10").json()
    assert p["available"] == ["pm25", "pm10", "no2", "so2"] and p["focus"] == "pm10"
    assert abs(sum(b["share_pct"] for b in p["distribution"]) - 100) < 0.5
    m = client.get("/api/air-quality/map").json()
    assert m["coordinates_complete"] and all(len(s["history"]) <= 24 and s["latest_aqi"] is not None for s in m["stations"])
    rd = client.get("/api/air-quality/readings?sort=aqi&direction=desc&page_size=5").json()
    assert len(rd["items"]) == 5 and rd["items"][0]["aqi"] >= rd["items"][4]["aqi"]
    assert client.get("/api/air-quality/readings?sort=bogus").status_code == 422


def test_data_quality_summary(client):
    d = client.get("/api/data-quality/summary").json()
    t = d["totals"]
    assert t["all_reconciled"] and t["records_processed"] > t["records_retained"]
    assert d["duplicates"]["extra_rows"] == t["duplicates_removed"] + t["conflicting_duplicates"] or d["duplicates"]["extra_rows"] > 0
    assert 90 < t["completeness_pct"] <= 100 and len(d["station_missing"]) == 9


def test_sql_explorer_every_query_runs(client):
    q = client.get("/api/sql/queries?preview=true").json()
    assert q["total"] >= 20
    bad = [i["id"] for i in q["items"] if i.get("error")]
    assert not bad, bad
    one = client.get("/api/sql/queries/rankings").json()
    assert one["row_count"] == 9 and "RANK()" in one["sql"] and one["rows"][0]["pollution_rank"] == 1
    assert client.get("/api/sql/queries/nope").status_code == 404


def test_upload_real_file_stays_separate_from_demo(client):
    csv = "Date,Time,AQI,PM2.5\n01-02-2024,08:00,120,60\n01-02-2024,09:00,130,65\n01-02-2024,09:00,130,65\n02-02-2024,09:00,abc,70\n"
    r = client.post("/api/data/upload", files={"file": ("Test Stn.csv", csv, "text/csv")}, data={"station_name": "Test Stn"})
    assert r.status_code == 201, r.text
    rep = r.json()["report"]
    assert rep["original_records"] == 4 and rep["duplicates_removed"] == 1 and rep["reconciled"]
    assert client.post("/api/data/upload", files={"file": ("Test Stn.csv", csv, "text/csv")}).json()["status"] == "already_imported"
    auto = client.get("/api/dashboard/overview").json()
    assert auto["meta"]["dataset"] == "real" and auto["kpis"]["stations"]["value"] == 1
    assert auto["available_pollutants"] == ["pm25"]
    demo = client.get("/api/dashboard/overview?dataset=demo").json()
    assert demo["kpis"]["stations"]["value"] == 9
    m = client.get("/api/air-quality/map").json()
    assert m["coordinates_complete"] is False and "incomplete" in m["note"]
    assert client.get("/api/air-quality/trends/hourly").json()["hourly_available"]


def test_upload_validation_errors(client):
    assert client.post("/api/data/upload", files={"file": ("a.txt", "x", "text/plain")}).status_code == 422
    assert client.post("/api/data/upload", files={"file": ("a.csv", "foo,bar\n1,2\n", "text/csv")}).status_code == 422
    buf = io.BytesIO()
    pd.DataFrame({"Date": ["2024-03-01"], "PM10": [80]}).to_excel(buf, index=False)
    assert client.post("/api/data/upload", files={"file": ("b.xlsx", buf.getvalue())}).status_code == 201
