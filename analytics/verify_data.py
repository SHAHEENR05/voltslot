"""Step 8 - verification of the loaded database (asserts the invariants listed in docs/spec/10_data_spec.md).

usage: python analytics/verify_data.py        (exit code 1 when any check fails)
"""
import sys
import pandas as pd
from common import *

CHECKS = []


def chk(name, ok, detail=""):
    CHECKS.append(dict(check=name, ok=bool(ok), detail=str(detail)))


def scalar(conn, sql, params=None):
    cur = conn.cursor()
    cur.execute(sql, params) if params else cur.execute(sql)
    r = cur.fetchone()
    cur.close()
    return r[0] if r else None


def run_checks(conn):
    CHECKS.clear()
    sc = lambda sql, p=None: scalar(conn, sql, p)
    # --- every table populated
    counts = {t: sc(f"SELECT COUNT(*) FROM {t}") for t in TABLE_ORDER}
    empty = [t for t, n in counts.items() if n == 0]
    chk("every schema table populated (30 tables)", not empty, f"empty: {empty}" if empty else f"min rows {min(counts.values())}")
    # --- bookings volume
    total = counts["bookings"]
    hist = sc("SELECT COUNT(*) FROM bookings WHERE start_time <= %s", (NOW,))
    up = total - hist
    chk("total bookings in 9,300-9,900", 9300 <= total <= 9900, f"total={total} history={hist} upcoming={up}")
    chk("history bookings ~9,200-9,500", 9200 <= hist <= 9500, hist)
    chk("upcoming bookings ~250", 230 <= up <= 290, up)
    chk("sessions 7,300-7,900", 7300 <= counts["charging_sessions"] <= 7900, counts["charging_sessions"])
    chk("reviews 1,700-1,900", 1700 <= counts["reviews"] <= 1900, counts["reviews"])
    chk("funnel events 50k-70k", 50000 <= counts["funnel_events"] <= 70000, counts["funnel_events"])
    chk("demand_forecast = 32x7x24", counts["demand_forecast"] == 5376, counts["demand_forecast"])
    chk("network_forecast = 6 zones x 42 days", counts["network_forecast"] == 252, counts["network_forecast"])
    chk("users 656 / vehicles ~700", counts["users"] == 656 and 690 <= counts["vehicles"] <= 710, f"{counts['users']} / {counts['vehicles']}")
    # --- grid + window
    bad = sc("SELECT COUNT(*) FROM bookings WHERE MINUTE(start_time) NOT IN (0,30) OR SECOND(start_time)<>0")
    chk("booking start_time on 30-min grid", bad == 0, bad)
    bad = sc("SELECT COUNT(*) FROM bookings WHERE TIMESTAMPDIFF(MINUTE,start_time,end_time) <> slots*30")
    chk("end_time = start_time + slots*30 min", bad == 0, bad)
    bad = sc("SELECT COUNT(*) FROM bookings WHERE slots < 1")
    chk("slots >= 1", bad == 0, bad)
    # --- slots table
    bad = sc("""SELECT COUNT(*) FROM bookings b LEFT JOIN (SELECT booking_id, COUNT(*) n FROM booking_slots GROUP BY booking_id) s ON s.booking_id=b.id
                WHERE (b.status NOT IN ('CANCELLED','EXPIRED') AND COALESCE(s.n,0) <> b.slots) OR (b.status IN ('CANCELLED','EXPIRED') AND s.n IS NOT NULL)""")
    chk("booking_slots filled exactly for every non-CANCELLED/EXPIRED booking", bad == 0, bad)
    bad = sc("""SELECT COUNT(*) FROM booking_slots s JOIN bookings b ON b.id=s.booking_id WHERE s.charging_point_id<>b.charging_point_id
                OR s.slot_start < b.start_time OR s.slot_start >= b.end_time OR MINUTE(s.slot_start) NOT IN (0,30)""")
    chk("booking_slots consistent with booking (point, window, grid)", bad == 0, bad)
    bad = sc("""SELECT COUNT(*) FROM bookings a JOIN bookings b ON a.charging_point_id=b.charging_point_id AND a.id<b.id AND a.start_time<b.end_time AND b.start_time<a.end_time
                WHERE a.status NOT IN ('CANCELLED','EXPIRED') AND b.status NOT IN ('CANCELLED','EXPIRED')""")
    chk("no overlapping active bookings on the same charging point", bad == 0, bad)
    bad = sc("""SELECT COUNT(*) FROM bookings a JOIN bookings b ON a.vehicle_id=b.vehicle_id AND a.id<b.id AND a.start_time<b.end_time AND b.start_time<a.end_time
                WHERE a.status NOT IN ('CANCELLED','EXPIRED') AND b.status NOT IN ('CANCELLED','EXPIRED')""")
    chk("no overlapping active bookings for the same vehicle", bad == 0, bad)
    # --- sessions
    bad = sc("""SELECT COUNT(*) FROM charging_sessions cs JOIN bookings b ON b.id=cs.booking_id WHERE cs.started_at<b.start_time OR cs.ended_at>b.end_time OR cs.ended_at<=cs.started_at""")
    chk("session inside booking window", bad == 0, bad)
    bad = sc("SELECT COUNT(*) FROM charging_sessions cs JOIN bookings b ON b.id=cs.booking_id WHERE b.status<>'COMPLETED'")
    chk("sessions exist only for COMPLETED bookings", bad == 0, bad)
    bad = sc("SELECT COUNT(*) FROM bookings b LEFT JOIN charging_sessions cs ON cs.booking_id=b.id WHERE b.status='COMPLETED' AND cs.id IS NULL")
    chk("every COMPLETED booking has a session", bad == 0, bad)
    bad = sc("SELECT COUNT(*) FROM charging_sessions WHERE energy_kwh<=0 OR amount<0 OR avg_kw<=0 OR co2_avoided_kg<0 OR soc_end<=soc_start OR soc_end>100 OR soc_start<0")
    chk("no negative/zero energy, amount, kW; SoC sane", bad == 0, bad)
    bad = sc("SELECT COUNT(*) FROM charging_sessions WHERE ABS(amount - ROUND(energy_kwh*tariff,2)) > 0.011")
    chk("amount = energy x effective tariff", bad == 0, bad)
    bad = sc("""SELECT COUNT(*) FROM charging_sessions cs JOIN bookings b ON b.id=cs.booking_id JOIN charging_points p ON p.id=b.charging_point_id
                WHERE cs.avg_kw > p.power_kw + 0.01""")
    chk("avg_kw never exceeds the point's power", bad == 0, bad)
    bad = sc("""SELECT COUNT(*) FROM charging_sessions cs JOIN bookings b ON b.id=cs.booking_id JOIN vehicles v ON v.id=b.vehicle_id JOIN vehicle_models m ON m.id=v.model_id
                WHERE cs.energy_kwh > m.battery_kwh/0.92 + 0.01""")
    chk("energy per session <= battery capacity / 0.92", bad == 0, bad)
    rpk = sc("SELECT SUM(amount)/SUM(energy_kwh) FROM charging_sessions")
    chk("revenue per kWh realistic (Rs 12-24)", 12 <= float(rpk) <= 24, round(float(rpk), 2))
    # --- referential / temporal integrity
    bad = sc("SELECT COUNT(*) FROM bookings b JOIN users u ON u.id=b.user_id WHERE b.created_at < u.created_at")
    chk("no booking created before user signup", bad == 0, bad)
    bad = sc("SELECT COUNT(*) FROM bookings b JOIN vehicles v ON v.id=b.vehicle_id WHERE b.created_at < v.created_at")
    chk("no booking created before vehicle registration", bad == 0, bad)
    bad = sc("SELECT COUNT(*) FROM bookings WHERE created_at > start_time")
    chk("booking created_at <= start_time", bad == 0, bad)
    bad = sc("SELECT COUNT(*) FROM bookings b JOIN charging_points p ON p.id=b.charging_point_id WHERE p.station_id<>b.station_id")
    chk("booking.station_id matches charging point's station", bad == 0, bad)
    bad = sc("""SELECT COUNT(*) FROM bookings b JOIN vehicles v ON v.id=b.vehicle_id JOIN charging_points p ON p.id=b.charging_point_id
                LEFT JOIN vehicle_model_connectors c ON c.vehicle_model_id=v.model_id AND c.connector_type_id=p.connector_type_id WHERE c.vehicle_model_id IS NULL""")
    chk("vehicle compatible with booked point's connector", bad == 0, bad)
    bad = sc("SELECT COUNT(*) FROM bookings b JOIN users u ON u.id=b.user_id JOIN vehicles v ON v.id=b.vehicle_id WHERE v.user_id<>b.user_id")
    chk("booking.user_id owns the vehicle", bad == 0, bad)
    bad = sc("""SELECT COUNT(*) FROM bookings b JOIN charging_points p ON p.id=b.charging_point_id WHERE p.status<>'ACTIVE' AND b.start_time > '2026-09-30'""")
    chk("no bookings on non-ACTIVE points in the last days / upcoming", bad == 0, bad)
    bad = sc("""SELECT COUNT(*) FROM bookings b JOIN stations s ON s.id=b.station_id WHERE b.status NOT IN ('CANCELLED','EXPIRED') AND
                (HOUR(b.start_time) < s.open_hour OR (s.close_hour < 24 AND b.end_time > TIMESTAMP(DATE(b.start_time), MAKETIME(s.close_hour,0,0))))""")
    chk("bookings respect station opening hours", bad == 0, bad)
    for tbl, col, ref in (("recharge_predictions", "vehicle_id", "vehicles"), ("waitlist_entries", "promoted_booking_id", "bookings")):
        bad = sc(f"SELECT COUNT(*) FROM {tbl} t LEFT JOIN {ref} r ON r.id=t.{col} WHERE t.{col} IS NOT NULL AND r.id IS NULL")
        chk(f"{tbl}.{col} resolves", bad == 0, bad)
    bad = sc("SELECT COUNT(*) FROM vehicle_models m LEFT JOIN vehicle_model_connectors c ON c.vehicle_model_id=m.id WHERE c.vehicle_model_id IS NULL")
    chk("every vehicle model has >=1 connector", bad == 0, bad)
    # --- uniqueness
    chk("unique booking codes / invoice numbers", sc("SELECT COUNT(*)-COUNT(DISTINCT booking_code) FROM bookings") == 0 and sc("SELECT COUNT(*)-COUNT(DISTINCT invoice_no) FROM payments") == 0)
    # --- wallets
    chk("wallet balances >= 0", sc("SELECT COUNT(*) FROM wallets WHERE balance<0") == 0 and sc("SELECT COUNT(*) FROM wallet_transactions WHERE balance_after<0") == 0)
    bad = sc("""SELECT COUNT(*) FROM wallets w JOIN (SELECT t.wallet_id, t.balance_after FROM wallet_transactions t JOIN (SELECT wallet_id, MAX(id) mid FROM wallet_transactions GROUP BY wallet_id) m ON m.mid=t.id) l
                ON l.wallet_id=w.id WHERE ABS(l.balance_after - w.balance) > 0.001""")
    chk("wallet.balance equals last ledger balance_after", bad == 0, bad)
    bad = sc("""SELECT COUNT(*) FROM (SELECT wallet_id, SUM(CASE WHEN txn_type IN ('TOPUP','REFUND') THEN amount ELSE -amount END) s FROM wallet_transactions GROUP BY wallet_id) x
                JOIN wallets w ON w.id=x.wallet_id WHERE ABS(x.s - w.balance) > 0.001""")
    chk("ledger sums to wallet balance", bad == 0, bad)
    chk("every user has a wallet", sc("SELECT COUNT(*) FROM users u LEFT JOIN wallets w ON w.user_id=u.id WHERE w.id IS NULL") == 0)
    # --- payments
    bad = sc("SELECT COUNT(*) FROM payments WHERE refunded_amount<0 OR refunded_amount>amount OR amount<0")
    chk("payments amounts sane", bad == 0, bad)
    bad = sc("""SELECT COUNT(*) FROM payments p JOIN bookings b ON b.id=p.booking_id WHERE b.status='EXPIRED'""")
    chk("no payment for EXPIRED holds", bad == 0, bad)
    bad = sc("""SELECT COUNT(*) FROM payments p JOIN bookings b ON b.id=p.booking_id WHERE b.status='NO_SHOW' AND (ABS(p.amount-ROUND(b.est_cost*0.25,2))>0.011 OR p.status<>'PAID')""")
    chk("NO_SHOW keeps 25% of est_cost (status PAID)", bad == 0, bad)
    bad = sc("""SELECT COUNT(*) FROM payments p JOIN bookings b ON b.id=p.booking_id WHERE b.status NOT IN ('EXPIRED') AND (p.paid_at < b.created_at OR p.id IS NULL)""")
    chk("payment paid_at >= booking created_at", bad == 0, bad)
    # --- distributions
    st = {r[0]: r[1] for r in query("SELECT status, COUNT(*) n FROM bookings WHERE start_time <= %s GROUP BY status", (NOW,), conn=conn).itertuples(index=False)}
    pc = {k: 100 * v / hist for k, v in st.items()}
    chk("history outcome mix ~83/8/5/4", 79 <= pc.get("COMPLETED", 0) <= 86 and 6 <= pc.get("CANCELLED", 0) <= 10 and 3.5 <= pc.get("NO_SHOW", 0) <= 6.5 and 2.5 <= pc.get("EXPIRED", 0) <= 5.5,
        {k: round(v, 1) for k, v in pc.items()})
    avg_rating = sc("SELECT AVG(rating) FROM reviews")
    chk("review mean rating ~4.1", 3.95 <= float(avg_rating) <= 4.25, round(float(avg_rating), 2))
    bad = sc("SELECT COUNT(*) FROM reviews WHERE rating NOT BETWEEN 1 AND 5 OR comment IS NULL OR (LENGTH(comment)-LENGTH(REPLACE(comment,' ',''))+1) NOT BETWEEN 8 AND 30")
    chk("review text 8-30 words, rating 1-5", bad == 0, bad)
    lab = query("SELECT sentiment_label l, COUNT(*) n FROM reviews GROUP BY l", conn=conn).set_index("l").n
    tot = lab.sum()
    chk("sentiment split ~70/15/15 (+-8 pts)", abs(100 * lab.get("POSITIVE", 0) / tot - 70) < 8 and abs(100 * lab.get("NEGATIVE", 0) / tot - 15) < 8,
        {k: round(float(100 * v / tot), 1) for k, v in lab.items()})
    bad = sc("""SELECT COUNT(*) FROM stations WHERE ABS(reliability_score - (0.5*(avg_rating/5*100)+0.3*((sentiment_score+1)/2*100)+0.2*uptime_pct)) > 0.2 AND review_count>0""")
    chk("reliability = 0.5*rating + 0.3*sentiment + 0.2*uptime", bad == 0, bad)
    # --- reference data rules
    chk("stations 32 (8 HUB + 24 STANDARD), points ~100", sc("SELECT COUNT(*) FROM stations WHERE tier='HUB'") == 8 and sc("SELECT COUNT(*) FROM stations")==32 and 95 <= counts["charging_points"] <= 110,
        counts["charging_points"])
    bad = sc("""SELECT COUNT(*) FROM stations s WHERE NOT EXISTS (SELECT 1 FROM charging_points p JOIN connector_types c ON c.id=p.connector_type_id WHERE p.station_id=s.id AND c.code IN ('TYPE2','CCS2'))""")
    chk("every station has a TYPE2 or CCS2 point", bad == 0, bad)
    bad = sc("""SELECT COUNT(*) FROM stations s WHERE tier='HUB' AND (NOT EXISTS (SELECT 1 FROM charging_points p JOIN connector_types c ON c.id=p.connector_type_id WHERE p.station_id=s.id AND c.code='CCS2' AND p.power_kw>=60)
                OR NOT EXISTS (SELECT 1 FROM charging_points p JOIN connector_types c ON c.id=p.connector_type_id WHERE p.station_id=s.id AND c.code='LECCS'))""")
    chk("hubs have >=1 CCS2 >=60 kW and >=1 LECCS", bad == 0, bad)
    n_std_leccs = sc("""SELECT COUNT(DISTINCT s.id) FROM stations s JOIN charging_points p ON p.station_id=s.id JOIN connector_types c ON c.id=p.connector_type_id WHERE s.tier='STANDARD' AND c.code='LECCS'""")
    chk(">=6 standard stations with LECCS", n_std_leccs >= 6, n_std_leccs)
    chk("BHARAT_DC points exist (>=3)", sc("SELECT COUNT(*) FROM charging_points p JOIN connector_types c ON c.id=p.connector_type_id WHERE c.code='BHARAT_DC'") >= 3)
    chk("3-4 points MAINTENANCE/OFFLINE", 3 <= sc("SELECT COUNT(*) FROM charging_points WHERE status<>'ACTIVE'") <= 4)
    chk("stations have 2-6 amenities", sc("SELECT COUNT(*) FROM stations s WHERE (SELECT COUNT(*) FROM station_amenities a WHERE a.station_id=s.id) NOT BETWEEN 2 AND 6") == 0)
    chk("passwords are BCrypt hashes", sc("SELECT COUNT(*) FROM users WHERE password_hash NOT LIKE '$2%'") == 0)
    # --- demo accounts
    demo = query("SELECT email, role, full_name, city FROM users WHERE email LIKE '%%@voltslot.in'", conn=conn).set_index("email")
    exp = {"admin@voltslot.in": "ADMIN", "operator@voltslot.in": "OPERATOR", "fleet@voltslot.in": "FLEET_MANAGER", "demo@voltslot.in": "USER",
           "priya@voltslot.in": "USER", "rahul@voltslot.in": "USER", "sneha@voltslot.in": "USER"}
    chk("7 demo accounts with exact roles", all(demo.role.get(k) == v for k, v in exp.items()) and len(demo) == 7)
    names = {"demo@voltslot.in": "Aarav Mehta", "priya@voltslot.in": "Priya Nair", "rahul@voltslot.in": "Rahul Deshmukh", "sneha@voltslot.in": "Sneha Iyer"}
    chk("demo user names", all(demo.full_name.get(k) == v for k, v in names.items()))
    chk("demo@ city is Thane", demo.city.get("demo@voltslot.in") == "Thane")
    chk("operator@ linked to VoltGrid", sc("SELECT o.name FROM users u JOIN operators o ON o.id=u.operator_id WHERE u.email='operator@voltslot.in'") == "VoltGrid")
    chk("fleet@ linked to SwiftLogix Deliveries with 12 vehicles", sc("SELECT f.name FROM users u JOIN fleets f ON f.id=u.fleet_id WHERE u.email='fleet@voltslot.in'") == "SwiftLogix Deliveries"
        and sc("SELECT COUNT(*) FROM vehicles v JOIN fleets f ON f.id=v.fleet_id WHERE f.name='SwiftLogix Deliveries'") == 12)
    rp = query("""SELECT u.email, m.model, rp.next_due_at, rp.median_interval_days, rp.sessions_used, rp.vehicle_id FROM recharge_predictions rp JOIN users u ON u.id=rp.user_id
                  JOIN vehicles v ON v.id=rp.vehicle_id JOIN vehicle_models m ON m.id=v.model_id WHERE u.email LIKE '%%@voltslot.in'""", conn=conn)
    rp["next_due_at"] = pd.to_datetime(rp.next_due_at)
    g = lambda em, mdl: rp[(rp.email == em) & (rp.model == mdl)].iloc[0]
    d = g("demo@voltslot.in", "Nexon EV")
    chk("demo Nexon next_due on 2026-10-03 19:xx, cadence ~6 d, >=30 sessions", d.next_due_at.strftime("%Y-%m-%d %H") == "2026-10-03 19" and 5.8 <= d.median_interval_days <= 6.2 and d.sessions_used >= 30,
        f"{d.next_due_at} median={d.median_interval_days} n={d.sessions_used}")
    p = g("priya@voltslot.in", "Punch EV")
    chk("priya next_due ~2026-10-05 14:00", abs((p.next_due_at - pd.Timestamp("2026-10-05 14:00")).total_seconds()) < 3600, p.next_due_at)
    r = g("rahul@voltslot.in", "ZS EV")
    chk("rahul next_due ~2026-10-02 22:00 (overdue)", abs((r.next_due_at - pd.Timestamp("2026-10-02 22:00")).total_seconds()) < 3600 and r.next_due_at < pd.Timestamp(NOW), r.next_due_at)
    nex_vid = int(d.vehicle_id)
    chk("demo Nexon has no HOLD/CONFIRMED/CHECKED_IN future booking (reminder active)", sc("SELECT COUNT(*) FROM bookings WHERE vehicle_id=%s AND status IN ('HOLD','CONFIRMED','CHECKED_IN') AND start_time > %s", (nex_vid, NOW)) == 0)
    chk("demo has exactly 1 upcoming booking: Ather on 2026-10-05", sc("""SELECT COUNT(*) FROM bookings b JOIN users u ON u.id=b.user_id JOIN vehicles v ON v.id=b.vehicle_id JOIN vehicle_models m ON m.id=v.model_id
        WHERE u.email='demo@voltslot.in' AND b.status='CONFIRMED' AND b.start_time > %s AND m.model='450X' AND DATE(b.start_time)='2026-10-05'""", (NOW,)) == 1
        and sc("SELECT COUNT(*) FROM bookings b JOIN users u ON u.id=b.user_id WHERE u.email='demo@voltslot.in' AND b.start_time > %s", (NOW,)) == 1)
    chk("demo wallet = Rs 1,250.00", float(sc("SELECT balance FROM wallets w JOIN users u ON u.id=w.user_id WHERE u.email='demo@voltslot.in'")) == 1250.0)
    chk("demo has >=3 reviews and 1 cancelled booking", sc("SELECT COUNT(*) FROM reviews r JOIN users u ON u.id=r.user_id WHERE u.email='demo@voltslot.in'") >= 3 and
        sc("SELECT COUNT(*) FROM bookings b JOIN users u ON u.id=b.user_id WHERE u.email='demo@voltslot.in' AND b.status='CANCELLED'") == 1)
    chk("2 CHECKED_IN bookings at NOW", sc("SELECT COUNT(*) FROM bookings WHERE status='CHECKED_IN'") == 2)
    chk("sneha rides an Ola S1 Pro (LECCS)", sc("""SELECT m.model FROM vehicles v JOIN users u ON u.id=v.user_id JOIN vehicle_models m ON m.id=v.model_id WHERE u.email='sneha@voltslot.in'""") == "S1 Pro")
    chk("no RECHARGE_REMINDER notifications seeded", sc("SELECT COUNT(*) FROM notifications WHERE type='RECHARGE_REMINDER'") == 0)
    chk("waitlist: ~25 rows incl >=3 WAITING", 20 <= counts["waitlist_entries"] <= 30 and sc("SELECT COUNT(*) FROM waitlist_entries WHERE status='WAITING'") >= 3, counts["waitlist_entries"])
    chk("a few fully booked hub slots exist in the upcoming week", sc("""SELECT COUNT(*) FROM (SELECT charging_point_id FROM booking_slots WHERE slot_start BETWEEN '2026-10-03 18:00' AND '2026-10-03 20:00' AND charging_point_id IN
        (SELECT id FROM charging_points WHERE power_kw>=50) GROUP BY charging_point_id HAVING COUNT(*)>=4) x""") >= 2)
    # --- forecasts / crowding
    hub_peak = float(sc("""SELECT MAX(crowding_index) FROM demand_forecast d JOIN stations s ON s.id=d.station_id WHERE s.zone='BKC' AND d.hour_of_day BETWEEN 18 AND 20"""))
    chk("BKC evening peak crowding >= 65 (HIGH)", hub_peak >= 65, hub_peak)
    hubs_high = sc("""SELECT COUNT(*) FROM stations s WHERE tier='HUB' AND (SELECT MAX(crowding_index) FROM demand_forecast d WHERE d.station_id=s.id AND d.hour_of_day BETWEEN 17 AND 21) >= 65""")
    chk(">=6 of 8 hubs reach HIGH crowding in the evening", hubs_high >= 6, hubs_high)
    offp = float(sc("SELECT AVG(crowding_index) FROM demand_forecast WHERE hour_of_day BETWEEN 1 AND 5"))
    chk("typical off-peak crowding < 35", offp < 35, round(offp, 1))
    chk("network_forecast bounds ordered", sc("SELECT COUNT(*) FROM network_forecast WHERE lower_bound>predicted_sessions OR upper_bound<predicted_sessions OR predicted_sessions<0") == 0)
    # --- warehouse
    chk("dw_fact_booking = bookings", sc("SELECT COUNT(*) FROM dw_fact_booking") == total, sc("SELECT COUNT(*) FROM dw_fact_booking"))
    chk("dw_fact_session = charging_sessions", sc("SELECT COUNT(*) FROM dw_fact_session") == counts["charging_sessions"])
    chk("dw dims populated", sc("SELECT COUNT(*) FROM dw_dim_date") > 365 and sc("SELECT COUNT(*) FROM dw_dim_time") == 24 and sc("SELECT COUNT(*) FROM dw_dim_station") == 32)
    # --- CSV hygiene
    dups = 0
    for t in ("bookings", "users", "stations", "reviews", "charging_sessions"):
        df = pd.read_csv(CLEAN / f"{t}.csv")
        dups += int(df.duplicated().sum())
    chk("clean CSVs have no duplicate rows", dups == 0, dups)
    return CHECKS


def main():
    conn = get_conn()
    res = run_checks(conn)
    conn.close()
    w = max(len(r["check"]) for r in res)
    for r in res:
        print(f"[{'PASS' if r['ok'] else 'FAIL'}] {r['check']:<{w}}  {r['detail']}")
    fails = [r for r in res if not r["ok"]]
    print(f"\n{len(res) - len(fails)}/{len(res)} checks passed")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
