"""Step 3 - load data/clean/*.csv into MySQL in FK-safe order (truncates first).

usage: python analytics/load_to_mysql.py [--host 127.0.0.1 --port 3306 --user root --password root --db chargeiq]
Only the base (generated) tables are loaded here; the ML/analytics output tables (demand_forecast, network_forecast, user_segments,
station_clusters, recharge_predictions, sentiment_keywords) are truncated and re-filled by their own scripts.
"""
import argparse
import math
import pandas as pd
from common import *

BASE = ["operators", "fleets", "users", "wallets", "wallet_transactions", "connector_types", "vehicle_models", "vehicle_model_connectors",
        "vehicles", "stations", "amenities", "station_amenities", "charging_points", "pricing_bands", "bookings", "booking_slots",
        "charging_sessions", "payments", "reviews", "waitlist_entries", "notifications", "funnel_events", "weather_daily", "holidays"]
ML = ["recharge_predictions", "demand_forecast", "network_forecast", "user_segments", "station_clusters", "sentiment_keywords"]


def convert(df, cols):
    out = []
    types = {c: t for c, t, _ in cols}
    for c in df.columns:
        t = types[c]
        s = df[c]
        if t in ("BIGINT", "INT", "TINYINT"):
            df[c] = s.map(lambda v: None if pd.isna(v) else int(v))
        elif t in ("DOUBLE",) or t.startswith("DECIMAL"):
            df[c] = s.map(lambda v: None if pd.isna(v) else float(v))
        else:
            df[c] = s.map(lambda v: None if (v is None or (isinstance(v, float) and math.isnan(v))) else v)
    return df


def load(conn, tables=BASE, src=CLEAN, batch=2000, log=print):
    schema = schema_tables()
    cur = conn.cursor()
    cur.execute("SET FOREIGN_KEY_CHECKS=0")
    for t in TABLE_ORDER[::-1]:
        cur.execute(f"TRUNCATE TABLE {t}")
    cur.execute("SET FOREIGN_KEY_CHECKS=1")
    for t in tables:
        df = pd.read_csv(Path(src) / f"{t}.csv", keep_default_na=False, na_values=[""])
        df = df[[c for c, _, _ in schema[t]]]
        df = convert(df, schema[t])
        cols = ",".join(df.columns)
        ph = ",".join(["%s"] * len(df.columns))
        rows = [tuple(None if (v is None) else v for v in r) for r in df.astype(object).where(df.notna(), None).itertuples(index=False, name=None)]
        for i in range(0, len(rows), batch):
            cur.executemany(f"INSERT INTO {t} ({cols}) VALUES ({ph})", rows[i:i + batch])
        conn.commit()
        log(f"loaded {t:26s} {len(rows):>7,}")
    cur.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", default=3306)
    ap.add_argument("--user", default="root")
    ap.add_argument("--password", default="root")
    ap.add_argument("--db", default="chargeiq")
    a = ap.parse_args()
    c = get_conn(host=a.host, port=a.port, user=a.user, password=a.password, db=a.db)
    load(c)
    c.close()
