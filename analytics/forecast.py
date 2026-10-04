"""Step 5 - forecasting.

(a) network_forecast : Holt-Winters (additive damped trend + weekly seasonality) on daily sessions, 42 days from 2026-10-03,
    zone ALL + top-5 zones, 95% simulation bounds; 28-day backtest vs seasonal-naive and 7-day moving average -> reports/forecast_eval.csv
(b) demand_forecast  : station x weekday x hour expected starts from the last 26 weeks, recency weighted, +-1h smoothing, growth adjusted;
    crowding_index = percentile rank (0-100) of expected_sessions/num_points, zero-demand cells -> 0.
"""
import warnings
import numpy as np
import pandas as pd
from statsmodels.tsa.holtwinters import ExponentialSmoothing
from common import *

warnings.filterwarnings("ignore")
HORIZON = 42
METHOD_NF = "holt_winters_damped_w7"
METHOD_DF = "weighted_profile_26w"


def daily_series(conn, zone=None):
    sql = """SELECT DATE(cs.started_at) d, COUNT(*) n FROM charging_sessions cs JOIN bookings b ON b.id=cs.booking_id
             JOIN stations s ON s.id=b.station_id WHERE cs.started_at < '2026-10-03' {z} GROUP BY d"""
    df = query(sql.format(z="AND s.zone=%s" if zone else ""), (zone,) if zone else None, conn=conn)
    idx = pd.date_range("2025-10-01", "2026-10-02", freq="D")
    s = pd.Series(df.n.values, index=pd.to_datetime(df.d)).reindex(idx, fill_value=0).astype(float)
    return s


def fit_hw(y):
    return ExponentialSmoothing(y.values, trend="add", damped_trend=True, seasonal="add", seasonal_periods=7,
                                initialization_method="estimated").fit(optimized=True)


def metrics(actual, pred):
    actual, pred = np.asarray(actual, float), np.asarray(pred, float)
    mae = np.abs(actual - pred).mean()
    rmse = np.sqrt(((actual - pred) ** 2).mean())
    nz = actual > 0
    mape = (np.abs(actual[nz] - pred[nz]) / actual[nz]).mean() * 100 if nz.any() else np.nan
    return round(mae, 3), round(rmse, 3), round(mape, 2)


def network_forecast(conn, verbose=True):
    top = query("""SELECT s.zone, COUNT(*) n FROM charging_sessions cs JOIN bookings b ON b.id=cs.booking_id JOIN stations s ON s.id=b.station_id
                   GROUP BY s.zone ORDER BY n DESC LIMIT 5""", conn=conn).zone.tolist()
    zones = [None] + top
    rows, ev, series = [], [], {}
    dates = pd.date_range("2026-10-03", periods=HORIZON, freq="D")
    for z in zones:
        y = daily_series(conn, z)
        series[z or "ALL"] = y
        fit = fit_hw(y)
        fc = np.clip(fit.forecast(HORIZON), 0, None)
        # 95 % interval from in-sample residual std; variance grows with horizon like ETS: s^2 * (1 + (h-1) * alpha^2)
        sigma = float(np.std(fit.resid))
        alpha = float(fit.params["smoothing_level"])
        se = sigma * np.sqrt(1 + np.arange(HORIZON) * alpha ** 2)
        lo, hi = np.clip(fc - 1.96 * se, 0, None), fc + 1.96 * se
        for d, p, l, h in zip(dates, fc, lo, hi):
            rows.append((d.date(), z or "ALL", round(float(p), 2), round(float(l), 2), round(float(h), 2), METHOD_NF))
        # backtest last 28 days
        tr, te = y.iloc[:-28], y.iloc[-28:]
        bf = np.clip(fit_hw(tr).forecast(28), 0, None)
        naive = np.tile(tr.iloc[-7:].values, 4)
        ma = np.full(28, tr.iloc[-7:].mean())
        for name, pred in (("Holt-Winters (damped, w=7)", bf), ("Seasonal naive (t-7)", naive), ("7-day moving average", ma)):
            mae, rmse, mape = metrics(te.values, pred)
            ev.append(dict(zone=z or "ALL", model=name, MAE=mae, RMSE=rmse, MAPE_pct=mape))
    cur = conn.cursor()
    cur.execute("DELETE FROM network_forecast")
    cur.executemany("INSERT INTO network_forecast (forecast_date, zone, predicted_sessions, lower_bound, upper_bound, method) VALUES (%s,%s,%s,%s,%s,%s)", rows)
    conn.commit()
    ev = pd.DataFrame(ev)
    ev.to_csv(REPORTS / "forecast_eval.csv", index=False)
    pd.DataFrame({k: v for k, v in series.items()}).to_csv(REPORTS / "daily_sessions_by_zone.csv", index_label="date")
    if verbose:
        print(ev[ev.zone == "ALL"].to_string(index=False))
    return ev


def demand_forecast(conn, verbose=True):
    stn = query("SELECT s.id, COUNT(cp.id) pts FROM stations s JOIN charging_points cp ON cp.station_id=s.id GROUP BY s.id", conn=conn)
    start = pd.Timestamp("2026-10-03") - pd.Timedelta(weeks=26)           # 2026-04-04 (Sat)
    b = query("""SELECT station_id, start_time FROM bookings WHERE status IN ('COMPLETED','NO_SHOW') AND start_time >= %s AND start_time < '2026-10-03'""",
              (start.to_pydatetime(),), conn=conn)
    b["start_time"] = pd.to_datetime(b.start_time)
    b["week"] = ((pd.Timestamp("2026-10-03") - b.start_time.dt.normalize()).dt.days // 7).clip(upper=25)  # 0 = most recent week
    b["dow"] = b.start_time.dt.dayofweek
    b["hour"] = b.start_time.dt.hour
    wts = 0.5 ** (np.arange(26) / 8.0)                                   # recency weights, half-life 8 weeks
    wts = wts / wts.sum()
    sids = stn.id.tolist()
    cube = np.zeros((len(sids), 26, 7, 24))
    sidx = {s: i for i, s in enumerate(sids)}
    for r in b.itertuples():
        cube[sidx[r.station_id], r.week, r.dow, r.hour] += 1
    exp = np.tensordot(wts, cube, axes=([0], [1]))                          # station x dow x hour
    # growth adjustment: last 4 weeks vs recency-weighted level
    level = (cube.sum(axis=(0, 2, 3)) * wts).sum()
    recent = cube[:, :4].sum(axis=(0, 2, 3)).mean()
    g = float(np.clip(recent / level, 1.0, 1.15))
    # +-1 hour smoothing along the circular 168-hour week
    flat = exp.reshape(len(sids), 168)
    sm = 0.25 * np.roll(flat, 1, axis=1) + 0.5 * flat + 0.25 * np.roll(flat, -1, axis=1)
    sm = sm.reshape(len(sids), 7, 24) * g
    pts = stn.set_index("id").pts.reindex(sids).values
    load = sm / pts[:, None, None]
    zero = sm < 0.004
    flat_load = load.ravel()
    rank = pd.Series(flat_load).rank(pct=True, method="average").values * 100
    nz = ~zero.ravel()
    # percentile among cells that actually have demand; zero-demand cells -> 0
    rank_nz = np.zeros_like(flat_load)
    rank_nz[nz] = pd.Series(flat_load[nz]).rank(pct=True, method="average").values * 100
    crowd = rank_nz.reshape(load.shape)
    rows = []
    for si, s in enumerate(sids):
        for d in range(7):
            for h in range(24):
                rows.append((int(s), d + 1, h, round(float(sm[si, d, h]), 4), round(float(crowd[si, d, h]), 1), METHOD_DF))
    cur = conn.cursor()
    cur.execute("DELETE FROM demand_forecast")
    cur.executemany("INSERT INTO demand_forecast (station_id, day_of_week, hour_of_day, expected_sessions, crowding_index, method) VALUES (%s,%s,%s,%s,%s,%s)", rows)
    conn.commit()
    if verbose:
        c = crowd.ravel()
        print(f"growth adj {g:.3f}; cells {len(c)}; zero-demand {zero.sum()}; HIGH(>=65) {100 * (c >= 65).mean():.1f}%  MEDIUM {100 * ((c >= 35) & (c < 65)).mean():.1f}%  LOW {100 * (c < 35).mean():.1f}%")
    return crowd


def main(conn=None, verbose=True):
    own = conn is None
    conn = conn or get_conn()
    network_forecast(conn, verbose)
    demand_forecast(conn, verbose)
    if own:
        conn.close()


if __name__ == "__main__":
    main()
