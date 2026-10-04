"""Step 6 - K-Means segmentation of users and stations.

Users   : features sessions_12m, avg_energy_kwh, recency_days, night_share, weekend_share, total_spend -> StandardScaler -> K-Means,
          k chosen by silhouette over 3..7 (plot reports/segmentation_silhouette.png); cluster labels come from centroid rules.
Stations: features avg_daily_sessions, peak_crowding, revenue_12m, growth (last 90d / previous 90d) -> k=4 -> labels + recommendation text.
"""
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score
from common import *

U_COLS = ["sessions_12m", "avg_energy_kwh", "recency_days", "night_share", "weekend_share", "total_spend"]


def user_features(conn):
    s = query("""SELECT b.user_id, cs.started_at, cs.energy_kwh, cs.amount FROM charging_sessions cs JOIN bookings b ON b.id=cs.booking_id""", conn=conn)
    s["started_at"] = pd.to_datetime(s.started_at)
    s["amount"] = s.amount.astype(float)
    s["energy_kwh"] = s.energy_kwh.astype(float)
    g = s.groupby("user_id")
    f = pd.DataFrame({"sessions_12m": g.size(), "avg_energy_kwh": g.energy_kwh.mean(),
                      "recency_days": (pd.Timestamp(NOW) - g.started_at.max()).dt.days,
                      "night_share": g.started_at.apply(lambda x: ((x.dt.hour >= 22) | (x.dt.hour <= 5)).mean()),
                      "weekend_share": g.started_at.apply(lambda x: (x.dt.dayofweek >= 5).mean()), "total_spend": g.amount.sum()})
    u = query("SELECT id, role FROM users WHERE role IN ('USER','FLEET_MANAGER')", conn=conn).set_index("id")
    f = u.join(f, how="left").drop(columns="role")
    return f.fillna({"sessions_12m": 0, "avg_energy_kwh": 0, "recency_days": 365, "night_share": 0, "weekend_share": 0, "total_spend": 0})


def label_user_cluster(c):
    if c.sessions_12m >= 100:
        return "Fleet & Logistics"
    if c.avg_energy_kwh < 6 and c.sessions_12m >= 3:
        return "Light-EV Riders"
    if c.night_share >= 0.35:
        return "Night Chargers"
    if c.weekend_share >= 0.40:
        return "Weekend Explorers"
    if c.sessions_12m >= 18:
        return "Daily Commuters"
    if c.recency_days >= 150:
        return "Dormant Users"
    return "Occasional Chargers"


def segment_users(conn, verbose=True):
    f = user_features(conn)
    Z = StandardScaler().fit_transform(f[U_COLS])
    sil = {}
    for k in range(3, 8):
        sil[k] = silhouette_score(Z, KMeans(k, n_init=10, random_state=SEED).fit_predict(Z))
    k = max(sil, key=sil.get)
    km = KMeans(k, n_init=10, random_state=SEED).fit(Z)
    f["cluster_id"] = km.labels_
    cent = f.groupby("cluster_id")[U_COLS].mean()
    labels = {c: label_user_cluster(r) for c, r in cent.iterrows()}
    f["segment_label"] = f.cluster_id.map(labels)
    # silhouette plot
    plt.figure(figsize=(6, 3.6), facecolor="#1a1a19")
    ax = plt.gca(); ax.set_facecolor("#1a1a19")
    ax.plot(list(sil), list(sil.values()), color="#3987e5", lw=2, marker="o")
    ax.scatter([k], [sil[k]], s=120, color="#d95926", zorder=3, label=f"chosen k={k}")
    ax.set_xlabel("k (number of clusters)", color="#c3c2b7"); ax.set_ylabel("silhouette score", color="#c3c2b7")
    ax.set_title("K-Means on users: silhouette by k", color="white"); ax.tick_params(colors="#c3c2b7")
    for sp in ax.spines.values(): sp.set_color("#383835")
    ax.legend(facecolor="#1a1a19", labelcolor="white", edgecolor="#383835")
    plt.tight_layout(); plt.savefig(REPORTS / "segmentation_silhouette.png", dpi=130, facecolor="#1a1a19"); plt.close()
    pd.Series(sil).rename("silhouette").to_csv(REPORTS / "silhouette_scores.csv", index_label="k")
    rows = [(int(uid), int(r.cluster_id), r.segment_label, int(r.sessions_12m), round(float(r.avg_energy_kwh), 2), int(r.recency_days),
             round(float(r.night_share), 3), round(float(r.weekend_share), 3), round(float(r.total_spend), 2)) for uid, r in f.iterrows()]
    cur = conn.cursor()
    cur.execute("DELETE FROM user_segments")
    cur.executemany("INSERT INTO user_segments (user_id, cluster_id, segment_label, sessions_12m, avg_energy_kwh, recency_days, night_share, weekend_share, total_spend) "
                    "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)", rows)
    conn.commit()
    if verbose:
        print("silhouette:", {k: round(v, 3) for k, v in sil.items()}, "-> k =", k)
        out = f.groupby(["cluster_id", "segment_label"])[U_COLS].mean().round(2)
        out["users"] = f.groupby(["cluster_id", "segment_label"]).size()
        print(out.to_string())
    return f


def segment_stations(conn, verbose=True):
    st = query("""SELECT s.id, s.name, s.zone, s.tier, s.uptime_pct, s.reliability_score, COUNT(cp.id) pts FROM stations s JOIN charging_points cp ON cp.station_id=s.id
                  GROUP BY s.id, s.name, s.zone, s.tier, s.uptime_pct, s.reliability_score""", conn=conn).set_index("id")
    s = query("""SELECT b.station_id, cs.started_at, cs.amount FROM charging_sessions cs JOIN bookings b ON b.id=cs.booking_id""", conn=conn)
    s["started_at"] = pd.to_datetime(s.started_at)
    s["amount"] = s.amount.astype(float)
    g = s.groupby("station_id")
    now = pd.Timestamp(NOW)
    last90 = s[s.started_at >= now - pd.Timedelta(days=90)].groupby("station_id").size()
    prev90 = s[(s.started_at < now - pd.Timedelta(days=90)) & (s.started_at >= now - pd.Timedelta(days=180))].groupby("station_id").size()
    st["avg_daily_sessions"] = g.size().reindex(st.index).fillna(0) / 365
    st["revenue_12m"] = g.amount.sum().reindex(st.index).fillna(0)
    st["growth"] = ((last90.reindex(st.index).fillna(0) + 1) / (prev90.reindex(st.index).fillna(0) + 1))
    st["peak_crowding"] = query("SELECT station_id, MAX(crowding_index) m FROM demand_forecast GROUP BY station_id", conn=conn).set_index("station_id").m.astype(float).reindex(st.index).fillna(0)
    cols = ["avg_daily_sessions", "peak_crowding", "revenue_12m", "growth"]
    Z = StandardScaler().fit_transform(st[cols])
    km = KMeans(4, n_init=20, random_state=SEED).fit(Z)
    st["cluster_id"] = km.labels_
    cent = st.groupby("cluster_id")[cols].mean()
    zc = (cent - cent.mean()) / cent.std(ddof=0)
    score = zc.avg_daily_sessions + zc.peak_crowding + zc.revenue_12m
    order = score.sort_values(ascending=False).index.tolist()
    labels = {order[0]: "High-demand hub", order[1]: "Steady performer"}
    rest = order[2:]
    if len(rest) == 2:
        em = max(rest, key=lambda c: cent.loc[c, "growth"])
        labels[em] = "Emerging"
        labels[[c for c in rest if c != em][0]] = "Under-utilised"
    else:
        for c in rest:
            labels[c] = "Under-utilised"
    st["cluster_label"] = st.cluster_id.map(labels)

    def rec(r):
        pk = int(round(r.peak_crowding))
        if r.reliability_score < 65:
            return f"Fix reliability first - uptime {r.uptime_pct:.0f}% and low reviews (score {r.reliability_score:.0f}); schedule connector maintenance"[:200]
        if r.cluster_label == "High-demand hub":
            return f"Add 2 DC fast points - peak crowding {pk} %, {r.avg_daily_sessions:.1f} sessions/day on {int(r.pts)} points"
        if r.cluster_label == "Emerging":
            return f"Demand up {100 * (r.growth - 1):.0f}% vs previous quarter - add 1 DC point and promote with off-peak pricing"
        if r.cluster_label == "Steady performer":
            return f"Maintain service levels - peak crowding {pk} %; consider time-of-day pricing to flatten the evening peak"
        return f"Under-utilised ({r.avg_daily_sessions:.2f} sessions/day) - run a first-charge discount and add amenities or signage"
    st["recommendation"] = st.apply(rec, axis=1)
    rows = [(int(i), int(r.cluster_id), r.cluster_label, round(float(r.avg_daily_sessions), 3), round(float(r.peak_crowding), 1), round(float(r.revenue_12m), 2),
             r.recommendation) for i, r in st.iterrows()]
    cur = conn.cursor()
    cur.execute("DELETE FROM station_clusters")
    cur.executemany("INSERT INTO station_clusters (station_id, cluster_id, cluster_label, avg_daily_sessions, peak_crowding, revenue_12m, recommendation) "
                    "VALUES (%s,%s,%s,%s,%s,%s,%s)", rows)
    conn.commit()
    if verbose:
        print(st.groupby("cluster_label")[cols].mean().round(2).assign(stations=st.groupby("cluster_label").size()).to_string())
    return st


def main(conn=None, verbose=True):
    own = conn is None
    conn = conn or get_conn()
    segment_users(conn, verbose)
    segment_stations(conn, verbose)
    if own:
        conn.close()


if __name__ == "__main__":
    main()
