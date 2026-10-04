"""Scripted demo-account histories (so reminder logic, cadence and next_due match docs/spec/00_overview.md exactly)."""
import datetime as dt
import statistics
import numpy as np
from common import *

H = dt.timedelta


def snap(t):
    m = (t.hour * 60 + t.minute + 15) // 30 * 30
    return dt.datetime(t.year, t.month, t.day) + H(minutes=m)


def chain(seed, last_start, mean_days, sd_days, first_after, est_duration_min, window, tod=None, tries=20000):
    """Build session start times backwards from `last_start` with ~mean_days cadence until `first_after`.
    The last 6 intervals are drawn continuously (so the median can hit the required next_due window); older ones keep the
    time-of-day band. Accept when predicted next_due (= last_end + median of last 6 intervals) falls inside `window`."""
    lo_h, hi_h = tod if tod else (0, 48)
    for k in range(tries):
        r = np.random.default_rng(seed + k)
        starts = [last_start]
        ok = True
        for _ in range(6):
            t = snap(starts[0] - H(days=mean_days + float(r.normal(0, sd_days))))
            tod_h = t.hour + t.minute / 60
            if tod and not (lo_h - 2.0 <= tod_h <= hi_h + 2.0 or (tod_h + 24 <= hi_h + 2.0)):
                ok = False
                break
            starts.insert(0, t)
        if not ok:
            continue
        iv = [(b - a).total_seconds() / 86400 for a, b in zip(starts, starts[1:])]
        med = statistics.median(iv)
        nd = last_start + H(minutes=est_duration_min) + H(days=med)
        if not (window[0] <= nd <= window[1]):
            continue
        while True:
            gap = mean_days + float(r.normal(0, sd_days))
            t = starts[0] - H(days=gap)
            if tod:
                h = float(r.uniform(*tod))
                cands = [dt.datetime(t.year, t.month, t.day) + H(days=dd, hours=h) for dd in (-1, 0, 1)]
                t = min(cands, key=lambda c: abs((c - t).total_seconds()))
            t = snap(t)
            if t < first_after:
                break
            starts.insert(0, t)
        if len(starts) >= 14:
            return starts
    raise RuntimeError("could not build demo chain")


def build_scripted(sim, veh_df_by_slot, stn):
    """Returns list of scripted intent dicts (see Sim.run)."""
    sid = {z: int(r.id) for z, r in zip(stn.zone, stn.itertuples()) if r.tier == "HUB"}
    idx = lambda z: sim.sid_idx[sid[z]]
    mall_idx = {}
    for i, r in enumerate(stn.itertuples()):
        if r.open_hour == 6 and r.zone not in mall_idx:
            mall_idx[r.zone] = i
    out = []
    rng = np.random.default_rng(4242)
    nexon, ather = veh_df_by_slot["demo_main"], veh_df_by_slot["demo_second"]
    punch, zs = veh_df_by_slot["priya"], veh_df_by_slot["rahul"]

    # ---- demo@ Aarav: Nexon, ~6-day cadence, last session starts Sat 2026-09-27 18:30, ends ~19:10
    last = dt.datetime(2026, 9, 27, 18, 30)
    starts = chain(1000, last, 6.0, 0.18, dt.datetime(2026, 1, 5), 38,
                   (dt.datetime(2026, 10, 3, 19, 10), dt.datetime(2026, 10, 3, 19, 50)), tod=(17.7, 20.3))
    for i, s in enumerate(starts):
        z = "Thane West" if rng.random() < .72 else ("BKC" if rng.random() < .6 else "Powai")
        d = dict(veh=nexon, start=s, per="COMMUTER", forced_station=idx(z), outcome="COMPLETED", mode="DC", tag="DEMO")
        if i == len(starts) - 1:
            d.update(soc_lo=25, soc_hi=25, soc_t=80, forced_station=idx("Thane West"))
        out.append(d)
    # one cancelled booking (late August)
    out.append(dict(veh=nexon, start=dt.datetime(2026, 8, 14, 19, 0), per="COMMUTER", forced_station=idx("Thane West"), outcome="CANCELLED",
                    mode="DC", source="WEB", lead_h=20.0, reason="Change of plans", tag="DEMO_CANCEL"))
    # Ather: 5-day cadence of LECCS top-ups at Thane West hub, last charge 2026-10-01 evening
    a_last = dt.datetime(2026, 10, 1, 19, 0)
    a_starts = [a_last]
    r = np.random.default_rng(77)
    while True:
        t = snap(a_starts[0] - H(days=5 + float(r.normal(0, .5))))
        t = dt.datetime(t.year, t.month, t.day) + H(hours=float(r.uniform(18, 20.5)))
        t = snap(t)
        if t < dt.datetime(2026, 5, 2):
            break
        a_starts.insert(0, t)
    for s in a_starts:
        out.append(dict(veh=ather, start=s, per="TWO_WHEELER", forced_station=idx("Thane West"), outcome="COMPLETED", mode="DC", soc_lo=20, soc_hi=40,
                        tag="DEMO"))
    # upcoming booking for the Ather on Mon 2026-10-05 18:00 (the Nexon has none -> reminder stays active)
    out.append(dict(veh=ather, start=dt.datetime(2026, 10, 5, 18, 0), per="TWO_WHEELER", forced_station=idx("Thane West"), outcome="CONFIRMED",
                    mode="DC", source="WEB", lead_h=40.0, soc_lo=25, soc_hi=25, tag="DEMO_UPCOMING"))

    # ---- priya@ Punch EV: ~14-day cadence, next_due ~ Mon 2026-10-05 14:00
    p_last = dt.datetime(2026, 9, 21, 13, 30)
    p_starts = chain(2000, p_last, 14.0, 1.3, dt.datetime(2026, 1, 1), 36,
                     (dt.datetime(2026, 10, 5, 13, 45), dt.datetime(2026, 10, 5, 14, 30)), tod=(10.5, 16.5))
    zones_p = ["Malad", "Goregaon", "Airport", "Powai", "Andheri East"]
    for i, s in enumerate(p_starts):
        z = zones_p[int(rng.integers(0, len(zones_p)))]
        si = mall_idx[z] if z in mall_idx else idx(z)
        d = dict(veh=punch, start=s, per="WEEKEND", forced_station=si, outcome="COMPLETED", mode="DC" if rng.random() < .5 else "AC", tag="DEMO")
        if i == len(p_starts) - 1:
            d.update(mode="DC", soc_lo=18, soc_hi=18, soc_t=80, forced_station=idx("Andheri East"))
        out.append(d)

    # ---- rahul@ MG ZS EV: night charger, next_due ~ 2026-10-02 22:00 (overdue)
    # night sessions ~every 9 days (start ~22:00); the most recent one was an early-evening AC session (17:00 -> ~22:15) before a trip,
    # so next_due = 2026-10-02 ~22:15 -> overdue at NOW
    rr = np.random.default_rng(3001)
    r_starts = [dt.datetime(2026, 9, 23, 17, 30)]
    cur = dt.datetime(2026, 9, 14, 22, 0)
    while cur >= dt.datetime(2026, 1, 8):
        r_starts.insert(0, snap(cur + H(minutes=float(rr.normal(0, 35)))))
        cur -= H(days=9 if rr.random() > .12 else int(rr.choice([8, 10])))
    zones_r = ["Thane West", "Kharghar", "Mulund", "Nerul"]
    for i, s in enumerate(r_starts):
        z = zones_r[int(rng.integers(0, len(zones_r)))]
        if z in ("Mulund", "Nerul"):
            si = mall_idx.get(z)
            if si is None or True:
                si = [k for k, rr in enumerate(stn.itertuples()) if rr.zone == z and rr.open_hour == 0][0]
        else:
            si = idx(z)
        d = dict(veh=zs, start=s, per="NIGHT", forced_station=si, outcome="COMPLETED", mode="AC", soc_lo=18, soc_hi=32, tag="DEMO")
        if i == len(r_starts) - 1:
            d.update(soc_lo=20, soc_hi=20, soc_t=80)
        out.append(d)
    return out
