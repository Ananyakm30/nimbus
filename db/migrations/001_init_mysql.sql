-- Bengaluru Air Quality Intelligence System - initial schema (MySQL 8.0+).
-- The API also creates these tables automatically (SQLAlchemy create_all); use this script when you prefer
-- to manage the schema yourself:   mysql -u root -p < db/migrations/001_init_mysql.sql
-- NOTE: written against the SQLAlchemy models; validated on SQLite only (no MySQL server was available).

CREATE DATABASE IF NOT EXISTS aqi_bengaluru CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE aqi_bengaluru;

CREATE TABLE IF NOT EXISTS monitoring_stations (
    station_id        INT AUTO_INCREMENT PRIMARY KEY,
    name              VARCHAR(150) NOT NULL,
    latitude          DOUBLE NULL,
    longitude         DOUBLE NULL,
    coordinate_source VARCHAR(80) NULL,            -- 'dataset' only; coordinates are never guessed
    is_demo           TINYINT(1) NOT NULL DEFAULT 0,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_station_name_demo UNIQUE (name, is_demo)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS data_imports (
    import_id        INT AUTO_INCREMENT PRIMARY KEY,
    filename         VARCHAR(255) NOT NULL,
    file_hash        CHAR(64) NOT NULL,            -- SHA-256: identical re-uploads are detected
    is_demo          TINYINT(1) NOT NULL DEFAULT 0,
    status           VARCHAR(20) NOT NULL DEFAULT 'processing',
    original_records INT NOT NULL DEFAULT 0,
    final_records    INT NOT NULL DEFAULT 0,
    inserted_records INT NOT NULL DEFAULT 0,
    skipped_existing INT NOT NULL DEFAULT 0,
    error            VARCHAR(500) NULL,
    uploaded_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    finished_at      DATETIME NULL,
    INDEX ix_data_imports_file_hash (file_hash)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS air_quality_readings (
    reading_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
    station_id      INT NOT NULL,
    import_id       INT NOT NULL,
    ts              DATETIME NOT NULL,
    day             DATE NOT NULL,
    year            SMALLINT NOT NULL,
    month           SMALLINT NOT NULL,
    day_of_week     SMALLINT NOT NULL,              -- 0 = Monday
    hour            SMALLINT NULL,                  -- NULL for daily-resolution sources
    aqi             DOUBLE NULL,
    pm25            DOUBLE NULL,
    pm10            DOUBLE NULL,
    no2             DOUBLE NULL,
    so2             DOUBLE NULL,
    aqi_derived     TINYINT(1) NOT NULL DEFAULT 0,  -- 1 = computed with CPCB sub-indices, not reported
    is_demo         TINYINT(1) NOT NULL DEFAULT 0,
    source_dataset  VARCHAR(255) NOT NULL,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_reading_station_ts UNIQUE (station_id, ts),        -- makes repeated imports idempotent
    CONSTRAINT fk_reading_station FOREIGN KEY (station_id) REFERENCES monitoring_stations (station_id),
    CONSTRAINT fk_reading_import  FOREIGN KEY (import_id)  REFERENCES data_imports (import_id),
    INDEX ix_reading_scope (is_demo, year, month),
    INDEX ix_reading_day (is_demo, day),
    INDEX ix_air_quality_readings_import_id (import_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS raw_records (          -- untouched copy of every uploaded row + the decision taken
    raw_id       BIGINT AUTO_INCREMENT PRIMARY KEY,
    import_id    INT NOT NULL,
    row_number   INT NOT NULL,
    station_raw  VARCHAR(200) NULL,
    ts_raw       VARCHAR(64) NULL,
    raw_json     LONGTEXT NOT NULL,
    status       VARCHAR(32) NOT NULL,             -- retained | aggregated | duplicate | conflicting_duplicate | invalid_timestamp | no_measurements
    reason       VARCHAR(255) NULL,
    CONSTRAINT fk_raw_import FOREIGN KEY (import_id) REFERENCES data_imports (import_id) ON DELETE CASCADE,
    INDEX ix_raw_key (import_id, station_raw, ts_raw, row_number)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS data_quality_reports (
    report_id  INT AUTO_INCREMENT PRIMARY KEY,
    import_id  INT NOT NULL UNIQUE,
    report     JSON NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_report_import FOREIGN KEY (import_id) REFERENCES data_imports (import_id) ON DELETE CASCADE
) ENGINE=InnoDB;
