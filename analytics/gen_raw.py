"""Dirty 'raw extract' generator (PS experiment: data cleaning). Injects realistic defects into copies of the clean tables.

Defects: duplicates, missing values (mostly derivable), mixed date formats (ISO vs DD/MM/YYYY), inconsistent categorical
spellings, trailing spaces, phone variants, swapped lat/lon, negative / 10x outlier energy values, N/A and - tokens.
"""
import numpy as np
import pandas as pd

CONN_VARIANTS = {"CCS2": ["ccs2", "CCS-2", "Ccs 2", "CCS2 ", "CCS2"], "TYPE2": ["Type 2", "type2", "TYPE-2", "TYPE2", "Type2 "],
                 "CHADEMO": ["CHAdeMO", "chademo", "CHADEMO", "CHA de MO"], "LECCS": ["leccs", "LECCS ", "L-ECCS", "LECCS"],
                 "BHARAT_DC": ["Bharat DC", "bharat_dc", "BHARAT-DC", "BHARAT_DC"]}
STATUS_VARIANTS = {"COMPLETED": ["completed ", "COMPLETE", "Completed", "completed"], "CANCELLED": ["cancelled", "Canceled", "CANCELLED ", "cancelled"],
                   "NO_SHOW": ["no-show", "NOSHOW", "No Show", "no_show"], "CONFIRMED": [" CONFIRMED", "confirmed", "Confirmed"],
                   "EXPIRED": ["expired", "EXPIRED ", "Expired"], "CHECKED_IN": ["checked in", "CHECKED-IN"]}
SOURCE_VARIANTS = {"WEB": ["web", "Web ", "WEB"], "WALK_IN": ["Walk-in", "WALKIN", "walk in", "WALK_IN"], "FLEET": ["fleet", "Fleet"],
                   "REMINDER": ["reminder", "Reminder "], "WAITLIST": ["waitlist", "WAIT_LIST"]}
ZONE_VARIANTS = {"BKC": ["bkc", "BKC ", "Bkc", "B.K.C"], "Thane West": ["Thane west", "thane west", "Thane  West", "Thane W."],
                 "Andheri East": ["Andheri east", "andheri east", "Andheri E"], "Lower Parel": ["lower parel", "Lower  Parel"],
                 "Airport": ["airport", "Airport (Vile Parle)"], "Navi Mumbai": ["Navi-Mumbai", "navi mumbai", "NaviMumbai"]}


def _fmt_dt(s, rng, frac):
    """Return strings: ISO for most rows, DD/MM/YYYY HH:MM:SS for `frac` of rows. NaT -> ''."""
    dts = pd.to_datetime(s)
    iso = dts.dt.strftime("%Y-%m-%d %H:%M:%S")
    alt = dts.dt.strftime("%d/%m/%Y %H:%M:%S")
    mask = rng.random(len(s)) < frac
    out = iso.where(~mask, alt)
    return out.fillna("")


def _variant(vals, table, rng, p=0.25):
    out = []
    for v in vals:
        if v in table and rng.random() < p:
            out.append(str(rng.choice(table[v])))
        else:
            out.append(v)
    return out


def _dups(df, rng, frac):
    k = int(len(df) * frac)
    idx = rng.choice(len(df), size=k, replace=False)
    d = pd.concat([df, df.iloc[idx]], ignore_index=True)
    return d.sample(frac=1.0, random_state=int(rng.integers(1, 10 ** 6))).reset_index(drop=True)


def _blank(series, rng, frac, token=""):
    s = series.astype(object).copy()
    m = rng.random(len(s)) < frac
    tok = np.array([token if token else "", "N/A", "-"], dtype=object)
    s[m] = [tok[int(rng.integers(0, 3))] if token == "ANY" else (token if token != "ANY" else "") for _ in range(m.sum())]
    return s


def make_raw(tables, rng, out):
    rng = np.random.default_rng(4242)
    # ------------------------------------------------------------- bookings_raw
    b = tables["bookings"].copy()
    pts = tables["charging_points"].set_index("id")
    conn = tables["connector_types"].set_index("id")["code"]
    b["connector_type"] = b["charging_point_id"].map(pts["connector_type_id"]).map(conn)
    b = b[b["start_time"] <= pd.Timestamp("2026-10-03 09:30")].drop(columns=["hold_expires_at", "checked_in_at", "cancelled_at", "cancel_reason"])
    b = b.reset_index(drop=True)
    for c in ("start_time", "end_time", "created_at"):
        b[c] = _fmt_dt(b[c], rng, 0.18)
    b["status"] = _variant(b["status"].tolist(), STATUS_VARIANTS, rng, .22)
    b["source"] = _variant(b["source"].tolist(), SOURCE_VARIANTS, rng, .22)
    b["connector_type"] = _variant(b["connector_type"].tolist(), CONN_VARIANTS, rng, .45)
    b["est_energy_kwh"] = b["est_energy_kwh"].astype(float)
    n = len(b)
    neg = rng.random(n) < .004
    big = (rng.random(n) < .004) & ~neg
    b.loc[neg, "est_energy_kwh"] *= -1
    b.loc[big, "est_energy_kwh"] *= 10
    b = b.astype(object)
    for col, frac, tok in (("end_time", .03, ""), ("slots", .02, "N/A"), ("connector_type", .03, ""), ("source", .01, "-")):
        m = rng.random(n) < frac
        b.loc[m, col] = tok
    m = rng.random(n) < .03
    b.loc[m, "booking_code"] = b.loc[m, "booking_code"] + " "
    b = _dups(b, rng, .015)
    b.to_csv(out / "bookings_raw.csv", index=False)

    # ------------------------------------------------------------- sessions_raw
    s = tables["charging_sessions"].copy()
    for c in ("started_at", "ended_at"):
        s[c] = _fmt_dt(s[c], rng, .2)
    n = len(s)
    neg = rng.random(n) < .005
    big = (rng.random(n) < .005) & ~neg
    s["energy_kwh"] = s["energy_kwh"].astype(float)
    s.loc[neg, "energy_kwh"] *= -1
    s.loc[big, "energy_kwh"] *= 10
    s = s.astype(object)
    m = rng.random(n) < .025
    s.loc[m, "amount"] = "N/A"
    m = rng.random(n) < .02
    s.loc[m, "ended_at"] = ""
    s = _dups(s, rng, .01)
    s.to_csv(out / "sessions_raw.csv", index=False)

    # ------------------------------------------------------------- users_raw
    u = tables["users"][["id", "full_name", "email", "phone", "role", "city", "status", "home_lat", "home_lon", "created_at"]].copy()
    n = len(u)
    u["created_at"] = _fmt_dt(u["created_at"], rng, .2)
    u = u.astype(object)
    em = rng.random(n) < .06
    u.loc[em, "email"] = [e.upper() if rng.random() < .5 else " " + e.capitalize() + " " for e in u.loc[em, "email"]]
    nm = rng.random(n) < .05
    u.loc[nm, "full_name"] = [" " + x.lower() + "  " if rng.random() < .5 else x.upper() for x in u.loc[nm, "full_name"]]

    def phone_variant(p):
        digits = p.replace("+91", "").replace(" ", "")
        r = rng.random()
        if r < .55:
            return p
        if r < .7:
            return digits
        if r < .85:
            return f"+91-{digits[:5]}-{digits[5:]}"
        if r < .93:
            return f"+91{digits}"
        return f"(+91) {digits[:5]} {digits[5:]}"
    u["phone"] = [phone_variant(p) for p in u["phone"]]
    for col, frac, tok in (("phone", .03, ""), ("city", .03, "N/A")):
        m = rng.random(n) < frac
        u.loc[m, col] = tok
    u["role"] = [r.lower() if rng.random() < .04 else (r + " " if rng.random() < .03 else r) for r in u["role"]]
    u["status"] = [x.lower() if rng.random() < .05 else x for x in u["status"]]
    sw = rng.random(n) < .01
    u.loc[sw, ["home_lat", "home_lon"]] = u.loc[sw, ["home_lon", "home_lat"]].values
    u = _dups(u, rng, .015)
    u.to_csv(out / "users_raw.csv", index=False)

    # ------------------------------------------------------------- stations_raw
    st = tables["stations"][["id", "name", "zone", "city", "latitude", "longitude", "tier", "open_hour", "close_hour", "uptime_pct", "avg_rating"]].copy()
    st = st.astype(object)
    n = len(st)
    st["zone"] = _variant(st["zone"].tolist(), ZONE_VARIANTS, rng, .5)
    st["city"] = _variant(st["city"].tolist(), ZONE_VARIANTS, rng, .5)
    st["tier"] = [t.lower() if rng.random() < .2 else t for t in st["tier"]]
    st["name"] = [x + " " if rng.random() < .25 else x for x in st["name"]]
    st["uptime_pct"] = [f"{v}%" if rng.random() < .15 else v for v in st["uptime_pct"]]
    for i in rng.choice(n, size=3, replace=False):
        st.loc[i, ["latitude", "longitude"]] = [st.loc[i, "longitude"], st.loc[i, "latitude"]]
    st.loc[rng.choice(n, size=2, replace=False), "avg_rating"] = "N/A"
    st = _dups(st, rng, .06)
    st.to_csv(out / "stations_raw.csv", index=False)

    # ------------------------------------------------------------- reviews_raw
    r = tables["reviews"][["id", "station_id", "user_id", "booking_id", "rating", "comment", "created_at"]].copy()
    n = len(r)
    r["created_at"] = _fmt_dt(r["created_at"], rng, .2)
    r = r.astype(object)
    rt = rng.random(n)
    r["rating"] = [f"{v}.0" if x < .08 else (f"{v} stars" if x < .13 else v) for v, x in zip(r["rating"], rt)]
    m = rng.random(n) < .015
    r.loc[m, "rating"] = "N/A"
    r["comment"] = [(" " + c + "  ") if rng.random() < .08 else (c.replace(" ", "  ", 1) if rng.random() < .05 else c) for c in r["comment"]]
    r = _dups(r, rng, .02)
    r.to_csv(out / "reviews_raw.csv", index=False)
