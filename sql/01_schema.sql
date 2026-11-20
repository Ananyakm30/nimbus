DROP TABLE IF EXISTS fact_hourly;
DROP TABLE IF EXISTS stg_rejected;
DROP TABLE IF EXISTS dim_station;
DROP TABLE IF EXISTS dim_date;
DROP TABLE IF EXISTS run_log;

CREATE TABLE dim_station (
    station_id INTEGER PRIMARY KEY,
    station    TEXT UNIQUE NOT NULL,
    first_ts   TEXT, last_ts TEXT
);

CREATE TABLE fact_hourly (
    station_id INTEGER NOT NULL,
    ts         TEXT NOT NULL,          -- 'YYYY-MM-DD HH:00:00' IST
    day        TEXT NOT NULL,
    hour       INTEGER NOT NULL,
    pollutant  TEXT NOT NULL,
    value      REAL NOT NULL,          -- only valid, non-null readings are stored
    PRIMARY KEY (station_id, ts, pollutant)
);
CREATE INDEX ix_fact_day ON fact_hourly(station_id, day, pollutant);

CREATE TABLE stg_rejected (
    station TEXT, ts TEXT, pollutant TEXT, raw_value TEXT,
    reason TEXT, source_file TEXT
);

CREATE TABLE dim_date (
    day TEXT PRIMARY KEY,
    year INTEGER, month INTEGER, dow INTEGER,    -- dow: 0=Mon
    is_weekend INTEGER,
    season TEXT,                                 -- Winter/Summer/Monsoon/Post-monsoon
    is_lockdown INTEGER,
    diwali_offset INTEGER                        -- days from Diwali, NULL if far
);

CREATE TABLE run_log (
    run_ts TEXT, stage TEXT, detail TEXT
);
