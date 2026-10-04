"""Step 1 - generate the SYNTHETIC VoltSlot dataset (seed 42) -> data/clean/*.csv and dirty data/raw/*.csv.

All records are simulated; no real individuals, vehicles or stations are represented.
"""
import datetime as dt
import math
import random
import sys
import numpy as np
import pandas as pd
import bcrypt

from common import *
from gen_ref import *
from gen_people import make_people, DEMO
from gen_sim import Sim
from gen_demo import build_scripted
from gen_reviews import make_review
from gen_raw import make_raw

H = dt.timedelta
ACT = 1.49            # activity scale (calibrated: history ~9.3k + upcoming ~250 = 9,300-9,900 total)
HUB_BOOST = 5.0
CODE_CH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def fixed_hash(pw, seed_str):
    """Deterministic bcrypt hash (fixed salt, demo data only) so regenerated CSVs are byte-stable."""
    r = random.Random(seed_str)
    chars = "./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    salt = "".join(r.choice(chars) for _ in range(21)) + r.choice(".Oeu")
    return bcrypt.hashpw(pw.encode(), ("$2b$10$" + salt).encode()).decode()


def main(out_dir=CLEAN, verbose=True):
    log = print if verbose else (lambda *a, **k: None)
    rng = np.random.default_rng(SEED)
    hcache = {}

    def hash_for(pw):
        if pw not in hcache:
            hcache[pw] = fixed_hash(pw, "chargeiq-" + pw)
        return hcache[pw]

    # ------------------------------------------------------------ reference
    ops, stn, pts, amen, sa = make_stations(rng)
    weather = make_weather(rng)
    hol = make_holidays()
    users, fleets, veh, models = make_people(rng, ops, hash_for)
    log("users", len(users), "vehicles", len(veh), "stations", len(stn), "points", len(pts))

    # ------------------------------------------------------------ simulation
    sim = Sim(rng, stn, pts, users, veh, models, weather, hol, act=ACT, hub_boost=HUB_BOOST)
    zone_ll = {z: (v[0], v[1]) for z, v in ZONES.items()}
    sim.setup_geo(zone_ll, zone_ll)
    uid_email = {int(r.id): r.email for r in users.itertuples()}
    slot = {}
    for v in sim.vehicles:
        em = uid_email[v["user_id"]]
        sl = v["_extra"].get("slot")
        if em == "demo@voltslot.in":
            slot["demo_main" if sl == "MAIN" else "demo_second"] = v
        elif em == "priya@voltslot.in":
            slot["priya"] = v
        elif em == "rahul@voltslot.in":
            slot["rahul"] = v
        elif em == "sneha@voltslot.in":
            v["_extra"]["cad"] = 5.0
    scripted = build_scripted(sim, slot, stn)
    sim.run(scripted)
    n_nat_up = sum(1 for b in sim.bookings if b["start"] > NOW)
    sim.checked_in(2)
    sat = 0
    for zone, day, h0, h1 in [("Thane West", dt.date(2026, 10, 3), 17.5, 21), ("Andheri East", dt.date(2026, 10, 3), 18, 20.5),
                              ("Thane West", dt.date(2026, 10, 4), 18, 21), ("Vashi", dt.date(2026, 10, 4), 18, 20.5),
                              ("BKC", dt.date(2026, 10, 5), 18, 21), ("Powai", dt.date(2026, 10, 5), 18, 20.5),
                              ("BKC", dt.date(2026, 10, 6), 18, 20.5)]:
        sat += sim.saturate(zone, day, h0, h1)
    n_up = sum(1 for b in sim.bookings if b["start"] > NOW and b["status"] == "CONFIRMED")
    sim.extras(max(0, 250 - n_up))
    bk = sim.bookings
    log("bookings", len(bk), "natural upcoming", n_nat_up, "saturate", sat, "abandoned(conflict)", len(sim.abandoned))

    # ------------------------------------------------------------ booking ids / codes / waitlist-sourced
    bk.sort(key=lambda b: (b["created_at"], b["start"], b["vehicle_id"]))
    used = set()
    for i, b in enumerate(bk):
        b["id"] = i + 1
        while True:
            c = "VSL-" + "".join(rng.choice(list(CODE_CH), size=6))
            if c not in used:
                used.add(c)
                b["booking_code"] = c
                break
    tier = dict(zip(stn.id, stn.tier))
    wl_pool = [b for b in bk if b["status"] == "COMPLETED" and b["source"] == "WEB" and 1 <= b["lead_h"] <= 8 and tier[b["station_id"]] == "HUB"
               and not b["scripted"]]
    wl_pick = [wl_pool[i] for i in rng.choice(len(wl_pool), size=12, replace=False)]
    for b in wl_pick:
        b["source"] = "WAITLIST"
    veh_by_id = {v["id"]: v for v in sim.vehicles}
    user_by_id = {int(r.id): r for r in users.itertuples()}
    pt_by_id = {int(r.id): r for r in pts.itertuples()}

    # ------------------------------------------------------------ sessions
    sessions = []
    for b in bk:
        if b["status"] != "COMPLETED":
            continue
        v = veh_by_id[b["vehicle_id"]]
        m = v["m"]
        p = b["point"]
        soc_end = b["soc_target"]
        if rng.random() < 0.10 and not (b["scripted"] and (b.get("tag") or "").startswith("DEMO")):
            soc_end = max(b["soc_start"] + 8, b["soc_target"] - int(rng.integers(8, 31)))
        e2 = estimate(p["kw"], p["cur"], p["tariff"], m, b["soc_start"], soc_end, b["start"].hour)
        slack = b["slots"] * 30 - e2["dur"]
        off = int(rng.integers(0, min(720, max(slack, 0) * 60) + 1))
        started = b["start"] + H(seconds=off)
        ended = started + H(minutes=e2["dur"], seconds=int(rng.integers(0, 40)) if slack * 60 - off > 40 else 0)
        tariff = round(p["tariff"] * multiplier(b["start"].hour), 2)
        energy = round(e2["wall"], 2)
        sessions.append(dict(booking_id=b["id"], started_at=started, ended_at=ended, energy_kwh=energy, soc_start=b["soc_start"], soc_end=soc_end,
                             avg_kw=round(min(energy / e2["hours"], e2["accepted"]), 2) if e2["hours"] > 0 else 0.0, tariff=tariff, amount=round(energy * tariff, 2),
                             co2_avoided_kg=round(e2["co2"], 2)))
        b["sess"] = sessions[-1]
        # check-in time
        if b["source"] == "WALK_IN":
            b["checked_in_at"] = max(b["created_at"], started - H(seconds=int(rng.integers(30, 180))))
        else:
            b["checked_in_at"] = max(b["created_at"] + H(minutes=1), b["start"] - H(minutes=15), started - H(seconds=int(rng.integers(60, 420))))
    for b in bk:
        if b["status"] == "CHECKED_IN":
            b["checked_in_at"] = b["start"] + H(minutes=int(rng.integers(0, 6)), seconds=int(rng.integers(0, 60)))
        if b["status"] == "EXPIRED":
            b["hold_expires_at"] = b["created_at"] + H(minutes=5)
    sess_df = pd.DataFrame(sessions)

    # ------------------------------------------------------------ users: devices, payment preference, no-shows
    u_ids = list(users.id)
    pref = {}
    for uid in u_ids:
        pref[uid] = str(rng.choice(["WALLET", "UPI", "CARD"], p=[.45, .40, .15]))
    demo_id = int(users.loc[users.email == "demo@voltslot.in", "id"].iloc[0])
    pref[demo_id] = "WALLET"
    device_of = {uid: str(rng.choice(["MOBILE", "DESKTOP", "TABLET"], p=[.68, .27, .05])) for uid in u_ids}

    # ------------------------------------------------------------ payments + wallet events
    payments, wev = [], {uid: [] for uid in u_ids}
    for b in bk:
        st = b["status"]
        if st == "EXPIRED":
            continue
        uid = b["user_id"]
        method = pref[uid] if rng.random() < .75 else str(rng.choice(["WALLET", "UPI", "CARD"], p=[.45, .40, .15]))
        if b["scripted"] and (b.get("tag") or "").startswith("DEMO") and uid == demo_id:
            method = "WALLET" if rng.random() < .8 else "UPI"
        paid_at = b["start"] if b["source"] == "WALK_IN" else b["created_at"] + H(seconds=int(rng.integers(40, 240)))
        if b["source"] == "WALK_IN" and "sess" in b:
            paid_at = b["sess"]["ended_at"]
        amount, refunded, pstat = b["est_cost"], 0.0, "PAID"
        if st == "COMPLETED":
            amount = b["sess"]["amount"]
        elif st == "CANCELLED":
            late = (b["start"] - b["cancelled_at"]) < H(minutes=60)
            refunded = round(amount * .5, 2) if late else amount
            pstat = "PART_REFUND" if late else "REFUNDED"
        elif st == "NO_SHOW":
            amount = round(b["est_cost"] * .25, 2)
        payments.append(dict(booking_id=b["id"], amount=amount, method=method, status=pstat, refunded_amount=refunded, paid_at=paid_at))
        b["pay_method"] = method
        if method == "WALLET":
            code = b["booking_code"]
            if b["source"] == "WALK_IN" and st == "COMPLETED":
                wev[uid].append((paid_at, "DEBIT", amount, code))
            elif st == "NO_SHOW":
                wev[uid].append((paid_at, "DEBIT", b["est_cost"], code))
                wev[uid].append((b["start"] + H(minutes=16), "REFUND", round(b["est_cost"] - amount, 2), code))
            else:
                wev[uid].append((paid_at, "DEBIT", b["est_cost"], code))
                if st == "COMPLETED":
                    diff = round(b["est_cost"] - amount, 2)
                    if diff > 0.004:
                        wev[uid].append((b["sess"]["ended_at"] + H(minutes=1), "REFUND", diff, code))
                    elif diff < -0.004:
                        wev[uid].append((b["sess"]["ended_at"] + H(minutes=1), "DEBIT", -diff, code))
                elif st == "CANCELLED" and refunded > 0:
                    wev[uid].append((b["cancelled_at"] + H(seconds=30), "REFUND", refunded, code))
    # repeat no-show penalty
    ns_count = {}
    for b in sorted(bk, key=lambda x: x["start"]):
        if b["status"] == "NO_SHOW":
            ns_count[b["user_id"]] = ns_count.get(b["user_id"], 0) + 1
            if ns_count[b["user_id"]] >= 3:
                wev[b["user_id"]].append((b["start"] + H(minutes=17), "PENALTY", 50.0, b["booking_code"]))
    pay_df = pd.DataFrame(payments)
    pay_df = pay_df.sort_values("paid_at").reset_index(drop=True)
    pay_df["invoice_no"] = [f"INV-2526-{i + 1:06d}" for i in range(len(pay_df))]

    # ------------------------------------------------------------ wallets
    wallets, wtx = [], []
    for u in users.itertuples():
        ev = sorted(wev[u.id], key=lambda e: e[0])
        bal = 0
        txs = []
        prev = u.created_at
        if u.email != "demo@voltslot.in" and rng.random() < .45:
            amt = int(rng.choice([200, 500, 1000, 1500, 2000]))
            t = u.created_at + H(minutes=int(rng.integers(5, 3000)))
            txs.append((t, "TOPUP", amt, f"UPI-TOPUP-{int(rng.integers(100000, 999999))}"))
            bal += amt * 100
            prev = t
        for (t, typ, amt, ref) in ev:
            cents = int(round(amt * 100))
            if typ in ("DEBIT", "PENALTY"):
                if bal < cents:
                    need = cents - bal
                    top = int(math.ceil(need / 50000) * 500) + (500 if rng.random() < .3 else 0)
                    tt = t - H(seconds=int(rng.integers(60, 2 * 86400)))
                    tt = max(tt, prev + H(seconds=1), u.created_at + H(minutes=1))
                    if tt >= t:
                        t = tt + H(seconds=2)
                    txs.append((tt, "TOPUP", top, f"UPI-TOPUP-{int(rng.integers(100000, 999999))}"))
                    bal += top * 100
                    prev = tt
                if t <= prev:
                    t = prev + H(seconds=1)
                bal -= cents
            else:
                if t <= prev:
                    t = prev + H(seconds=1)
                bal += cents
            txs.append((t, typ, amt, ref))
            prev = t
        if u.email == "demo@voltslot.in":
            delta = 125000 - bal
            assert delta >= 0, f"demo wallet above target {bal}"
            if delta > 0:
                t = max(prev + H(minutes=7), dt.datetime(2026, 10, 2, 20, 41))
                assert t < NOW
                txs.append((t, "TOPUP", delta / 100, "UPI-TOPUP-482913"))
                bal += delta
                prev = t
        # recompute running balances in order
        run = 0
        rows = []
        for (t, typ, amt, ref) in sorted(txs, key=lambda e: e[0]):
            c = int(round(amt * 100))
            run += c if typ in ("TOPUP", "REFUND") else -c
            assert run >= 0, (u.email, t, typ, amt, run)
            rows.append(dict(txn_type=typ, amount=round(amt, 2), balance_after=run / 100, reference=ref, created_at=t, _uid=u.id))
        wallets.append(dict(user_id=u.id, balance=run / 100, updated_at=rows[-1]["created_at"] if rows else u.created_at))
        wtx.extend(rows)
    wal_df = pd.DataFrame(wallets)
    wal_df.insert(0, "id", range(1, len(wal_df) + 1))
    wid = dict(zip(wal_df.user_id, wal_df.id))
    wtx_df = pd.DataFrame(wtx).sort_values(["created_at"], kind="stable").reset_index(drop=True)
    wtx_df["wallet_id"] = wtx_df["_uid"].map(wid)
    wtx_df.insert(0, "id", range(1, len(wtx_df) + 1))
    wtx_df = wtx_df.drop(columns=["_uid"])

    # ------------------------------------------------------------ reviews
    poor_ids = set(stn.loc[stn.x_poor, "id"])
    st_q = {int(r.id): (float(rng.normal(2.75, .15)) if r.x_poor else float(rng.normal(4.28, .16))) for r in stn.itertuples()}
    stn_by_id = {int(r.id): r for r in stn.itertuples()}
    reviews = []
    demo_sessions = [b for b in bk if b["status"] == "COMPLETED" and b["user_id"] == demo_id]
    force = {b["id"] for b in rng.choice(demo_sessions, size=5, replace=False)} if demo_sessions else set()
    for b in bk:
        if b["status"] != "COMPLETED":
            continue
        s = b["station_id"]
        pr = .225 * (1.35 if s in poor_ids else 1.0)
        if b["id"] not in force and rng.random() > pr:
            continue
        mu = st_q[s] - (.3 if b["shifted"] else 0)
        rating = int(np.clip(round(rng.normal(mu, .85)), 1, 5))
        if b["id"] in force:
            rating = int(rng.choice([4, 5, 5]))
        txt = make_review(rng, rating, s in poor_ids)
        rt = b["sess"]["ended_at"] + H(minutes=int(rng.integers(10, 3 * 24 * 60)))
        rt = min(rt, NOW - H(minutes=30)) if rt > NOW else rt
        reviews.append(dict(station_id=s, user_id=b["user_id"], booking_id=b["id"], rating=rating, comment=txt, sentiment_score=0.0,
                            sentiment_label="NEUTRAL", created_at=rt))
    rev_df = pd.DataFrame(reviews).sort_values("created_at", kind="stable").reset_index(drop=True)
    rev_df.insert(0, "id", range(1, len(rev_df) + 1))
    agg = rev_df.groupby("station_id").rating.agg(["mean", "count"])
    stn["avg_rating"] = stn.id.map(agg["mean"]).round(2).fillna(0.0)
    stn["review_count"] = stn.id.map(agg["count"]).fillna(0).astype(int)

    # ------------------------------------------------------------ users: no-show count, blocked, last login
    ns = {}
    for b in bk:
        if b["status"] == "NO_SHOW":
            ns[b["user_id"]] = ns.get(b["user_id"], 0) + 1
    users["no_show_count"] = users.id.map(ns).fillna(0).astype(int)
    last_ev = {}
    for b in bk:
        if b["created_at"] <= NOW:
            last_ev[b["user_id"]] = max(last_ev.get(b["user_id"], b["created_at"]), b["created_at"])
    ll = []
    for u in users.itertuples():
        base = last_ev.get(u.id, u.created_at)
        t = min(NOW - H(minutes=int(rng.integers(5, 600))), base + H(hours=float(rng.exponential(60))))
        ll.append(max(t, u.created_at + H(minutes=3)).replace(microsecond=0))
    users["last_login_at"] = ll
    fixed_login = {"demo@voltslot.in": dt.datetime(2026, 10, 3, 8, 52), "admin@voltslot.in": dt.datetime(2026, 10, 3, 9, 12),
                   "operator@voltslot.in": dt.datetime(2026, 10, 2, 17, 40), "fleet@voltslot.in": dt.datetime(2026, 10, 3, 7, 55),
                   "priya@voltslot.in": dt.datetime(2026, 10, 1, 20, 5), "rahul@voltslot.in": dt.datetime(2026, 9, 30, 23, 10),
                   "sneha@voltslot.in": dt.datetime(2026, 10, 2, 18, 30)}
    for em, t in fixed_login.items():
        users.loc[users.email == em, "last_login_at"] = t
    top_ns = users[(users.role == "USER") & (~users.x_demo)].sort_values("no_show_count", ascending=False).head(2).id.tolist()
    users.loc[users.id.isin(top_ns), "status"] = "BLOCKED"

    # ------------------------------------------------------------ waitlist
    wl = []
    for b in wl_pick:
        wl.append(dict(user_id=b["user_id"], vehicle_id=b["vehicle_id"], station_id=b["station_id"], desired_start=b["start"], slots=b["slots"],
                       status="PROMOTED", promoted_booking_id=b["id"], created_at=b["created_at"] - H(minutes=int(rng.integers(20, 180)))))
    hist_comp = [b for b in bk if b["status"] == "COMPLETED" and b["source"] in ("WEB", "REMINDER") and tier[b["station_id"]] == "HUB"
                 and b["start"] > dt.datetime(2026, 1, 1)]
    for status, n in (("EXPIRED", 6), ("CANCELLED", 3)):
        for i in rng.choice(len(hist_comp), size=n, replace=False):
            b = hist_comp[i]
            u2 = rng.choice([x for x in u_ids if user_by_id[x].role == "USER" and user_by_id[x].created_at < b["start"] - H(days=3)])
            vv = [v for v in sim.vehicles if v["user_id"] == u2]
            if not vv:
                continue
            vv = vv[0]
            wl.append(dict(user_id=int(u2), vehicle_id=vv["id"], station_id=b["station_id"], desired_start=b["start"], slots=2, status=status,
                           promoted_booking_id=None, created_at=b["start"] - H(hours=int(rng.integers(3, 30)))))
    wait_targets = [("BKC", dt.datetime(2026, 10, 5, 19, 0)), ("Thane West", dt.datetime(2026, 10, 3, 19, 0)), ("Powai", dt.datetime(2026, 10, 5, 19, 30)),
                    ("Andheri East", dt.datetime(2026, 10, 3, 18, 30))]
    sid_by_zone = {r.zone: int(r.id) for r in stn.itertuples() if r.tier == "HUB"}
    cars = [v for v in sim.vehicles if v["m"]["category"] == "CAR" and v["_persona"] in ("COMMUTER", "OCCASIONAL")
            and not user_by_id[v["user_id"]].x_demo and not sim.up_count.get(v["user_id"])]
    for (z, ds) in wait_targets[:4]:
        v = cars[int(rng.integers(0, len(cars)))]
        wl.append(dict(user_id=v["user_id"], vehicle_id=v["id"], station_id=sid_by_zone[z], desired_start=ds, slots=2, status="WAITING",
                       promoted_booking_id=None, created_at=NOW - H(hours=int(rng.integers(2, 30)), minutes=int(rng.integers(0, 60)))))
    wl_df = pd.DataFrame(wl).sort_values("created_at").reset_index(drop=True)
    wl_df.insert(0, "id", range(1, len(wl_df) + 1))

    # ------------------------------------------------------------ funnel
    ev = []
    jn = [0]
    sid_stn = {int(r.id): r for r in stn.itertuples()}

    def journey(uid, sid, t_book, stages, rng_span=None, book_t=None, tail=None):
        jn[0] += 1
        key = f"JR{jn[0]:08d}"
        dev = device_of.get(uid) if uid else str(rng.choice(["MOBILE", "DESKTOP", "TABLET"], p=[.68, .27, .05]))
        if uid and rng.random() < .08:
            dev = str(rng.choice(["MOBILE", "DESKTOP", "TABLET"], p=[.68, .27, .05]))
        span = float(rng.uniform(2, 20)) * 60
        t0 = t_book - H(seconds=span)
        marks = {"SEARCH": t0, "VIEW_STATION": t0 + H(seconds=span * .22), "SELECT_SLOT": t0 + H(seconds=span * .58), "BOOK": t_book}
        for s in stages:
            ev.append(dict(session_key=key, user_id=uid, station_id=None if s == "SEARCH" else sid, event_type=s, event_time=marks[s].replace(microsecond=0),
                           device=dev))
        for (s, t) in (tail or []):
            ev.append(dict(session_key=key, user_id=uid, station_id=sid, event_type=s, event_time=t.replace(microsecond=0), device=dev))

    app_bk = [b for b in bk if b["source"] != "WALK_IN"]
    for b in app_bk:
        stg = ["SEARCH", "VIEW_STATION", "SELECT_SLOT"] if b["status"] == "EXPIRED" else ["SEARCH", "VIEW_STATION", "SELECT_SLOT", "BOOK"]
        tail = []
        if b["status"] in ("COMPLETED", "CHECKED_IN"):
            tail.append(("CHECK_IN", b["checked_in_at"]))
        if b["status"] == "COMPLETED":
            tail.append(("COMPLETE", b["sess"]["ended_at"]))
        journey(b["user_id"], b["station_id"], b["created_at"] if b["status"] != "EXPIRED" else b["created_at"] + H(minutes=3), stg, tail=tail)
    # abandoned journeys: conflict drop-offs (SELECT_SLOT) + browsing drop-offs weighted to hub peak hours
    n_conf = 0
    for (uid, vid, sid, t0) in sim.abandoned:
        if t0 > NOW or sid is None:
            continue
        tb = t0 - H(hours=float(rng.uniform(1, 24)))
        tb = max(tb, user_by_id[uid].created_at + H(hours=1))
        journey(uid, sid, tb, ["SEARCH", "VIEW_STATION", "SELECT_SLOT"])
        n_conf += 1
    wts = np.array([1 + 3.0 * (tier[b["station_id"]] == "HUB" and (b["start"].hour in (9, 10, 18, 19, 20))) for b in app_bk])
    wts /= wts.sum()
    n_extra = 4900 - n_conf
    for i in rng.choice(len(app_bk), size=n_extra, p=wts):
        b = app_bk[i]
        peak = tier[b["station_id"]] == "HUB" and b["start"].hour in (9, 10, 18, 19, 20)
        r = rng.random()
        pS, pV = (.18, .30) if peak else (.34, .38)
        stage = ["SEARCH"] if r < pS else (["SEARCH", "VIEW_STATION"] if r < pS + pV else ["SEARCH", "VIEW_STATION", "SELECT_SLOT"])
        tb = b["created_at"] + H(hours=float(rng.uniform(-60, 60)))
        tb = min(max(tb, HIST_START + H(hours=1)), NOW - H(minutes=10))
        uid = b["user_id"] if user_by_id[b["user_id"]].role == "USER" else int(rng.choice([x for x in u_ids[:40] if user_by_id[x].role == "USER"] or [b["user_id"]]))
        tb = max(tb, user_by_id[uid].created_at + H(hours=2))
        if stage == ["SEARCH"] and rng.random() < .15:
            uid = None
        journey(uid, b["station_id"], tb, stage)
    fun_df = pd.DataFrame(ev).sort_values("event_time", kind="stable").reset_index(drop=True)
    fun_df.insert(0, "id", range(1, len(fun_df) + 1))

    # ------------------------------------------------------------ notifications
    notes = []

    def note(uid, typ, title, msg, t, payload=None, read=True, status="DONE"):
        notes.append(dict(user_id=uid, type=typ, title=title, message=msg[:400], payload=payload, is_read=int(read), status=status,
                          snoozed_until=None, created_at=t))

    sname = {int(r.id): r.name for r in stn.itertuples()}
    comp = [b for b in bk if b["status"] == "COMPLETED" and b["source"] != "WALK_IN" and user_by_id[b["user_id"]].role == "USER"]
    pick = lambda lst, n: [lst[i] for i in rng.choice(len(lst), size=min(n, len(lst)), replace=False)]
    pl = lambda b: '{"bookingId":%d,"stationId":%d}' % (b["id"], b["station_id"])
    for b in pick(comp, 55):
        s = b["sess"]
        note(b["user_id"], "CHARGE_COMPLETE", "Charging complete", f"Your vehicle received {s['energy_kwh']:.1f} kWh at {sname[b['station_id']]}. You avoided {s['co2_avoided_kg']:.1f} kg of tailpipe CO2.",
             s["ended_at"] + H(minutes=1), pl(b), True, "DONE")
    for b in pick(comp, 35):
        note(b["user_id"], "BOOKING_CONFIRMED", "Booking confirmed", f"Slot confirmed at {sname[b['station_id']]} on {b['start']:%d %b at %H:%M}. Ref {b['booking_code']}.",
             b["created_at"] + H(minutes=2), pl(b), True, "DONE")
    for b in pick([x for x in bk if x["status"] == "CANCELLED"], 15):
        note(b["user_id"], "BOOKING_CANCELLED", "Booking cancelled", f"Your booking {b['booking_code']} was cancelled. Refund has been processed as per policy.",
             b["cancelled_at"] + H(minutes=1), pl(b), True, "DISMISSED")
    for b in pick([x for x in bk if x["status"] == "NO_SHOW"], 12):
        note(b["user_id"], "NO_SHOW", "Missed slot", f"You did not check in for {b['booking_code']}. A 25% no-show fee was retained and the rest refunded.",
             b["start"] + H(minutes=16), pl(b), True, "DONE")
    for b in wl_pick:
        note(b["user_id"], "WAITLIST_PROMOTED", "A slot opened up", f"Good news - a slot opened at {sname[b['station_id']]} and was held for you for 10 minutes.",
             b["created_at"], pl(b), True, "DONE")
    for b in pick(comp, 10):
        note(b["user_id"], "BOOKING_SOON", "Charging starts soon", f"Your slot at {sname[b['station_id']]} starts in 60 minutes.", b["start"] - H(minutes=60), pl(b), True, "DONE")
    sysmsgs = [("Welcome to VoltSlot", "Find chargers, book slots and get smart recharge reminders."),
               ("Off-peak pricing", "Charge between 22:00 and 06:00 and save 15% on tariffs."),
               ("New hub live", "A new fast-charging hub is now live in your area."),
               ("App update", "Version 2.1 brings faster station search and wallet top-up improvements.")]
    for u in pick([x for x in users.itertuples() if x.role == "USER"], 14):
        t, m = sysmsgs[int(rng.integers(0, 4))]
        note(u.id, "SYSTEM", t, m, u.created_at + H(minutes=int(rng.integers(1, 3000))), None, True, "DONE")
    # demo-account specific notifications
    d_up = [b for b in bk if b["user_id"] == demo_id and b["status"] == "CONFIRMED"]
    d_last = sorted([b for b in bk if b["user_id"] == demo_id and b["status"] == "COMPLETED"], key=lambda x: x["start"])[-1]
    d_can = [b for b in bk if b["user_id"] == demo_id and b["status"] == "CANCELLED"]
    note(demo_id, "CHARGE_COMPLETE", "Charging complete", f"Your Nexon EV received {d_last['sess']['energy_kwh']:.1f} kWh at {sname[d_last['station_id']]}. You avoided {d_last['sess']['co2_avoided_kg']:.1f} kg of tailpipe CO2.",
         d_last["sess"]["ended_at"] + H(minutes=1), pl(d_last), True, "DONE")
    if d_can:
        note(demo_id, "BOOKING_CANCELLED", "Booking cancelled", f"Your booking {d_can[0]['booking_code']} was cancelled and refunded in full.",
             d_can[0]["cancelled_at"], pl(d_can[0]), True, "DISMISSED")
    for b in d_up:
        note(demo_id, "BOOKING_CONFIRMED", "Booking confirmed", f"Slot confirmed at {sname[b['station_id']]} on {b['start']:%d %b at %H:%M}. Ref {b['booking_code']}.",
             b["created_at"] + H(minutes=2), pl(b), False, "ACTIVE")
    note_df = pd.DataFrame(notes).sort_values("created_at", kind="stable").reset_index(drop=True)
    note_df.insert(0, "id", range(1, len(note_df) + 1))

    # ------------------------------------------------------------ assemble tables
    bdf = pd.DataFrame([{k: b.get(k) for k in ("id", "booking_code", "user_id", "vehicle_id", "point_id", "station_id", "start", "end", "slots", "status",
                                               "source", "soc_start", "soc_target", "est_energy", "est_cost", "created_at", "hold_expires_at",
                                               "checked_in_at", "cancelled_at", "cancel_reason")} for b in bk])
    bdf = bdf.rename(columns={"point_id": "charging_point_id", "start": "start_time", "end": "end_time", "est_energy": "est_energy_kwh"})
    slots_rows = []
    for b in bk:
        if b["status"] in ("COMPLETED", "NO_SHOW", "CONFIRMED", "CHECKED_IN"):
            for k in range(b["slots"]):
                slots_rows.append(dict(charging_point_id=b["point_id"], slot_start=b["start"] + H(minutes=30 * k), booking_id=b["id"]))
    bs_df = pd.DataFrame(slots_rows)
    bs_df.insert(0, "id", range(1, len(bs_df) + 1))
    sess_df = sess_df.sort_values("booking_id").reset_index(drop=True)
    sess_df.insert(0, "id", range(1, len(sess_df) + 1))
    pay_df = pay_df.sort_values("booking_id").reset_index(drop=True)
    pay_df.insert(0, "id", range(1, len(pay_df) + 1))

    ct = pd.DataFrame([dict(id=i + 1, code=c[0], display_name=c[1], current_type=c[2], typical_kw=c[3]) for i, c in enumerate(CONNECTORS)])
    cid = {c[0]: i + 1 for i, c in enumerate(CONNECTORS)}
    vm = pd.DataFrame([{k: m[k] for k in ("id", "make", "model", "variant", "category", "battery_kwh", "ac_max_kw", "dc_max_kw", "range_km", "km_per_kwh")}
                       for m in models])
    vmc = pd.DataFrame([dict(vehicle_model_id=m["id"], connector_type_id=cid[c]) for m in models for c in m["connectors"]])
    pb = pd.DataFrame([dict(hour_of_day=h, band_name=band(h)[0], multiplier=band(h)[1]) for h in range(24)])
    veh_out = veh[["id", "user_id", "fleet_id", "model_id", "reg_number", "nickname", "avg_daily_km", "created_at"]].copy()
    stn_out = stn[[c for c in stn.columns if not c.startswith("x_")]].copy()
    pts_out = pts[["id", "station_id", "label", "connector_type_id", "power_kw", "tariff_per_kwh", "status", "created_at"]].copy()
    users_out = users[[c for c in users.columns if not c.startswith("x_")]].copy()

    tables = dict(operators=ops, fleets=fleets, users=users_out, wallets=wal_df, wallet_transactions=wtx_df, connector_types=ct, vehicle_models=vm,
                  vehicle_model_connectors=vmc, vehicles=veh_out, stations=stn_out, amenities=amen, station_amenities=sa, charging_points=pts_out,
                  pricing_bands=pb, bookings=bdf, booking_slots=bs_df, charging_sessions=sess_df, payments=pay_df, reviews=rev_df,
                  waitlist_entries=wl_df, notifications=note_df, funnel_events=fun_df, weather_daily=weather, holidays=hol)
    schema = schema_tables()
    for name, df in tables.items():
        df = df[[c for c, _, _ in schema[name]]]
        tables[name] = df
        write_csv(df, Path(out_dir) / f"{name}.csv")
    log("rows:", {k: len(v) for k, v in tables.items()})
    make_raw(tables, rng, RAW)
    meta = dict(history=int((bdf.start_time <= NOW).sum()), upcoming=int((bdf.start_time > NOW).sum()), total=len(bdf))
    log(meta)
    return tables


def write_csv(df, path):
    df = df.copy()
    for c in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[c]):
            df[c] = df[c].dt.strftime("%Y-%m-%d %H:%M:%S")
        elif df[c].dtype == object and len(df) and isinstance(df[c].dropna().iloc[0] if df[c].notna().any() else None, (dt.datetime, pd.Timestamp)):
            df[c] = pd.to_datetime(df[c]).dt.strftime("%Y-%m-%d %H:%M:%S")
        elif df[c].dtype == object and len(df) and isinstance(df[c].dropna().iloc[0] if df[c].notna().any() else None, dt.date):
            df[c] = df[c].map(lambda d: d.isoformat() if d is not None and d == d else None)
    df.to_csv(path, index=False)


if __name__ == "__main__":
    main()
