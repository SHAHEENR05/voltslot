"""Booking simulator: personas -> intents -> slot allocation with conflict resolution (SYNTHETIC).

Pipeline per intent: sample date/hour (persona + zone profile) -> pick station (distance, popularity, habit, zone-hour profile)
-> pick compatible point -> check free slots -> shift +-30..90 min -> alternative station -> otherwise abandoned funnel journey.
"""
import datetime as dt
import math
import numpy as np
from common import *
from gen_ref import ZONES

H = dt.timedelta
ZT = {"OFFICE": 0, "RESIDENTIAL": 1, "TRANSIT": 2}
PROF = {  # zone-type hour profiles (relative), 24 values
    "OFFICE": [.03, .03, .03, .03, .03, .05, .15, .3, .6, 1, 1, .8, .5, .85, .85, .6, .5, .6, .95, .95, .7, .35, .12, .06],
    "RESIDENTIAL": [.3, .2, .1, .05, .05, .05, .3, .7, .8, .5, .3, .25, .25, .25, .25, .3, .35, .5, .8, 1, 1, 1, .9, .6],
    "TRANSIT": [.7, .3, .1, .05, .05, .4, .9, 1, .9, .6, .35, .3, .3, .3, .3, .3, .35, .5, .6, .6, .6, .8, .95, 1],
}
PERSONA = {
    "COMMUTER": dict(dow=[1, 1, 1, 1, 1, .3, .2], hours={6: .15, 7: .2, 8: .3, 9: 1, 10: 1, 11: .5, 13: .25, 14: .25, 17: .3, 18: 1, 19: 1.1, 20: .9, 21: .4},
                     L=7, dc=.55),
    "WEEKEND": dict(dow=[.12, .12, .12, .12, .2, 1, 1], hours={9: .2, 10: .4, 11: 1, 12: 1, 13: 1, 14: 1, 15: 1, 16: .8, 17: .5, 18: .25, 19: .2},
                    L=22, dc=.35),
    "NIGHT": dict(dow=[1, 1, 1, 1, 1.2, 1.2, 1], hours={21: .25, 22: 1, 23: 1, 24: .7, 25: .5, 26: .25}, L=4, dc=0.0),
    "OCCASIONAL": dict(dow=[1] * 7, hours={8: .4, 9: .6, 10: .7, 11: .7, 12: .6, 13: .6, 14: .6, 15: .6, 16: .7, 17: .8, 18: 1, 19: 1, 20: .9, 21: .6, 22: .3},
                       L=9, dc=.6),
    "TWO_WHEELER": dict(dow=[1, 1, 1, 1, 1, .8, .7], hours={8: .3, 9: .5, 10: .4, 12: .4, 13: .4, 14: .3, 17: .7, 18: 1, 19: 1, 20: .8, 21: .4},
                        L=5, dc=1.0),
    "FLEET": dict(dow=[1, 1, 1, 1, 1, 1, .4], hours={5: .9, 6: 1, 7: .5, 12: .3, 13: .4, 14: .3, 22: .8, 23: .7, 24: .5, 25: .25}, L=14, dc=.95),
}
CANCEL_REASONS = ["Change of plans", "Found a closer charger", "Vehicle not available", "Charged at home", "Booked wrong slot",
                  "Work meeting ran late", "Duplicate booking", "Trip cancelled"]
SHIFTS = [30, 60, 90]
HUB_ALPHA = {"COMMUTER": 1.0, "FLEET": 1.0, "WEEKEND": 1.0, "OCCASIONAL": .8, "NIGHT": .35, "TWO_WHEELER": .7}


def hav_km(lat1, lon1, lat2, lon2):
    x = (lon2 - lon1) * math.cos(math.radians(lat1)) * 111.2
    y = (lat2 - lat1) * 111.2
    return np.sqrt(x * x + y * y)


class Sim:
    def __init__(self, rng, stn, pts, users, vehicles, models, weather, holidays, act=1.0, hub_boost=4.0, upcoming_target=250):
        self.rng = rng
        self.act = act
        self.upcoming_target = upcoming_target
        self.stn = stn.reset_index(drop=True)
        self.S = len(self.stn)
        self.sid_idx = {int(r.id): i for i, r in enumerate(self.stn.itertuples())}
        self.models = {m["id"]: m for m in models}
        self.users = {int(r.id): r for r in users.itertuples()}
        self.vehicles = [dict(v) for v in vehicles.to_dict("records")]
        for v in self.vehicles:
            v["m"] = v["_model"]
        # --- station arrays
        zn = self.stn.zone.tolist()
        self.zt = np.array([ZT[ZONES[z][2]] for z in zn])
        self.zt_name = [ZONES[z][2] for z in zn]
        self.lat = self.stn.latitude.values
        self.lon = self.stn.longitude.values
        popz = {"BKC": 1.7, "Powai": 1.4, "Thane West": 1.4, "Andheri East": 1.25, "Lower Parel": 1.0, "Vashi": .95, "Airport": .9, "Kharghar": .75}
        pop = []
        for r in self.stn.itertuples():
            if r.tier == "HUB":
                p = popz[r.zone]
            else:
                p = float(rng.uniform(0.7, 1.1))
            if r.x_poor:
                p *= 0.6
            pop.append(p)
        self.pop = np.array(pop)
        self.hub_boost = hub_boost
        self.day_noise = {}
        self.is_hub = (self.stn.tier == "HUB").values
        self.is_mall = np.array([6 == r.open_hour for r in self.stn.itertuples()])
        self.open_h = self.stn.open_hour.values
        self.close_h = self.stn.close_hour.values
        self.prof = np.array([[PROF[n][h] for h in range(24)] for n in ("OFFICE", "RESIDENTIAL", "TRANSIT")])
        # --- compatibility: model -> station idx -> list of points sorted
        self.pts_by_station = {i: [] for i in range(self.S)}
        for p in pts.to_dict("records"):
            self.pts_by_station[self.sid_idx[p["station_id"]]].append(p)
        self.compat = {}
        self.ok = {}
        for mid, m in self.models.items():
            ok = np.zeros(self.S, bool)
            comp = {}
            for si, plist in self.pts_by_station.items():
                good = []
                for p in plist:
                    kind = p["_kind"]
                    if kind not in m["connectors"]:
                        continue
                    cur = CONN_CURRENT[kind]
                    acc = min(p["power_kw"], m["ac_max_kw"] if cur == "AC" else m["dc_max_kw"])
                    if acc <= 0:
                        continue
                    good.append(dict(pid=p["id"], kw=p["power_kw"], cur=cur, tariff=float(p["tariff_per_kwh"]), acc=acc,
                                     out=p["_out_from"], kind=kind))
                if any(g["out"] is None for g in good):
                    ok[si] = True
                comp[si] = good
            self.compat[mid] = comp
            self.ok[mid] = ok
        # --- day modifiers
        self.rain = {r.weather_date: r.rainfall_mm for r in weather.itertuples()}
        self.hol = {r.holiday_date for r in holidays.itertuples()}
        # --- state
        self.occ = {}
        self.veh_busy = {}
        self.loyal = {}
        self.up_count = {}
        self.bookings = []
        self.abandoned = []
        self.ready = {}
        for v in self.vehicles:
            u = self.users[v["user_id"]]
            self.ready[v["id"]] = max(u.created_at, v["created_at"]) + H(days=1)

    # ------------------------------------------------------------------ helpers
    def day_keep(self, d, zt_name):
        wk = d.weekday() >= 5
        m = 1.0
        if wk:
            m *= {"OFFICE": .75, "RESIDENTIAL": 1.15, "TRANSIT": 1.0}[zt_name]
        elif d in self.hol:
            m *= {"OFFICE": .70, "RESIDENTIAL": 1.10, "TRANSIT": 1.0}[zt_name]
        if d in self.hol and wk:
            m *= {"OFFICE": .8, "RESIDENTIAL": 1.0, "TRANSIT": 1.0}[zt_name]
        if d.month in (6, 7, 8, 9):
            m *= .93
        if self.rain.get(d, 0) > 20:
            m *= .85
        if dt.date(2025, 10, 17) <= d <= dt.date(2025, 10, 25):
            m *= 1.10
        months = (d.year - 2025) * 12 + d.month - 10 + d.day / 31.0
        g = 1.025 ** max(0.0, months)          # ~ +2.5 % per month growth trend
        if d not in self.day_noise:
            self.day_noise[d] = float(self.rng.lognormal(0, 0.22))
        return min(1.0, m * g * self.day_noise[d] / (1.2 * 1.30 * 1.3))

    def is_free(self, pid, s0, n):
        o = self.occ.get(pid)
        if not o:
            return True
        return all((s0 + k) not in o for k in range(n))

    def veh_free(self, vid, s0, n):
        for (a, b) in self.veh_busy.get(vid, ()):
            if s0 < b and a < s0 + n:
                return False
        return True

    def hours_ok(self, si, t, end):
        if self.open_h[si] > 0 and t.hour < self.open_h[si]:
            return False
        if self.close_h[si] < 24:
            limit = dt.datetime(t.year, t.month, t.day) + H(hours=int(self.close_h[si]))
            if end > limit or t.date() != end.date() and end > limit:
                return False
        return True

    def occupy(self, pid, vid, s0, n):
        o = self.occ.setdefault(pid, set())
        for k in range(n):
            o.add(s0 + k)
        self.veh_busy.setdefault(vid, []).append((s0, s0 + n))

    # ------------------------------------------------------------------ intents
    def draw_hour(self, per):
        hrs = PERSONA[per]["hours"]
        ks = list(hrs)
        p = np.array([hrs[k] for k in ks])
        return int(self.rng.choice(ks, p=p / p.sum()))

    def make_start(self, d, per, wk_force=None):
        h = self.draw_hour(per)
        base = dt.datetime(d.year, d.month, d.day) + H(hours=h)
        if self.rng.random() < .5:
            base += H(minutes=30)
        return base

    def vehicle_intents(self, v):
        rng = self.rng
        per = v["_persona"]
        if v["_extra"].get("slot") == "SECOND":
            per_use = "OCCASIONAL"
        else:
            per_use = per
        dow = PERSONA[per_use]["dow"]
        if per_use == "COMMUTER":
            cad = rng.uniform(7.5, 11.5)
        elif per_use == "WEEKEND":
            cad = rng.uniform(16, 34)
        elif per_use == "NIGHT":
            cad = rng.uniform(18, 30)
        elif per_use == "TWO_WHEELER":
            cad = rng.uniform(8, 14)
        elif per_use == "FLEET":
            cad = rng.uniform(8, 10.5)
        else:
            cad = 365 / rng.uniform(2, 6)
        if v["_extra"].get("slot") == "SECOND":
            cad = 365 / rng.uniform(3, 8)
        if v["_extra"].get("cad"):
            cad = v["_extra"]["cad"]
        cad /= self.act
        ready = self.ready[v["id"]]
        t_nom = max(ready, HIST_START) + H(days=float(rng.uniform(0, 1)) * min(cad, 30))
        out = []
        sigma = 0.2
        while t_nom < UP_END:
            offs = np.arange(-2, 3)
            w = np.array([dow[(t_nom + H(days=int(o))).weekday()] * (1.0 if o == 0 else .5) for o in offs])
            o = int(rng.choice(offs, p=w / w.sum()))
            d = (t_nom + H(days=o)).date()
            st = self.make_start(d, per_use)
            if st >= ready and st < UP_END and st >= HIST_START:
                out.append(dict(veh=v, start=st, per=per_use, scripted=False))
            if per_use == "OCCASIONAL":
                gap = max(4.0, float(rng.exponential(cad)))
            else:
                gap = cad * float(rng.lognormal(0, sigma))
            t_nom += H(days=gap)
        return out

    # ------------------------------------------------------------------ station choice
    def station_weights(self, v, per, t, hubs_only=False, forced=None):
        u = self.users[v["user_id"]]
        hr = t.hour % 24
        wk = 1 if t.weekday() >= 5 else 0
        if per == "FLEET":
            alat, alon = self.depot_ll[v["_extra"]["depot"]]
        elif per == "COMMUTER" and isinstance(u.x_work, str):
            frac_work = .7 if t.hour <= 13 else .4
            if self.rng.random() < frac_work:
                alat, alon = self.zone_ll[u.x_work]
            else:
                alat, alon = u.home_lat, u.home_lon
        else:
            alat, alon = u.home_lat, u.home_lon
        d = hav_km(alat, alon, self.lat, self.lon)
        hm = np.where(self.is_hub, self.hub_boost ** HUB_ALPHA[per], 1.0)
        w = self.pop * hm * np.exp(-d / PERSONA[per]["L"]) * self.prof[self.zt, hr] ** 1.0 * self.ok[v["m"]["id"]]
        if per == "WEEKEND":
            w = w * (1 + 1.2 * self.is_mall) * np.where(self.is_hub, 1.3, 1.0) * np.where(self.zt == 0, 0.45, 1.0)
        if per == "NIGHT":
            w = w * np.where(self.zt == 1, 1.0, 0.04)
        if per == "FLEET":
            w = w * np.where(self.is_hub | (self.zt == 2), 1.8, 0.6)
        if per == "TWO_WHEELER" and v["m"]["category"] == "THREE_WHEELER":
            w = w * np.where(self.is_hub | (self.zt == 2), 1.5, 1.0)
        vis = self.loyal.get(v["id"])
        if vis is not None:
            w = w * (1 + 0.8 * np.minimum(vis, 6))
        if hubs_only:
            w = w * self.is_hub
        if forced is not None:
            m = np.zeros(self.S)
            m[forced] = 1
            w = w * m + (m * 1e-6)
        return w

    # ------------------------------------------------------------------ leads / outcomes
    def draw_source(self, v, upcoming):
        rng = self.rng
        if v["_persona"] == "FLEET":
            if rng.random() < .93:
                return "FLEET", float(rng.uniform(12, 30))
            return ("WALK_IN", 0.0) if not upcoming else ("FLEET", float(rng.uniform(12, 30)))
        r = rng.random()
        if r < .55:
            return "WEB", float(rng.uniform(1, 24))
        if r < .70:
            return "WEB", float(rng.uniform(24, 168))
        if r < .80:
            return "REMINDER", float(rng.uniform(2, 20))
        if upcoming:
            return "WEB", float(rng.uniform(1, 24))
        return "WALK_IN", 0.0

    def draw_outcome(self, src, v):
        if src == "WALK_IN":
            return "COMPLETED"
        r = self.rng.random()
        if src == "FLEET":
            c, n, e = .06, .035, .012
        else:
            c, n, e = .105, .07, .055
        if r < c:
            return "CANCELLED"
        if r < c + n:
            return "NO_SHOW"
        if r < c + n + e:
            return "EXPIRED"
        return "COMPLETED"

    # ------------------------------------------------------------------ core placement
    def process(self, it, upcoming=False, hubs_only=False, forced_station=None, forced_point=None, strict=False,
                outcome=None, source=None, lead_h=None, max_alt=3):
        rng = self.rng
        v = it["veh"]
        per = it["per"]
        m = v["m"]
        u = self.users[v["user_id"]]
        t0 = it["start"]
        is_fleet_mgr = u.role == "FLEET_MANAGER"
        if upcoming:
            lim = 18 if is_fleet_mgr else 2
            if self.up_count.get(u.id, 0) >= lim:
                return None
        src, lead = (source, lead_h) if source else self.draw_source(v, upcoming)
        if lead_h is not None and source is None:
            lead = lead_h
        if upcoming:
            outc = outcome or "CONFIRMED"
        else:
            outc = outcome or self.draw_outcome(src, v)
        if outc in ("CANCELLED", "EXPIRED") and lead < 0.75:
            outc = "COMPLETED"
        occupying = outc in ("COMPLETED", "NO_SHOW", "CONFIRMED", "CHECKED_IN")
        soc_s_dist = {"FLEET": (8, 30), "COMMUTER": (12, 45), "WEEKEND": (10, 40), "NIGHT": (15, 50), "OCCASIONAL": (10, 50),
                      "TWO_WHEELER": (15, 50)}[per]
        soc_s = int(rng.integers(it.get("soc_lo", soc_s_dist[0]), it.get("soc_hi", soc_s_dist[1]) + 1))
        r_t = rng.random()
        dc_p = PERSONA[per]["dc"]
        want = "DC" if rng.random() < dc_p else "AC"
        if it.get("mode"):
            want = it["mode"]
        vs = self.ready[v["id"]]
        w = self.station_weights(v, per, t0, hubs_only, forced_station)
        if w.sum() <= 0:
            self.abandoned.append((u.id, v["id"], None, t0))
            return None
        keys = np.log(w + 1e-12) + rng.gumbel(size=self.S)
        order = [int(i) for i in np.argsort(-keys)[:1 + max_alt] if w[i] > 0]
        sgn = 1 if rng.random() < .5 else -1
        shifts = [0] + [s * k for s in SHIFTS for k in (sgn, -sgn)]
        first_station = order[0]
        for rank, si in enumerate(order):
            plist = self.compat[m["id"]][si]
            if not plist:
                continue
            classes = [want, "AC" if want == "DC" else "DC"]
            if per in ("FLEET", "TWO_WHEELER") or (m["category"] != "CAR"):
                classes = [want, "AC" if want == "DC" else "DC"]
            for ci, cls in enumerate(classes):
                cand = [p for p in plist if p["cur"] == cls]
                if not cand:
                    continue
                if per == "NIGHT" and cls == "DC" and ci == 1:
                    continue
                if cls == "DC":
                    cand.sort(key=lambda p: (-p["acc"], p["tariff"]))
                    if rng.random() < .12 and len(cand) > 1:
                        cand[0], cand[1] = cand[1], cand[0]
                else:
                    cand.sort(key=lambda p: (p["tariff"], -p["acc"]))
                    if len(cand) > 1 and rng.random() < .5:
                        cand.reverse()
                if forced_point is not None:
                    cand = [p for p in cand if p["pid"] == forced_point]
                if m["category"] in ("TWO_WHEELER", "THREE_WHEELER"):
                    tgt = 90 if r_t < .6 else 100
                elif cls == "DC":
                    tgt = 80 if r_t < .82 else 90
                else:
                    tgt = 90 if r_t < .5 else 100
                tgt = it.get("soc_t", tgt)
                if tgt <= soc_s + 5:
                    continue
                shl = shifts if (rank == 0 and not strict and occupying) else ([0] if (strict or not occupying) else [0, 30, -30])
                if ci == 1 or rank > 0:
                    shl = [0, 30, -30] if not strict and occupying else [0]
                for off in shl:
                    t = t0 + H(minutes=off)
                    if upcoming:
                        if t <= NOW + H(minutes=20) or t >= UP_END:
                            continue
                    else:
                        if t < HIST_START or t < vs:
                            continue
                    for p in cand:
                        if p["out"] is not None and (upcoming or t >= p["out"]):
                            continue
                        est = estimate(p["kw"], p["cur"], p["tariff"], m, soc_s, tgt, t.hour)
                        if est is None:
                            continue
                        end = t + H(minutes=30 * est["slots"])
                        if not upcoming and end > NOW and outc != "CHECKED_IN":
                            continue
                        if not self.hours_ok(si, t, end):
                            continue
                        s0 = slot_index(t)
                        if occupying and (not self.is_free(p["pid"], s0, est["slots"]) or not self.veh_free(v["id"], s0, est["slots"])):
                            continue
                        return self._commit(it, v, u, si, p, t, end, est, soc_s, tgt, src, lead, outc, occupying, upcoming,
                                            shifted=(off != 0 or rank > 0 or ci > 0), cls=cls, per=per)
        if not upcoming and outc in ("COMPLETED", "NO_SHOW") and not it.get("silent"):
            self.abandoned.append((u.id, v["id"], int(self.stn.id[first_station]), t0))
        return None

    def _commit(self, it, v, u, si, p, t, end, est, soc_s, tgt, src, lead, outc, occupying, upcoming, shifted, cls, per):
        rng = self.rng
        created = t - H(minutes=lead * 60, seconds=int(rng.integers(0, 60)))
        floor = self.ready[v["id"]] - H(hours=12)
        if src == "WALK_IN":
            created = t
        if created < floor:
            created = floor + H(minutes=int(rng.integers(5, 600)))
        if upcoming:
            cap = NOW - H(minutes=int(rng.integers(5, 36 * 60)))
            created = min(created, cap)
            if created < floor:
                created = floor + H(minutes=30)
        lead_h = (t - created).total_seconds() / 3600
        b = dict(user_id=u.id, vehicle_id=v["id"], point_id=p["pid"], station_id=int(self.stn.id[si]), start=t, end=end, slots=est["slots"],
                 status=outc, source=src, soc_start=soc_s, soc_target=tgt, est_energy=round(est["wall"], 2), est_cost=est["cost"],
                 created_at=created, lead_h=lead_h, cls=cls, persona=per, shifted=shifted, est=est, point=p, scripted=it.get("scripted", False),
                 tag=it.get("tag"))
        if outc == "CANCELLED":
            lo = max(created + H(minutes=2), t - H(hours=12))
            hi = t - H(minutes=10)
            if hi <= lo:
                b["status"] = "COMPLETED"
                occupying = True
                if not self.is_free(p["pid"], slot_index(t), est["slots"]):
                    b["status"] = "NO_SHOW"
            else:
                ct = lo + H(seconds=float(rng.uniform(0, (hi - lo).total_seconds())))
                b["cancelled_at"] = ct.replace(microsecond=0)
                b["cancel_reason"] = it.get("reason") or str(rng.choice(CANCEL_REASONS))
        if b["status"] in ("COMPLETED", "NO_SHOW", "CONFIRMED", "CHECKED_IN") and not self.is_free(p["pid"], slot_index(t), est["slots"]):
            # cancelled->completed fallback collided: treat as no occupancy conflict avoided by dropping
            return None
        if b["status"] in ("COMPLETED", "NO_SHOW", "CONFIRMED", "CHECKED_IN"):
            self.occupy(p["pid"], v["id"], slot_index(t), est["slots"])
        self.bookings.append(b)
        vis = self.loyal.setdefault(v["id"], np.zeros(self.S))
        vis[si] += 1
        if upcoming:
            self.up_count[u.id] = self.up_count.get(u.id, 0) + 1
        return b

    # ------------------------------------------------------------------ run
    def setup_geo(self, zone_ll, depot_ll):
        self.zone_ll = zone_ll
        self.depot_ll = depot_ll

    def run(self, scripted):
        rng = self.rng
        # scripted demo intents first (they are strict & occupy slots before anyone else)
        for sc in scripted:
            kw = dict(sc)
            it = dict(veh=kw.pop("veh"), start=kw.pop("start"), per=kw.pop("per"), scripted=True, **{k: kw.pop(k) for k in
                      ("soc_lo", "soc_hi", "soc_t", "mode", "reason", "tag") if k in kw})
            up = it["start"] > NOW
            self.process(it, upcoming=up, strict=True, **kw)
        demo_veh = {sc["veh"]["id"] for sc in scripted}
        intents = []
        for v in self.vehicles:
            if v["id"] in demo_veh:
                continue
            intents.extend(self.vehicle_intents(v))
        intents.sort(key=lambda x: x["start"])
        for it in intents:
            up = it["start"] >= NOW
            if up and rng.random() > .8:
                continue
            si_keep = None
            # day-level demand modulation, evaluated with the zone type of the station finally chosen: approximate
            # with a blended keep-probability by drawing the likely zone type from the persona
            zt_guess = {"COMMUTER": "OFFICE", "WEEKEND": "RESIDENTIAL", "NIGHT": "RESIDENTIAL", "OCCASIONAL": None, "TWO_WHEELER": None,
                        "FLEET": "TRANSIT"}[it["per"]]
            if it["per"] == "COMMUTER":
                zt_guess = "OFFICE" if it["start"].hour <= 14 else "RESIDENTIAL"
            if zt_guess is None:
                zt_guess = ["OFFICE", "RESIDENTIAL", "TRANSIT"][int(rng.integers(0, 3))]
            if rng.random() > self.day_keep(it["start"].date(), zt_guess):
                continue
            self.process(it, upcoming=up)
        return self.bookings

    # ------------------------------------------------------------------ upcoming scenario builders
    def _eligible(self, persona_ok=("COMMUTER", "OCCASIONAL", "WEEKEND", "NIGHT")):
        return [v for v in self.vehicles if v["_persona"] in persona_ok and v["m"]["category"] == "CAR"]

    def checked_in(self, n=2):
        """Charging in progress at NOW: status CHECKED_IN, started 09:00 / 09:30."""
        cands = [v for v in self._eligible(("COMMUTER", "OCCASIONAL")) if not self.users[v["user_id"]].x_demo]
        order = list(self.rng.permutation(len(cands)))
        done = 0
        stations = [self.sid_idx[1], self.sid_idx[3]]
        for k in order:
            v = cands[k]
            st = dt.datetime(2026, 10, 3, 9, 0) if done == 0 else dt.datetime(2026, 10, 3, 9, 30)
            it = dict(veh=v, start=st, per="COMMUTER", scripted=True, soc_lo=15, soc_hi=30, mode="DC", silent=True)
            b = self.process(it, upcoming=False, strict=True, outcome="CHECKED_IN", source="WEB", lead_h=3.0,
                             forced_station=stations[done])
            if b:
                done += 1
                if done == n:
                    break

    def saturate(self, zone, day, h0, h1):
        rng = self.rng
        si = [i for i, r in enumerate(self.stn.itertuples()) if r.zone == zone and r.tier == "HUB"][0]
        plist = [p for p in self.pts_by_station[si] if p["_kind"] in ("CCS2", "CHADEMO") and p["_out_from"] is None]
        elig = self._eligible()
        n_new = 0
        for p in plist:
            t = dt.datetime(day.year, day.month, day.day) + H(hours=h0)
            end_w = dt.datetime(day.year, day.month, day.day) + H(hours=h1)
            while t < end_w:
                cand = [v for v in elig if p["_kind"] in v["m"]["connectors"] and not self.users[v["user_id"]].x_demo
                        and self.up_count.get(v["user_id"], 0) < 2]
                if not cand:
                    break
                v = cand[int(rng.integers(0, len(cand)))]
                m = v["m"]
                pp = [q for q in self.compat[m["id"]][si] if q["pid"] == p["id"]]
                if not pp:
                    continue
                pp = pp[0]
                soc_s = int(rng.integers(15, 40))
                est = estimate(pp["kw"], pp["cur"], pp["tariff"], m, soc_s, 80, t.hour)
                end = t + H(minutes=30 * est["slots"])
                s0 = slot_index(t)
                if self.is_free(pp["pid"], s0, est["slots"]) and self.veh_free(v["id"], s0, est["slots"]) and t > NOW + H(minutes=20):
                    b = self._commit(dict(veh=v, per=v["_persona"], tag="saturate"), v, self.users[v["user_id"]], si, pp, t, end, est, soc_s, 80,
                                     "WEB", float(rng.uniform(4, 60)), "CONFIRMED", True, True, False, "DC", v["_persona"])
                    if b:
                        n_new += 1
                t += H(minutes=30 * est["slots"])
        return n_new

    def extras(self, n):
        rng = self.rng
        elig = [v for v in self._eligible() if not self.users[v["user_id"]].x_demo]
        added = tries = 0
        while added < n and tries < n * 30:
            tries += 1
            v = elig[int(rng.integers(0, len(elig)))]
            day = dt.datetime(2026, 10, 3) + H(days=int(rng.integers(0, 7)))
            h = int(rng.choice([17, 18, 19, 20, 8, 9, 10, 13, 14], p=[.1, .22, .22, .16, .06, .06, .06, .06, .06]))
            st = day + H(hours=h, minutes=30 * int(rng.integers(0, 2)))
            if st <= NOW + H(minutes=30):
                continue
            it = dict(veh=v, start=st, per=v["_persona"] if v["_persona"] != "FLEET" else "COMMUTER", scripted=False, silent=True)
            if self.process(it, upcoming=True, hubs_only=True):
                added += 1
        return added
