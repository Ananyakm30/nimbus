"""Shared helpers: config, logging, paths."""
import logging
import sqlite3
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent


def load_config(path=None):
    with open(path or ROOT / "config.yaml", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    for k, v in cfg["paths"].items():
        cfg["paths"][k] = ROOT / v
    return cfg


def get_logger(name="aqi"):
    log = logging.getLogger(name)
    if not log.handlers:
        h = logging.StreamHandler()
        h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s", "%H:%M:%S"))
        log.addHandler(h)
        log.setLevel(logging.INFO)
    return log


def connect(cfg):
    cfg["paths"]["db"].parent.mkdir(parents=True, exist_ok=True)
    return sqlite3.connect(cfg["paths"]["db"])


def run_sql_file(con, path):
    con.executescript(Path(path).read_text(encoding="utf-8"))
