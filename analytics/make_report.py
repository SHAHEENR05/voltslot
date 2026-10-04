"""Writes data/DATA_REPORT.md (verification results + distribution sanity). Tables follow the org standard:
Sr No first column, bold centred headers, numbers right-aligned, text left-aligned, INR with Indian digit grouping.
Markdown pipe tables cannot centre headers independently of the body, so HTML tables are used."""
import datetime as dt
import decimal
import html
import re
import numpy as np
import pandas as pd
from common import *
from verify_data import run_checks


def table(df, money=(), ints=(), dec=2, units=None):
    d = df.reset_index(drop=True).copy()
    for c in d.columns:
        if d[c].dtype == object and d[c].notna().any() and isinstance(d[c].dropna().iloc[0], decimal.Decimal):
            d[c] = d[c].astype(float)
    cols = list(d.columns)
    isnum = {c: pd.api.types.is_numeric_dtype(d[c]) for c in cols}
    h = ['<table>', '<thead><tr><th style="text-align:center"><b>Sr No</b></th>'
         + "".join(f'<th style="text-align:center"><b>{html.escape(str(c))}</b></th>' for c in cols) + '</tr></thead>', '<tbody>']
    for i, r in d.iterrows():
        tds = [f'<td style="text-align:right">{i + 1}</td>']
        for c in cols:
            v = r[c]
            if v is None or (isinstance(v, float) and np.isnan(v)):
                s = ""
            elif c in money:
                s = "₹" + indian(float(v), 2)
            elif isnum[c]:
                f = float(v)
                s = f"{int(f):,}" if (c in ints or pd.api.types.is_integer_dtype(d[c])) else f"{f:,.{dec}f}"
            else:
                s = html.escape(str(v))
            tds.append(f'<td style="text-align:{"right" if isnum[c] else "left"}">{s}</td>')
        h.append("<tr>" + "".join(tds) + "</tr>")
    h.append("</tbody></table>\n")
    return "\n".join(h)


def main():
    conn = get_conn()
    q = lambda s, p=None: query(s, p, conn=conn)
    L = []
    w = L.append
    w("# VoltSlot - Synthetic Data Report\n")
    w(f"Generated {dt.datetime.now():%d-%b-%Y %H:%M} | seed 42 | reference 'now' = {NOW:%d-%b-%Y %H:%M} IST | all data is synthetic.\n")
    w("Tables: bold centred headers, **Sr No** first, numbers right-aligned, rupee values in Indian grouping (₹12,34,567).\n")

    res = run_checks(conn)
    npass = sum(r["ok"] for r in res)
    w(f"## 1. Verification summary\n\n**{npass} of {len(res)} checks passed** (`python analytics/verify_data.py`).\n")
    w(table(pd.DataFrame({"Check": [r["check"] for r in res], "Result": ["PASS" if r["ok"] else "FAIL" for r in res], "Detail": [r["detail"] for r in res]})))

    counts = pd.DataFrame({"Table": TABLE_ORDER, "Rows": [int(q(f"SELECT COUNT(*) n FROM `{t}`")["n"][0]) for t in TABLE_ORDER]})
    w("## 2. Row counts per table\n")
    w(table(counts, ints=("Rows",)))

    w("## 3. Bookings by status\n")
    bs = q("SELECT status Status, COUNT(*) Bookings FROM bookings GROUP BY status ORDER BY Bookings DESC")
    bs["Share (%)"] = (bs["Bookings"] / bs["Bookings"].sum() * 100).round(2)
    bs.loc[len(bs)] = ["TOTAL", bs["Bookings"].sum(), 100.0]
    w(table(bs, ints=("Bookings",)))
    hist = int(q("SELECT COUNT(*) n FROM bookings WHERE start_time <= %s", (NOW,))["n"][0])
    w(f"History (start <= now): **{hist:,}**; upcoming: **{int(bs['Bookings'].iloc[-1]) - hist:,}**; total **{int(bs['Bookings'].iloc[-1]):,}** (target 9,300-9,900).\n")

    w("## 4. Monthly sessions, energy and revenue\n")
    m = q("""SELECT d.month_key Month, COUNT(*) Sessions, ROUND(SUM(f.energy_kwh),1) `Energy (kWh)`, ROUND(SUM(f.revenue),2) Revenue,
             ROUND(AVG(f.revenue),2) `Revenue / session` FROM dw_fact_session f JOIN dw_dim_date d ON d.date_key=f.date_key GROUP BY d.month_key ORDER BY 1""")
    tot = ["TOTAL", m["Sessions"].sum(), m["Energy (kWh)"].sum(), m["Revenue"].astype(float).sum(), float(m["Revenue"].astype(float).sum()) / m["Sessions"].sum()]
    m.loc[len(m)] = tot
    w(table(m, money=("Revenue", "Revenue / session"), ints=("Sessions",)))
    k = q("SELECT SUM(energy_kwh) kwh, SUM(revenue) rev, SUM(co2_avoided_kg) co2, COUNT(*) n FROM dw_fact_session").astype(float).iloc[0]
    w(f"Network total: **{int(k.n):,}** sessions, **{k.kwh:,.0f} kWh**, revenue **₹{indian(k.rev, 2)}**, CO2 avoided **{k.co2:,.0f} kg**.\n")

    w("## 5. Revenue and utilisation by tier\n")
    u = q("""SELECT s.tier Tier, COUNT(DISTINCT s.id) Stations, COUNT(DISTINCT p.id) `Active points`,
             (SELECT COUNT(*) FROM booking_slots bs JOIN charging_points p2 ON p2.id=bs.charging_point_id JOIN stations s2 ON s2.id=p2.station_id
               JOIN bookings b2 ON b2.id=bs.booking_id WHERE s2.tier=s.tier AND b2.start_time <= %s) `Booked slots`,
             SUM((s.close_hour - s.open_hour) * 2) * 365 `Available slots`
             FROM stations s JOIN charging_points p ON p.station_id=s.id AND p.status='ACTIVE' GROUP BY s.tier""", (NOW,))
    u["Utilisation (%)"] = (u["Booked slots"].astype(float) / u["Available slots"].astype(float) * 100).round(2)
    rv = q("SELECT s.tier Tier, SUM(f.revenue) Revenue FROM dw_fact_session f JOIN dw_dim_station s ON s.station_key=f.station_key GROUP BY 1")
    u = u.merge(rv, on="Tier", how="left")
    w(table(u, money=("Revenue",), ints=("Stations", "Active points", "Booked slots", "Available slots")))
    w("Utilisation = booked 30-minute slots in the 365-day history / (active points x operating slots x 365). Booked slots are booking_slots rows (all bookings that are not CANCELLED or EXPIRED).\n")

    w("## 6. Revenue by zone (top 10)\n")
    z = q("""SELECT s.zone Zone, COUNT(*) Sessions, ROUND(SUM(f.energy_kwh),1) `Energy (kWh)`, ROUND(SUM(f.revenue),2) Revenue
             FROM dw_fact_session f JOIN dw_dim_station s ON s.station_key=f.station_key GROUP BY 1 ORDER BY SUM(f.revenue) DESC LIMIT 10""")
    w(table(z, money=("Revenue",), ints=("Sessions",)))

    w("## 7. Peak crowding statistics (demand_forecast, 32 stations x 7 days x 24 h)\n")
    c = q("""SELECT s.tier Tier, COUNT(*) Cells, ROUND(AVG(d.crowding_index),1) `Mean index`, ROUND(MAX(d.crowding_index),1) `Max index`,
             ROUND(100*AVG(d.crowding_index>=65),2) `HIGH cells (%)`, ROUND(100*AVG(d.crowding_index>=35 AND d.crowding_index<65),2) `MEDIUM cells (%)`
             FROM demand_forecast d JOIN stations s ON s.id=d.station_id GROUP BY s.tier""")
    allc = q("SELECT COUNT(*) Cells, ROUND(AVG(crowding_index),1) a, ROUND(MAX(crowding_index),1) mx, ROUND(100*AVG(crowding_index>=65),2) h, ROUND(100*AVG(crowding_index>=35 AND crowding_index<65),2) mm FROM demand_forecast").iloc[0]
    c.loc[len(c)] = ["ALL", allc.Cells, allc.a, allc.mx, allc.h, allc.mm]
    w(table(c, ints=("Cells",)))
    w("HIGH = crowding index >= 65, MEDIUM = 35 to < 65, LOW < 35.\n")

    w("## 8. Distribution sanity\n")
    ds = q("""SELECT 'Energy per session (kWh)' Metric, MIN(energy_kwh) Min, AVG(energy_kwh) Mean, MAX(energy_kwh) Max FROM dw_fact_session
              UNION ALL SELECT 'Duration (min)', MIN(duration_min), AVG(duration_min), MAX(duration_min) FROM dw_fact_session
              UNION ALL SELECT 'Revenue per session (INR)', MIN(revenue), AVG(revenue), MAX(revenue) FROM dw_fact_session
              UNION ALL SELECT 'Effective tariff (INR/kWh)', MIN(effective_tariff), AVG(effective_tariff), MAX(effective_tariff) FROM dw_fact_session
              UNION ALL SELECT 'Lead time (h)', MIN(lead_time_hours), AVG(lead_time_hours), MAX(lead_time_hours) FROM dw_fact_session
              UNION ALL SELECT 'Review rating (1-5)', MIN(rating), AVG(rating), MAX(rating) FROM reviews""").astype({"Min": float, "Mean": float, "Max": float})
    w(table(ds))
    sn = q("SELECT sentiment_label Sentiment, COUNT(*) Reviews, ROUND(AVG(rating),2) `Avg rating` FROM reviews GROUP BY 1 ORDER BY Reviews DESC")
    sn["Share (%)"] = (sn["Reviews"] / sn["Reviews"].sum() * 100).round(1)
    w(table(sn, ints=("Reviews",)))

    w("## 9. Missing values and duplicates (clean tables)\n")
    rows = []
    for t, col in [("users", "email"), ("users", "phone"), ("vehicles", "plate"), ("bookings", "booking_code"), ("stations", "name")]:
        try:
            n = int(q(f"SELECT COUNT(*) n FROM {t}")["n"][0])
            nul = int(q(f"SELECT COUNT(*) n FROM {t} WHERE `{col}` IS NULL OR TRIM(`{col}`)=''")["n"][0])
            dup = int(q(f"SELECT COUNT(*) - COUNT(DISTINCT `{col}`) n FROM {t} WHERE `{col}` IS NOT NULL")["n"][0])
            rows.append([t, col, n, nul, dup])
        except Exception:
            pass
    w(table(pd.DataFrame(rows, columns=["Table", "Column", "Rows", "Missing", "Duplicates"]), ints=("Rows", "Missing", "Duplicates")))

    w("## 10. Cleaning of the raw extracts\n")
    cl = pd.read_csv(ROOT / "data" / "cleaning_log.csv")
    w(table(cl.groupby(["table", "issue_type"], as_index=False)["rows_fixed"].sum().rename(columns={"table": "Table", "issue_type": "Issue", "rows_fixed": "Rows fixed"}), ints=("Rows fixed",)))
    ver = pd.read_csv(ROOT / "data" / "cleaning_verification.csv")
    w("Verification of cleaned output against the clean source (worst columns = lowest per-column match %):\n")
    ver = ver.copy()
    ver["worst_columns"] = ver["worst_columns"].map(lambda s: ", ".join(f"{k} {float(v):.2f}%" for k, v in re.findall(r"'(\w+)': (?:np\.float64\()?([\d.]+)", str(s))))
    ver.columns = ["Table", "Rows (clean)", "Rows (cleaned)", "Rows matched (%)", "Cells", "Cells matching", "Cell match (%)", "Worst columns"]
    w(table(ver, ints=("Rows (clean)", "Rows (cleaned)", "Cells", "Cells matching")))

    w("## 11. Demo accounts\n")
    d = q("""SELECT u.email Email, u.role Role, w.balance `Wallet balance`,
             (SELECT COUNT(*) FROM bookings b WHERE b.user_id=u.id) Bookings,
             (SELECT MIN(r.next_due_at) FROM recharge_predictions r WHERE r.user_id=u.id) `Next recharge due`
             FROM users u LEFT JOIN wallets w ON w.user_id=u.id WHERE u.email LIKE '%@voltslot.in' ORDER BY u.id""")
    d["Next recharge due"] = d["Next recharge due"].astype(str).replace({"NaT": "", "None": ""})
    w(table(d, money=("Wallet balance",), ints=("Bookings",)))

    w("## 12. Charts\n\nTwenty dark-theme charts are in `analytics/reports/` (01-20 PNG plus `segmentation_silhouette.png`).\n")
    (ROOT / "data" / "DATA_REPORT.md").write_text("\n".join(L), encoding="utf-8")
    print("wrote data/DATA_REPORT.md", f"({npass}/{len(res)} checks)")


if __name__ == "__main__":
    main()
