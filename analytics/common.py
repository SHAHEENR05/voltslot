"""Shared constants, reference data, estimator and DB helpers for the VoltSlot analytics pipeline.

Everything here mirrors docs/spec/00_overview.md so Python and the Java EstimatorService agree.
All data produced by this pipeline is SYNTHETIC (simulation only).
"""
import math
import datetime as dt
from pathlib import Path

import pandas as pd
import pymysql

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
CLEAN = DATA / "clean"
RAW = DATA / "raw"
REPORTS = ROOT / "analytics" / "reports"
for _p in (CLEAN, RAW, REPORTS):
    _p.mkdir(parents=True, exist_ok=True)

SEED = 42
NOW = dt.datetime(2026, 10, 3, 9, 30)          # demo clock anchor (Saturday)
HIST_START = dt.datetime(2025, 10, 1)
UP_END = dt.datetime(2026, 10, 10)             # upcoming bookings start before this
WEATHER_END = dt.date(2026, 10, 10)

DB_DEFAULT = dict(host="127.0.0.1", port=3306, user="root", password="root", db="chargeiq")


def get_conn(**kw):
    cfg = dict(DB_DEFAULT)
    cfg.update({k: v for k, v in kw.items() if v is not None})
    return pymysql.connect(host=cfg["host"], port=int(cfg["port"]), user=cfg["user"], password=cfg["password"],
                           database=cfg["db"], charset="utf8mb4", autocommit=False)


def query(sql, params=None, conn=None):
    """Run a SELECT and return a DataFrame (avoids pandas' SQLAlchemy warning)."""
    own = conn is None
    conn = conn or get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params) if params else cur.execute(sql)
            cols = [c[0] for c in cur.description]
            rows = cur.fetchall()
        return pd.DataFrame(rows, columns=cols)
    finally:
        if own:
            conn.close()


# ---------------------------------------------------------------- reference data
CONNECTORS = [  # code, display, current, typical kW
    ("CCS2", "CCS Combo 2", "DC", 60.0),
    ("TYPE2", "Type 2", "AC", 7.4),
    ("CHADEMO", "CHAdeMO", "DC", 50.0),
    ("LECCS", "LECCS (Light EV)", "DC", 3.0),
    ("BHARAT_DC", "Bharat DC-001", "DC", 15.0),
]
CONN_CURRENT = {c[0]: c[2] for c in CONNECTORS}

# make, model, variant, category, battery, ac_max, dc_max, range, km_per_kwh, connectors
VEHICLE_MODELS = [
    ("Tata", "Nexon EV", "Long Range", "CAR", 40.5, 7.2, 50, 330, 7.0, ["CCS2", "TYPE2"]),
    ("Tata", "Tiago EV", "Long Range", "CAR", 24, 7.2, 25, 230, 8.0, ["CCS2", "TYPE2"]),
    ("Tata", "Punch EV", "Empowered LR", "CAR", 35, 7.2, 50, 300, 7.5, ["CCS2", "TYPE2"]),
    ("MG", "ZS EV", "Exclusive", "CAR", 50.3, 7.4, 76, 350, 6.2, ["CCS2", "TYPE2", "CHADEMO"]),
    ("MG", "Comet EV", "Plush", "CAR", 17.3, 3.3, 0, 180, 10.0, ["TYPE2"]),
    ("Mahindra", "XUV400 EL", "EL Pro", "CAR", 39.4, 7.2, 50, 320, 7.5, ["CCS2", "TYPE2"]),
    ("Hyundai", "Kona Electric", "Premium", "CAR", 39.2, 7.2, 50, 300, 7.0, ["CCS2", "TYPE2", "CHADEMO"]),
    ("BYD", "Atto 3", "Superior", "CAR", 60.5, 7.0, 88, 420, 6.0, ["CCS2", "TYPE2"]),
    ("Ather", "450X", "Gen 3", "TWO_WHEELER", 3.7, 0, 3.0, 105, 28, ["LECCS"]),
    ("Ola", "S1 Pro", "Gen 2", "TWO_WHEELER", 4.0, 0, 3.0, 120, 28, ["LECCS"]),
    ("TVS", "iQube ST", "ST", "TWO_WHEELER", 3.4, 0, 3.0, 100, 28, ["LECCS"]),
    ("Tata", "Ace EV", "Cargo", "LCV", 21.3, 3.3, 25, 150, 5.0, ["CCS2", "TYPE2"]),
    ("Mahindra", "Treo", "Auto", "THREE_WHEELER", 7.4, 0, 7.5, 120, 14, ["LECCS", "BHARAT_DC"]),
]
CO2_FACTOR = {"CAR": 0.12, "TWO_WHEELER": 0.04, "THREE_WHEELER": 0.08, "LCV": 0.22}


def band(hour):
    if hour >= 22 or hour <= 5:
        return "OFFPEAK", 0.85
    if hour <= 17:
        return "NORMAL", 1.00
    return "PEAK", 1.20


def multiplier(hour):
    return band(hour)[1]


def estimate(point_kw, current, tariff, veh, soc_s, soc_t, hour):
    """Exact estimator from 00_overview.md. `veh` is a dict with battery_kwh, ac_max_kw, dc_max_kw, km_per_kwh, category.
    Returns None when incompatible."""
    cap = veh["ac_max_kw"] if current == "AC" else veh["dc_max_kw"]
    acc = min(point_kw, cap)
    if acc <= 0:
        return None
    bat = veh["battery_kwh"]
    wall = (soc_t - soc_s) / 100 * bat / 0.92
    e80 = max(0, min(soc_t, 80) - soc_s) / 100 * bat / 0.92
    eab = max(0, soc_t - max(soc_s, 80)) / 100 * bat / 0.92
    hours = e80 / acc + eab / (0.4 * acc)
    dur = math.ceil(hours * 60) + 3
    slots = math.ceil(dur / 30)
    eff = tariff * multiplier(hour)
    km = (soc_t - soc_s) / 100 * bat * veh["km_per_kwh"]
    return dict(accepted=acc, wall=wall, hours=hours, dur=dur, slots=slots, eff=eff,
                cost=round(wall * eff, 2), km=km, co2=km * CO2_FACTOR[veh["category"]])


EPOCH = dt.datetime(2025, 1, 1)


def slot_index(t):
    return int((t - EPOCH).total_seconds() // 1800)


def slot_time(i):
    return EPOCH + dt.timedelta(minutes=30 * i)


# ---------------------------------------------------------------- Indian number formatting (org standard)
def indian(n, decimals=0):
    """Indian digit grouping: 1234567.5 -> '12,34,567'."""
    neg = n < 0
    n = abs(float(n))
    s = f"{n:.{decimals}f}"
    ip, _, fp = s.partition(".")
    if len(ip) > 3:
        head, tail = ip[:-3], ip[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        ip = ",".join(parts) + "," + tail
    out = ip + ("." + fp if fp else "")
    return ("-" if neg else "") + out


def inr(n, decimals=0):
    return "₹" + indian(n, decimals)


# ---------------------------------------------------------------- schema parsing (column order = schema)
import re


def schema_tables():
    """Parse db/01_schema.sql -> {table: [(col, sqltype, comment)]} in file order."""
    txt = (ROOT / "db" / "01_schema.sql").read_text()
    out = {}
    for m in re.finditer(r"CREATE TABLE (\w+) \((.*?)\n\) ENGINE", txt, re.S):
        cols = []
        for line in m.group(2).split("\n"):
            line = line.strip()
            if not line or re.match(r"(CONSTRAINT|INDEX|PRIMARY|UNIQUE|FOREIGN|--)", line):
                continue
            mm = re.match(r"(\w+)\s+([A-Z]+(?:\([\d,]+\))?)(.*)", line)
            if mm:
                comment = ""
                if "--" in line:
                    comment = line.split("--", 1)[1].strip()
                cols.append((mm.group(1), mm.group(2), comment))
        out[m.group(1)] = cols
    return out


TABLE_ORDER = ["operators", "fleets", "users", "wallets", "wallet_transactions", "connector_types", "vehicle_models",
               "vehicle_model_connectors", "vehicles", "stations", "amenities", "station_amenities", "charging_points", "pricing_bands",
               "bookings", "booking_slots", "charging_sessions", "payments", "reviews", "waitlist_entries", "recharge_predictions",
               "notifications", "demand_forecast", "network_forecast", "user_segments", "station_clusters", "funnel_events",
               "weather_daily", "holidays", "sentiment_keywords"]
