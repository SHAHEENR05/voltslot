"""Re-export every table of the loaded database to data/clean/*.csv so the CSVs always equal the final database
(includes the ML output tables written by sentiment / forecast / segmentation / recharge scripts)."""
import datetime as dt
import decimal
import pandas as pd
from common import *


def main(conn=None):
    own = conn is None
    conn = conn or get_conn()
    schema = schema_tables()
    for t in TABLE_ORDER:
        df = query(f"SELECT * FROM {t}", conn=conn)
        df = df[[c for c, _, _ in schema[t]]]
        for c in df.columns:
            s = df[c]
            if s.dtype == object and s.notna().any():
                v = s.dropna().iloc[0]
                if isinstance(v, decimal.Decimal):
                    df[c] = s.map(lambda x: None if x is None else float(x))
                elif isinstance(v, dt.datetime):
                    df[c] = s.map(lambda x: None if x is None or x != x else x.strftime("%Y-%m-%d %H:%M:%S"))
                elif isinstance(v, dt.date):
                    df[c] = s.map(lambda x: None if x is None else x.isoformat())
        df.to_csv(CLEAN / f"{t}.csv", index=False)
    print(f"exported {len(TABLE_ORDER)} tables to {CLEAN}")
    if own:
        conn.close()


if __name__ == "__main__":
    main()
