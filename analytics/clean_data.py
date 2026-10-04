"""Step 2 - clean the dirty raw extracts with Pandas (PS experiment: data cleaning).

Writes data/cleaning_log.csv (issue type, table, column, rows fixed) and verifies the cleaned output against data/clean.
"""
import re
import numpy as np
import pandas as pd
from common import *

LOG = []


def log(issue, table, col, n, how):
    if n:
        LOG.append(dict(issue_type=issue, table=table, column=col, rows_fixed=int(n), method=how))


def parse_dt(s, table, col):
    """Mixed formats: ISO 'YYYY-MM-DD HH:MM:SS' and 'DD/MM/YYYY HH:MM:SS'."""
    s = s.astype(str).str.strip()
    s = s.where(~s.isin(["", "nan", "N/A", "-", "None"]), None)
    slash = s.fillna("").str.contains("/")
    out = pd.to_datetime(s.where(~slash), format="%Y-%m-%d %H:%M:%S", errors="coerce")
    alt = pd.to_datetime(s.where(slash), format="%d/%m/%Y %H:%M:%S", errors="coerce")
    out = out.fillna(alt)
    log("mixed date format", table, col, slash.sum(), "parsed DD/MM/YYYY and ISO, normalised to ISO datetime")
    return out


def norm_token(s, table, col):
    t = s.astype(str).str.strip()
    bad = t.isin(["", "N/A", "-", "nan", "None"])
    log("placeholder token (N/A, -, blank)", table, col, bad.sum(), "converted to NULL")
    return t.where(~bad, None)


def strip_col(s, table, col):
    t = s.astype(str)
    changed = (t != t.str.strip()).sum()
    log("leading/trailing spaces", table, col, changed, "str.strip()")
    return t.str.strip()


def canon(s, mapping, table, col):
    key = s.astype(str).str.strip().str.upper().str.replace(r"[\s\-_\.]+", "", regex=True)
    out = key.map(mapping)
    bad = (s.astype(str).str.strip() != out) & out.notna()
    log("inconsistent categorical spelling", table, col, bad.sum(), "mapped to canonical code")
    return out


CONN_MAP = {"CCS2": "CCS2", "TYPE2": "TYPE2", "CHADEMO": "CHADEMO", "LECCS": "LECCS", "BHARATDC": "BHARAT_DC"}
STATUS_MAP = {"COMPLETED": "COMPLETED", "COMPLETE": "COMPLETED", "CANCELLED": "CANCELLED", "CANCELED": "CANCELLED", "NOSHOW": "NO_SHOW",
              "CONFIRMED": "CONFIRMED", "EXPIRED": "EXPIRED", "CHECKEDIN": "CHECKED_IN"}
SOURCE_MAP = {"WEB": "WEB", "WALKIN": "WALK_IN", "FLEET": "FLEET", "REMINDER": "REMINDER", "WAITLIST": "WAITLIST"}
ZONE_MAP = {"BKC": "BKC", "THANEWEST": "Thane West", "THANEW": "Thane West", "ANDHERIEAST": "Andheri East", "ANDHERIE": "Andheri East",
            "LOWERPAREL": "Lower Parel", "AIRPORT": "Airport", "AIRPORT(VILEPARLE)": "Airport"}
CITY_MAP = {"MUMBAI": "Mumbai", "THANE": "Thane", "NAVIMUMBAI": "Navi Mumbai", "KALYANDOMBIVLI": "Kalyan-Dombivli"}


def clean_bookings(raw, ref):
    t = "bookings"
    n0 = len(raw)
    df = raw.copy()
    df["booking_code"] = strip_col(df["booking_code"], t, "booking_code")
    before = len(df)
    df = df.drop_duplicates(subset=["booking_code"], keep="first").copy()
    log("duplicate rows", t, "booking_code", before - len(df), "drop_duplicates on booking_code")
    for c in ("start_time", "end_time", "created_at"):
        df[c] = parse_dt(df[c], t, c)
    df["status"] = canon(df["status"], STATUS_MAP, t, "status")
    src = norm_token(df["source"], t, "source")
    df["source"] = canon(src.fillna("WEB"), SOURCE_MAP, t, "source")
    log("missing value", t, "source", src.isna().sum(), "imputed with mode 'WEB'")
    df["connector_type"] = canon(df["connector_type"].replace({"": "nan"}).fillna("nan"), {**CONN_MAP, "NAN": None}, t, "connector_type")
    miss = df["connector_type"].isna()
    df.loc[miss, "connector_type"] = df.loc[miss, "charging_point_id"].astype(int).map(ref["pt_conn"])
    log("missing value", t, "connector_type", miss.sum(), "derived from charging_points.connector_type_id")
    slots = pd.to_numeric(norm_token(df["slots"], t, "slots"), errors="coerce")
    ms = slots.isna()
    # slots = (end - start)/30 min where end is present, else derive end from est energy is not possible -> fall back to point maths
    est_slots = ((df["end_time"] - df["start_time"]).dt.total_seconds() / 1800).round()
    slots = slots.fillna(est_slots)
    still = slots.isna()
    slots = slots.fillna(slots.groupby(df["charging_point_id"]).transform("median").round())   # both slots and end_time missing
    slots = slots.fillna(2)
    log("missing value (two derivations lost)", t, "slots", still.sum(), "imputed with the charging point's median slots")
    df["slots"] = slots
    log("missing value", t, "slots", ms.sum(), "derived from (end_time - start_time) / 30 min")
    me = df["end_time"].isna()
    df.loc[me, "end_time"] = df.loc[me, "start_time"] + pd.to_timedelta(df.loc[me, "slots"] * 30, unit="m")
    log("missing value", t, "end_time", me.sum(), "derived as start_time + slots*30 min")
    e = pd.to_numeric(df["est_energy_kwh"], errors="coerce")
    log("negative outlier", t, "est_energy_kwh", (e < 0).sum(), "abs()")
    e = e.abs()
    big = e > 120
    log("10x outlier", t, "est_energy_kwh", big.sum(), "value > 120 kWh (no EV battery that big) divided by 10")
    df["est_energy_kwh"] = np.where(big, e / 10, e)
    for c in ("user_id", "vehicle_id", "charging_point_id", "station_id", "soc_start", "soc_target", "slots"):
        df[c] = pd.to_numeric(df[c]).astype(int)
    df["est_cost"] = pd.to_numeric(df["est_cost"]).round(2)
    return df.drop(columns=["connector_type"]).reset_index(drop=True)


def clean_sessions(raw):
    t = "charging_sessions"
    df = raw.copy()
    before = len(df)
    df = df.drop_duplicates(subset=["booking_id"], keep="first").copy()
    log("duplicate rows", t, "booking_id", before - len(df), "drop_duplicates on booking_id")
    for c in ("started_at", "ended_at"):
        df[c] = parse_dt(df[c], t, c)
    en = pd.to_numeric(df["energy_kwh"], errors="coerce")
    am = pd.to_numeric(norm_token(df["amount"], t, "amount"), errors="coerce")
    tariff = pd.to_numeric(df["tariff"], errors="coerce")
    log("negative outlier", t, "energy_kwh", (en < 0).sum(), "abs()")
    en = en.abs()
    ratio = en / (am / tariff)
    big = (en > 120) | (ratio > 5)
    log("10x outlier", t, "energy_kwh", big.sum(), "energy 5x above amount/tariff (or > 120 kWh) divided by 10")
    en = np.where(big, en / 10, en)
    df["energy_kwh"] = en
    ma = am.isna()
    am = am.fillna((pd.Series(en, index=df.index) * tariff).round(2))
    log("missing value", t, "amount", ma.sum(), "recomputed as energy_kwh * tariff")
    df["amount"] = am
    # ended_at missing: duration = hours of charging + 3 min handshake ~ energy / avg_kw
    me = df["ended_at"].isna()
    dur = (pd.Series(en, index=df.index) / pd.to_numeric(df["avg_kw"]) * 60).apply(np.ceil) + 3
    df.loc[me, "ended_at"] = df.loc[me, "started_at"] + pd.to_timedelta(dur[me], unit="m")
    log("missing value", t, "ended_at", me.sum(), "estimated as started_at + energy/avg_kw (+3 min handshake)")
    for c in ("booking_id", "soc_start", "soc_end"):
        df[c] = pd.to_numeric(df[c]).astype(int)
    for c in ("avg_kw", "tariff", "co2_avoided_kg"):
        df[c] = pd.to_numeric(df[c])
    return df.reset_index(drop=True)


def clean_users(raw, ref):
    t = "users"
    df = raw.copy()
    before = len(df)
    df["id"] = pd.to_numeric(df["id"]).astype(int)
    df = df.drop_duplicates(subset=["id"], keep="first").copy()
    log("duplicate rows", t, "id", before - len(df), "drop_duplicates on id")
    df["created_at"] = parse_dt(df["created_at"], t, "created_at")
    e0 = df["email"].astype(str)
    df["email"] = e0.str.strip().str.lower()
    log("inconsistent case / spaces", t, "email", (e0 != df["email"]).sum(), "strip + lower")
    n0 = df["full_name"].astype(str)
    df["full_name"] = n0.str.strip().str.replace(r"\s+", " ", regex=True).str.title()
    log("inconsistent case / spaces", t, "full_name", (n0 != df["full_name"]).sum(), "strip + Title Case")
    r0 = df["role"].astype(str)
    df["role"] = r0.str.strip().str.upper()
    log("inconsistent categorical spelling", t, "role", (r0 != df["role"]).sum(), "strip + upper")
    s0 = df["status"].astype(str)
    df["status"] = s0.str.strip().str.upper()
    log("inconsistent categorical spelling", t, "status", (s0 != df["status"]).sum(), "strip + upper")
    p0 = norm_token(df["phone"], t, "phone")

    def fix_phone(p):
        if p is None or p != p:
            return None
        d = re.sub(r"\D", "", p)[-10:]
        return f"+91 {d[:5]} {d[5:]}"
    df["phone"] = p0.map(fix_phone)
    fmt_bad = ((p0.notna()) & (p0 != df["phone"])).sum()
    log("phone format variants", t, "phone", fmt_bad, "normalised to '+91 xxxxx xxxxx'")
    df["lat"] = pd.to_numeric(df["home_lat"])
    df["lon"] = pd.to_numeric(df["home_lon"])
    sw = df["lat"] > 60
    df.loc[sw, ["lat", "lon"]] = df.loc[sw, ["lon", "lat"]].values
    log("swapped latitude/longitude", t, "home_lat/home_lon", sw.sum(), "lat > 60 -> swapped back")
    df["home_lat"], df["home_lon"] = df["lat"], df["lon"]
    city = norm_token(df["city"], t, "city")
    mc = city.isna()
    # derive city from nearest station zone (stations carry the city)
    st = ref["stations"]
    def nearest_city(la, lo):
        d = (st["latitude"] - la) ** 2 + ((st["longitude"] - lo) * 0.95) ** 2
        return st.loc[d.idxmin(), "city"]
    df.loc[mc, "city"] = [nearest_city(a, b) for a, b in zip(df.loc[mc, "home_lat"], df.loc[mc, "home_lon"])]
    log("missing value", t, "city", mc.sum(), "derived from nearest station's city using home lat/lon")
    return df.drop(columns=["lat", "lon"]).reset_index(drop=True)


def clean_stations(raw, ref):
    t = "stations"
    df = raw.copy()
    df["id"] = pd.to_numeric(df["id"]).astype(int)
    before = len(df)
    df = df.drop_duplicates(subset=["id"], keep="first").copy()
    log("duplicate rows", t, "id", before - len(df), "drop_duplicates on id")
    df["name"] = strip_col(df["name"], t, "name")
    z0 = df["zone"].astype(str)
    zk = z0.str.upper().str.replace(r"[\s\-_\.]+", "", regex=True)
    df["zone"] = [ZONE_MAP.get(k, orig.strip()) for k, orig in zip(zk, z0)]
    log("inconsistent categorical spelling", t, "zone", (z0 != df["zone"]).sum(), "mapped to canonical zone name")
    c0 = df["city"].astype(str)
    ck = c0.str.upper().str.replace(r"[\s\-_\.]+", "", regex=True)
    df["city"] = [CITY_MAP.get(k, orig.strip()) for k, orig in zip(ck, c0)]
    log("inconsistent categorical spelling", t, "city", (c0 != df["city"]).sum(), "mapped to canonical city name")
    t0 = df["tier"].astype(str)
    df["tier"] = t0.str.strip().str.upper()
    log("inconsistent categorical spelling", t, "tier", (t0 != df["tier"]).sum(), "upper()")
    la, lo = pd.to_numeric(df["latitude"]), pd.to_numeric(df["longitude"])
    sw = la > 60
    df["latitude"] = la.where(~sw, lo)
    df["longitude"] = lo.where(~sw, la)
    log("swapped latitude/longitude", t, "latitude/longitude", sw.sum(), "lat > 60 -> swapped back")
    up = df["uptime_pct"].astype(str)
    pct = up.str.contains("%")
    df["uptime_pct"] = pd.to_numeric(up.str.replace("%", ""))
    log("unit suffix in numeric column", t, "uptime_pct", pct.sum(), "stripped '%' and cast to float")
    ar = pd.to_numeric(norm_token(df["avg_rating"], t, "avg_rating"), errors="coerce")
    ma = ar.isna()
    rv = ref["reviews"]
    recomputed = df["id"].map(rv.groupby("station_id")["rating"].mean())
    df["avg_rating"] = ar.fillna(recomputed.round(2))
    log("missing value", t, "avg_rating", ma.sum(), "recomputed as mean of cleaned reviews.rating")
    for c in ("open_hour", "close_hour"):
        df[c] = pd.to_numeric(df[c]).astype(int)
    return df.reset_index(drop=True)


def clean_reviews(raw):
    t = "reviews"
    df = raw.copy()
    df["id"] = pd.to_numeric(df["id"]).astype(int)
    before = len(df)
    df = df.drop_duplicates(subset=["id"], keep="first").copy()
    log("duplicate rows", t, "id", before - len(df), "drop_duplicates on id")
    df["created_at"] = parse_dt(df["created_at"], t, "created_at")
    r0 = df["rating"].astype(str).str.strip()
    stars = r0.str.contains("star") | r0.str.contains(r"\.0$")
    log("rating stored as text", t, "rating", stars.sum(), "'4 stars' / '4.0' -> int 4")
    num = pd.to_numeric(r0.str.extract(r"(\d+(?:\.\d+)?)")[0], errors="coerce").round()
    na = num.isna()
    # impute missing rating with the station's median rating
    med = num.groupby(df["station_id"]).transform("median").round()
    df["rating"] = num.fillna(med).astype(int)
    log("missing value", t, "rating", na.sum(), "imputed with the station's median rating")
    c0 = df["comment"].astype(str)
    c1 = c0.str.strip().str.replace(r"\s{2,}", " ", regex=True)
    log("extra spaces", t, "comment", (c0 != c1).sum(), "strip + collapse double spaces")
    df["comment"] = c1
    for c in ("station_id", "user_id", "booking_id"):
        df[c] = pd.to_numeric(df[c]).astype(int)
    return df.reset_index(drop=True)


def compare(cleaned, key, truth, cols, name):
    """Cell-level match between cleaned output and data/clean."""
    a = cleaned.set_index(key)
    b = truth.set_index(key)
    common = a.index.intersection(b.index)
    cells = ok = 0
    per_col = {}
    for c in cols:
        x, y = a.loc[common, c], b.loc[common, c]
        if pd.api.types.is_datetime64_any_dtype(x) or pd.api.types.is_datetime64_any_dtype(y):
            y = pd.to_datetime(y)
            x = pd.to_datetime(x)
            eq = (x == y) | (x.isna() & y.isna())
        elif pd.api.types.is_numeric_dtype(y) and pd.api.types.is_numeric_dtype(x):
            eq = (x.astype(float).sub(y.astype(float)).abs() < 0.0051) | (x.isna() & y.isna())
        else:
            eq = (x.astype(str) == y.astype(str)) | (x.isna() & y.isna())
        cells += len(eq)
        ok += int(eq.sum())
        per_col[c] = round(100 * eq.mean(), 2)
    rows_ok = len(common) / max(len(truth), 1)
    return dict(table=name, rows_clean=len(truth), rows_cleaned=len(a), rows_matched_pct=round(100 * rows_ok, 2),
                cells=cells, cells_match=ok, cell_match_pct=round(100 * ok / cells, 3), worst_columns=dict(sorted(per_col.items(), key=lambda kv: kv[1])[:3]))


def main(verbose=True):
    LOG.clear()
    ref = {"stations": pd.read_csv(CLEAN / "stations.csv"), "reviews": pd.read_csv(CLEAN / "reviews.csv")}
    pts = pd.read_csv(CLEAN / "charging_points.csv")
    conn = pd.read_csv(CLEAN / "connector_types.csv").set_index("id")["code"]
    ref["pt_conn"] = dict(zip(pts["id"], pts["connector_type_id"].map(conn)))
    raws = {n: pd.read_csv(RAW / f"{n}_raw.csv", dtype=str, keep_default_na=False) for n in ("bookings", "sessions", "users", "stations", "reviews")}
    # reviews first: station avg_rating recompute needs cleaned reviews
    c_rev = clean_reviews(raws["reviews"])
    ref["reviews"] = c_rev
    c_book = clean_bookings(raws["bookings"], ref)
    c_sess = clean_sessions(raws["sessions"])
    c_usr = clean_users(raws["users"], ref)
    c_stn = clean_stations(raws["stations"], ref)
    out = Path(DATA / "cleaned")
    out.mkdir(exist_ok=True)
    for n, d in dict(bookings=c_book, charging_sessions=c_sess, users=c_usr, stations=c_stn, reviews=c_rev).items():
        d.to_csv(out / f"{n}_cleaned.csv", index=False)
    pd.DataFrame(LOG).sort_values(["table", "issue_type"]).to_csv(DATA / "cleaning_log.csv", index=False)

    tr = lambda n: pd.read_csv(CLEAN / f"{n}.csv", parse_dates=[c for c in pd.read_csv(CLEAN / f"{n}.csv", nrows=1).columns if c.endswith("_at") or c.endswith("_time")])
    res = []
    b_t = tr("bookings"); b_t = b_t[b_t["start_time"] <= NOW]
    res.append(compare(c_book, "booking_code", b_t, [c for c in c_book.columns if c != "booking_code"], "bookings"))
    res.append(compare(c_sess, "booking_id", tr("charging_sessions"), [c for c in c_sess.columns if c != "booking_id"], "charging_sessions"))
    res.append(compare(c_usr, "id", tr("users"), [c for c in c_usr.columns if c != "id" and c != "x"], "users"))
    res.append(compare(c_stn, "id", pd.read_csv(CLEAN / "stations.csv"), [c for c in c_stn.columns if c != "id"], "stations"))
    res.append(compare(c_rev, "id", tr("reviews"), [c for c in c_rev.columns if c != "id"], "reviews"))
    rdf = pd.DataFrame(res)
    rdf.to_csv(DATA / "cleaning_verification.csv", index=False)
    if verbose:
        print(pd.DataFrame(LOG).groupby("table").rows_fixed.sum().to_string())
        print(rdf[["table", "rows_clean", "rows_cleaned", "rows_matched_pct", "cell_match_pct", "worst_columns"]].to_string())
        tot_c, tot_ok = rdf.cells.sum(), rdf.cells_match.sum()
        print(f"overall cell match: {100 * tot_ok / tot_c:.3f}%  ({len(LOG)} log lines -> data/cleaning_log.csv)")
    return rdf


if __name__ == "__main__":
    main()
