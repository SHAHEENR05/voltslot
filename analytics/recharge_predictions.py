"""Step 7 - recharge_predictions for every vehicle with >= 3 COMPLETED sessions (algorithm identical to the Java service, see 00_overview.md).

intervals = day differences between consecutive session START times (last 6); next_due = ended_at(last) + median(intervals);
confidence = clamp(1 - cv, 0.2, 0.95) * min(1, n_sessions/6) with cv = population std / mean; preferred hour/station = mode of last 10 sessions.
"""
from collections import Counter
import numpy as np
import pandas as pd
from common import *


def mode_recent(vals):
    """Mode of the values; ties are broken in favour of the most recent occurrence (vals ordered oldest -> newest)."""
    c = Counter(vals)
    best = max(c.values())
    for v in reversed(vals):
        if c[v] == best:
            return v


def compute(sess):
    out = []
    for vid, g in sess.groupby("vehicle_id"):
        g = g.sort_values("started_at")
        n = len(g)
        if n < 3:
            continue
        starts = g.started_at.tolist()
        iv = [(b - a).total_seconds() / 86400 for a, b in zip(starts, starts[1:])][-6:]
        med = float(np.median(iv))
        mean = float(np.mean(iv))
        cv = float(np.std(iv)) / mean if mean > 0 else 1.0
        conf = min(max(1 - cv, 0.2), 0.95) * min(1.0, n / 6)
        last = g.iloc[-1]
        l10 = g.tail(10)
        out.append(dict(vehicle_id=int(vid), user_id=int(last.user_id), last_charge_at=last.ended_at, median_interval_days=round(med, 3),
                        avg_energy_kwh=round(float(l10.energy_kwh.mean()), 2), preferred_hour=int(mode_recent([s.hour for s in l10.started_at])),
                        preferred_station_id=int(mode_recent(l10.station_id.tolist())), sessions_used=int(n), confidence=round(conf, 3),
                        next_due_at=(last.ended_at + pd.Timedelta(days=med)).to_pydatetime().replace(microsecond=0), updated_at=NOW))
    return pd.DataFrame(out)


def main(conn=None, verbose=True):
    own = conn is None
    conn = conn or get_conn()
    sess = query("""SELECT b.vehicle_id, v.user_id, b.station_id, cs.started_at, cs.ended_at, cs.energy_kwh FROM charging_sessions cs
                    JOIN bookings b ON b.id=cs.booking_id JOIN vehicles v ON v.id=b.vehicle_id""", conn=conn)
    sess["started_at"] = pd.to_datetime(sess.started_at)
    sess["ended_at"] = pd.to_datetime(sess.ended_at)
    df = compute(sess)
    cur = conn.cursor()
    cur.execute("DELETE FROM recharge_predictions")
    cols = list(df.columns)
    cur.executemany(f"INSERT INTO recharge_predictions ({','.join(cols)}) VALUES ({','.join(['%s'] * len(cols))})",
                    [tuple(None if pd.isna(v) else (v.to_pydatetime() if isinstance(v, pd.Timestamp) else v) for v in r) for r in df.itertuples(index=False, name=None)])
    conn.commit()
    if verbose:
        print(f"recharge_predictions: {len(df)} vehicles (of {query('SELECT COUNT(*) n FROM vehicles', conn=conn).n[0]})")
    if own:
        conn.close()
    return df


if __name__ == "__main__":
    main()
