"""Users, fleets, vehicles and personas (SYNTHETIC)."""
import datetime as dt
import numpy as np
import pandas as pd
from common import *
from gen_ref import ZONES, FIRST, LAST

PERSONA_COUNTS = {"COMMUTER": 99, "WEEKEND": 119, "NIGHT": 89, "OCCASIONAL": 270, "TWO_WHEELER": 59}
OFFICE_W = {"BKC": 3, "Powai": 2.5, "Andheri East": 2.5, "Lower Parel": 2, "Worli": 1, "Airport": 0.8}
FLEETS = [("SwiftLogix Deliveries", "Navi Mumbai", "Vashi", 12), ("GreenMile Couriers", "Mumbai", "Airport", 9),
          ("UrbanCart Logistics", "Thane", "Thane West", 8), ("Metro Milk Express", "Mumbai", "Dadar", 7),
          ("QuickBasket Mumbai", "Navi Mumbai", "Panvel", 7), ("ZipFresh Foods", "Mumbai", "Andheri East", 7)]
DEMO = {  # email -> (name, persona, home zone, work zone, created)
    "demo@voltslot.in": ("Aarav Mehta", "COMMUTER", "Thane West", "BKC", dt.datetime(2025, 8, 14, 19, 42)),
    "priya@voltslot.in": ("Priya Nair", "WEEKEND", "Goregaon", None, dt.datetime(2025, 8, 21, 11, 5)),
    "rahul@voltslot.in": ("Rahul Deshmukh", "NIGHT", "Mulund", None, dt.datetime(2025, 9, 2, 21, 15)),
    "sneha@voltslot.in": ("Sneha Iyer", "TWO_WHEELER", "Dadar", None, dt.datetime(2025, 9, 9, 8, 30)),
}
CAR_W = {"Nexon EV": .26, "Punch EV": .14, "Tiago EV": .14, "ZS EV": .09, "Comet EV": .06, "XUV400 EL": .12, "Kona Electric": .04, "Atto 3": .07}
HASH_PLACEHOLDER = "__HASH__"


def city_of(zone):
    return ZONES[zone][3]


def make_people(rng, ops, hash_for):
    """hash_for(email_role) -> bcrypt hash string. Returns dict of DataFrames + python lists with private fields."""
    model_idx = {m[1]: i + 1 for i, m in enumerate(VEHICLE_MODELS)}
    models = [dict(id=i + 1, make=m[0], model=m[1], variant=m[2], category=m[3], battery_kwh=m[4], ac_max_kw=m[5], dc_max_kw=m[6],
                   range_km=m[7], km_per_kwh=m[8], connectors=m[9]) for i, m in enumerate(VEHICLE_MODELS)]
    by_name = {m["model"]: m for m in models}
    used_emails, used_names = set(), set()
    zones = list(ZONES)
    resid_zones = [z for z in zones if z not in ("Airport", "BKC", "Lower Parel", "Worli", "Powai", "Andheri East")]
    users = []

    def new_name(avoid=()):
        while True:
            n = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
            if n not in used_names and n not in avoid:
                used_names.add(n)
                return n

    def email_for(name):
        f, l = name.lower().replace("'", "").split(" ", 1)
        while True:
            e = f"{f}.{l.replace(' ', '')}{int(rng.integers(10, 100))}@example.com"
            if e not in used_emails:
                used_emails.add(e)
                return e

    def phone():
        return f"+91 00000 {int(rng.integers(10000, 99999))}"

    def signup(role_early=False):
        if role_early:
            return dt.datetime(2025, 6, 1) + dt.timedelta(minutes=int(rng.integers(0, 60 * 24 * 40)))
        if rng.random() < 0.70:
            lo, hi = dt.datetime(2025, 7, 1), dt.datetime(2025, 9, 30, 23, 59)
        else:
            lo, hi = dt.datetime(2025, 10, 1), dt.datetime(2026, 9, 25)
        return lo + dt.timedelta(minutes=int(rng.integers(0, int((hi - lo).total_seconds() // 60))))

    def add_user(email, name, role, persona, home, work, created, pw, op=None, fleet=None, demo=False):
        z = ZONES[home]
        users.append(dict(id=len(users) + 1, full_name=name, email=email, password_hash=hash_for(pw), phone=phone(), role=role,
                          city=city_of(home), status="ACTIVE", operator_id=op, fleet_id=fleet,
                          home_lat=round(z[0] + float(rng.normal(0, 0.009)), 6), home_lon=round(z[1] + float(rng.normal(0, 0.009)), 6),
                          reminder_enabled=1 if (demo or rng.random() < 0.9) else 0,
                          reminder_lead_hours=24 if (demo or rng.random() < 0.8) else int(rng.choice([12, 48])),
                          no_show_count=0, created_at=created, last_login_at=None,
                          x_persona=persona, x_home=home, x_work=work, x_demo=demo))
        used_names.add(name)

    # fixed order: admin, operator, fleet, 4 demo users
    add_user("admin@voltslot.in", "VoltSlot Admin", "ADMIN", None, "BKC", None, dt.datetime(2025, 6, 2, 9, 0), "Admin@123", demo=True)
    add_user("operator@voltslot.in", "Meera Joshi", "OPERATOR", None, "BKC", None, dt.datetime(2025, 6, 3, 9, 30), "Operator@123", op=1, demo=True)
    add_user("fleet@voltslot.in", "Ritesh Kapoor", "FLEET_MANAGER", "FLEET", "Vashi", None, dt.datetime(2025, 6, 10, 10, 0), "Fleet@123", fleet=1, demo=True)
    for em, (nm, per, hz, wz, cr) in DEMO.items():
        add_user(em, nm, "USER", per, hz, wz, cr, "User@123", demo=True)
    add_user(email_for("Kavita Rao"), "Kavita Rao", "ADMIN", None, "Powai", None, dt.datetime(2025, 6, 20, 9, 0), "User@123")
    for i in range(1, 8):  # other operators
        nm = new_name()
        add_user(email_for(nm), nm, "OPERATOR", None, "BKC", None, signup(True), "User@123", op=i + 1)
    for i in range(1, 6):  # other fleet managers
        nm = new_name()
        add_user(email_for(nm), nm, "FLEET_MANAGER", "FLEET", FLEETS[i][2], None, signup(True), "User@123", fleet=i + 1)
    # persona users
    persona_list = [p for p, n in PERSONA_COUNTS.items() for _ in range(n)]
    rng.shuffle(persona_list)
    for per in persona_list:
        nm = new_name()
        home = str(rng.choice(resid_zones)) if per != "WEEKEND" else str(rng.choice(zones))
        work = None
        if per == "COMMUTER":
            ws = np.array([OFFICE_W[z] for z in OFFICE_W])
            work = str(rng.choice(list(OFFICE_W), p=ws / ws.sum()))
        add_user(email_for(nm), nm, "USER", per, home, work, signup(), "User@123")
    users_df = pd.DataFrame(users)

    # fleets
    fleets_df = pd.DataFrame([dict(id=i + 1, name=n, city=c, created_at=dt.datetime(2025, 6, 12 + i, 10, 0)) for i, (n, c, _, _) in enumerate(FLEETS)])

    # vehicles
    vehicles = []
    regs = set()

    def reg(zone):
        rto = {"Thane West": "04", "Kalyan": "05", "Dombivli": "05", "Vashi": "43", "Nerul": "43", "Kharghar": "46", "Panvel": "46",
               "Borivali": "47", "Dadar": "01", "Worli": "01", "Lower Parel": "01"}.get(zone, "02")
        while True:
            r = f"MH{rto} {''.join(rng.choice(list('ABCDEFGHJKLMNPRSTUVWXYZ'), size=2))} {int(rng.integers(1000, 9999))}"
            if r not in regs:
                regs.add(r)
                return r

    def add_vehicle(uid, model_name, fleet=None, nick=None, daily=40, persona="OCCASIONAL", home="Thane West", created=None, extra=None):
        m = by_name[model_name]
        u = users_df.loc[users_df.id == uid].iloc[0]
        cr = created or (u.created_at + dt.timedelta(hours=int(rng.integers(1, 72))))
        v = dict(id=len(vehicles) + 1, user_id=uid, fleet_id=fleet, model_id=m["id"], reg_number=reg(home), nickname=nick,
                 avg_daily_km=daily, created_at=cr, _persona=persona, _model=m, _home=home, _extra=extra or {})
        vehicles.append(v)
        return v

    def pick_car():
        names = list(CAR_W)
        p = np.array([CAR_W[n] for n in names]); p /= p.sum()
        return str(rng.choice(names, p=p))

    demo_ids = {r.email: r.id for r in users_df.itertuples()}
    add_vehicle(demo_ids["demo@voltslot.in"], "Nexon EV", nick="Nexon", daily=48, persona="COMMUTER", home="Thane West",
                extra=dict(slot="MAIN"))
    add_vehicle(demo_ids["demo@voltslot.in"], "450X", nick="Ather", daily=25, persona="TWO_WHEELER", home="Thane West",
                extra=dict(slot="SECOND"))
    add_vehicle(demo_ids["priya@voltslot.in"], "Punch EV", nick="Punchy", daily=32, persona="WEEKEND", home="Goregaon", extra=dict(slot="MAIN"))
    add_vehicle(demo_ids["rahul@voltslot.in"], "ZS EV", nick="ZS", daily=44, persona="NIGHT", home="Mulund", extra=dict(slot="MAIN"))
    add_vehicle(demo_ids["sneha@voltslot.in"], "S1 Pro", nick="Ola", daily=28, persona="TWO_WHEELER", home="Dadar", extra=dict(slot="MAIN"))
    n3w = 0
    for u in users_df.itertuples():
        if u.role != "USER" or u.x_demo:
            continue
        per = u.x_persona
        if per == "TWO_WHEELER":
            if n3w < 6:
                mdl = "Treo"; n3w += 1
            else:
                mdl = str(rng.choice(["450X", "S1 Pro", "iQube ST"], p=[.4, .35, .25]))
            add_vehicle(u.id, mdl, daily=int(rng.integers(20, 45)), persona=per, home=u.x_home)
        else:
            daily = {"COMMUTER": (35, 60), "WEEKEND": (18, 40), "NIGHT": (30, 55), "OCCASIONAL": (15, 50)}[per]
            add_vehicle(u.id, pick_car(), daily=int(rng.integers(*daily)), persona=per, home=u.x_home)
    # second vehicles for ~10 non-demo users
    cand = users_df[(users_df.role == "USER") & (~users_df.x_demo) & (users_df.x_persona.isin(["COMMUTER", "WEEKEND", "OCCASIONAL"]))].sample(10, random_state=42)
    for u in cand.itertuples():
        add_vehicle(u.id, str(rng.choice(["450X", "S1 Pro", "iQube ST", "Tiago EV"])), daily=int(rng.integers(15, 35)), persona="OCCASIONAL",
                    home=u.x_home, extra=dict(slot="SECOND"))
    # fleet vehicles
    mgr = {r.fleet_id: r.id for r in users_df.itertuples() if r.role == "FLEET_MANAGER"}
    for i, (fname, city, depot, n) in enumerate(FLEETS):
        for k in range(n):
            if i == 0:
                mdl = "Ace EV" if k < 8 else "Treo"
            else:
                mdl = str(rng.choice(["Ace EV", "Treo", "Tiago EV"], p=[.5, .3, .2]))
            tag = "".join(w[0] for w in fname.split()[:2]).upper()
            add_vehicle(mgr[i + 1], mdl, fleet=i + 1, nick=f"{tag}-{k + 1:02d}", daily=int(rng.integers(70, 140)), persona="FLEET", home=depot,
                        created=fleets_df.loc[i, "created_at"] + dt.timedelta(days=int(rng.integers(1, 20)), hours=int(rng.integers(0, 24))),
                        extra=dict(depot=depot))
    veh_df = pd.DataFrame(vehicles)
    return users_df, fleets_df, veh_df, models
