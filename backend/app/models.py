"""Relational schema: stations, readings, raw records, imports and quality reports."""
from datetime import date, datetime

from sqlalchemy import (JSON, BigInteger, Boolean, Date, DateTime, Float, ForeignKey, Index, Integer,
                        SmallInteger, String, Text, UniqueConstraint, func)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base

BigPK = BigInteger().with_variant(Integer, "sqlite")  # SQLite only autoincrements INTEGER PKs


class MonitoringStation(Base):
    __tablename__ = "monitoring_stations"
    __table_args__ = (UniqueConstraint("name", "is_demo", name="uq_station_name_demo"),)

    station_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    coordinate_source: Mapped[str | None] = mapped_column(String(80))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class DataImport(Base):
    __tablename__ = "data_imports"

    import_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="processing")  # processing|completed|failed
    original_records: Mapped[int] = mapped_column(Integer, default=0)
    final_records: Mapped[int] = mapped_column(Integer, default=0)
    inserted_records: Mapped[int] = mapped_column(Integer, default=0)
    skipped_existing: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(String(500))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime)

    report: Mapped["DataQualityReport | None"] = relationship(back_populates="data_import", uselist=False,
                                                              cascade="all, delete-orphan")


class AirQualityReading(Base):
    __tablename__ = "air_quality_readings"
    __table_args__ = (
        UniqueConstraint("station_id", "ts", name="uq_reading_station_ts"),
        Index("ix_reading_scope", "is_demo", "year", "month"),
        Index("ix_reading_day", "is_demo", "day"),
    )

    reading_id: Mapped[int] = mapped_column(BigPK, primary_key=True, autoincrement=True)
    station_id: Mapped[int] = mapped_column(ForeignKey("monitoring_stations.station_id"), nullable=False)
    import_id: Mapped[int] = mapped_column(ForeignKey("data_imports.import_id"), nullable=False, index=True)
    ts: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    day: Mapped[date] = mapped_column(Date, nullable=False)
    year: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    month: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    day_of_week: Mapped[int] = mapped_column(SmallInteger, nullable=False)  # 0 = Monday
    hour: Mapped[int | None] = mapped_column(SmallInteger)  # NULL when the source has daily resolution
    aqi: Mapped[float | None] = mapped_column(Float)
    pm25: Mapped[float | None] = mapped_column(Float)
    pm10: Mapped[float | None] = mapped_column(Float)
    no2: Mapped[float | None] = mapped_column(Float)
    so2: Mapped[float | None] = mapped_column(Float)
    aqi_derived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    source_dataset: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class RawRecord(Base):
    """Untouched copy of every uploaded row, with the decision taken about it."""
    __tablename__ = "raw_records"
    # covering index: duplicate detection (GROUP BY import, station, timestamp) never touches the table rows
    __table_args__ = (Index("ix_raw_key", "import_id", "station_raw", "ts_raw", "row_number"),)

    raw_id: Mapped[int] = mapped_column(BigPK, primary_key=True, autoincrement=True)
    import_id: Mapped[int] = mapped_column(ForeignKey("data_imports.import_id", ondelete="CASCADE"), nullable=False)
    row_number: Mapped[int] = mapped_column(Integer, nullable=False)
    station_raw: Mapped[str | None] = mapped_column(String(200))
    ts_raw: Mapped[str | None] = mapped_column(String(64))
    raw_json: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    reason: Mapped[str | None] = mapped_column(String(255))


class DataQualityReport(Base):
    __tablename__ = "data_quality_reports"

    report_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    import_id: Mapped[int] = mapped_column(ForeignKey("data_imports.import_id", ondelete="CASCADE"),
                                           unique=True, nullable=False)
    report: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    data_import: Mapped[DataImport] = relationship(back_populates="report")
