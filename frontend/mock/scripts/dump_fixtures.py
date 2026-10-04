#!/usr/bin/env python3
"""Dumps stations / reference / demand_forecast / admin_stats fixtures straight from MySQL `chargeiq` (read-only)."""
import json, pathlib, pymysql
from decimal import Decimal

OUT = pathlib.Path(__file__).resolve().parent.parent / "fixtures"
NOW_DOW, NOW_HOUR, NOW_SLOT = 6, 9, "2026-10-03 09:30:00"   # demo clock: Saturday 09:30

def conv(o):
    if isinstance(o, Decimal): return float(o)
    raise TypeError(type(o))

def save(path, data):
    p = OUT / path; p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, indent=2, ensure_ascii=False, default=conv) + "\n", encoding="utf-8")
    print("wrote", p)

db = pymysql.connect(host="localhost", user="root", password="root", database="chargeiq", charset="utf8mb4",
                     cursorclass=pymysql.cursors.DictCursor)
def q(sql, *a):
    with db.cursor() as c:
        c.execute(sql, a); return list(c.fetchall())

def level(ci): return "LOW" if ci < 35 else ("MEDIUM" if ci < 65 else "HIGH")
def f(x): return float(x) if x is not None else None

# ---- reference
connectors = [dict(id=r["id"], code=r["code"], displayName=r["display_name"], currentType=r["current_type"], typicalKw=r["typical_kw"])
              for r in q("select * from connector_types order by id")]
codes = {}
for r in q("select vmc.vehicle_model_id m, ct.code from vehicle_model_connectors vmc join connector_types ct on ct.id=vmc.connector_type_id order by ct.id"):
    codes.setdefault(r["m"], []).append(r["code"])
models = [dict(id=r["id"], make=r["make"], model=r["model"], variant=r["variant"], category=r["category"], batteryKwh=r["battery_kwh"],
               acMaxKw=r["ac_max_kw"], dcMaxKw=r["dc_max_kw"], rangeKm=r["range_km"], kmPerKwh=r["km_per_kwh"],
               connectorCodes=codes.get(r["id"], [])) for r in q("select * from vehicle_models order by id")]
amenities = [dict(id=r["id"], name=r["name"], icon=r["icon"]) for r in q("select * from amenities order by id")]
zones = [dict(zone=r["zone"], stations=r["n"], latitude=round(r["lat"], 4), longitude=round(r["lon"], 4))
         for r in q("select zone, count(*) n, avg(latitude) lat, avg(longitude) lon from stations where status='ACTIVE' group by zone order by zone")]
bands = [dict(hourOfDay=r["hour_of_day"], bandName=r["band_name"], multiplier=r["multiplier"]) for r in q("select * from pricing_bands order by hour_of_day")]
for name, data in [("connectors", connectors), ("vehicle-models", models), ("amenities", amenities), ("zones", zones), ("pricing-bands", bands)]:
    save(f"reference/{name}.json", data)

# ---- stations (StationDetailDto)
amen_by = {}
for r in q("select sa.station_id s, a.id, a.name, a.icon from station_amenities sa join amenities a on a.id=sa.amenity_id order by a.id"):
    amen_by.setdefault(r["s"], []).append(dict(id=r["id"], name=r["name"], icon=r["icon"]))
pts_by = {}
for r in q("select cp.*, ct.code, ct.display_name, ct.current_type from charging_points cp join connector_types ct on ct.id=cp.connector_type_id order by cp.station_id, cp.id"):
    pts_by.setdefault(r["station_id"], []).append(r)
busy = {r["station_id"]: r["n"] for r in q(
    "select cp.station_id, count(distinct bs.charging_point_id) n from booking_slots bs join charging_points cp on cp.id=bs.charging_point_id where bs.slot_start=%s group by cp.station_id", NOW_SLOT)}
crowd = {r["station_id"]: r["crowding_index"] for r in q("select station_id, crowding_index from demand_forecast where day_of_week=%s and hour_of_day=%s", NOW_DOW, NOW_HOUR)}
rating = {}
for r in q("select station_id, rating, count(*) n from reviews group by station_id, rating"):
    rating.setdefault(r["station_id"], {})[r["rating"]] = r["n"]
sent = {}
for r in q("select station_id, sentiment_label l, count(*) n from reviews group by station_id, sentiment_label"):
    sent.setdefault(r["station_id"], {})[r["l"]] = r["n"]

stations = []
for s in q("select s.*, o.name operator_name from stations s join operators o on o.id=s.operator_id order by s.id"):
    sid = s["id"]; pts = pts_by.get(sid, [])
    conn = {}
    for p in pts:
        c = conn.setdefault(p["code"], dict(code=p["code"], count=0, maxKw=0.0)); c["count"] += 1; c["maxKw"] = max(c["maxKw"], p["power_kw"])
    active = [p for p in pts if p["status"] == "ACTIVE"]
    ci = float(crowd.get(sid, 0))
    sc = s["sentiment_score"]
    label = "POSITIVE" if sc >= 0.15 else ("NEGATIVE" if sc <= -0.05 else "NEUTRAL")
    summary = dict(id=sid, name=s["name"], address=s["address"], zone=s["zone"], city=s["city"], latitude=s["latitude"], longitude=s["longitude"],
                   tier=s["tier"], operatorId=s["operator_id"], operatorName=s["operator_name"], distanceKm=None, connectors=list(conn.values()),
                   totalPoints=len(pts), activePoints=len(active), minTariff=min((f(p["tariff_per_kwh"]) for p in pts), default=0.0),
                   avgRating=s["avg_rating"], reviewCount=s["review_count"], reliabilityScore=s["reliability_score"], sentimentLabel=label,
                   openNow=s["open_hour"] <= NOW_HOUR < s["close_hour"] and s["status"] == "ACTIVE", openHour=s["open_hour"], closeHour=s["close_hour"],
                   freeNowPoints=max(0, len(active) - busy.get(sid, 0)), crowdingIndexNow=ci, crowdingLevelNow=level(ci))
    points = [dict(id=p["id"], label=p["label"], connectorCode=p["code"], connectorName=p["display_name"], currentType=p["current_type"],
                   powerKw=p["power_kw"], tariffPerKwh=f(p["tariff_per_kwh"]), status=p["status"]) for p in pts]
    rb = {str(k): rating.get(sid, {}).get(k, 0) for k in range(1, 6)}
    sl = sent.get(sid, {}); tot = sum(sl.values()) or 1
    split = dict(positivePct=round(100 * sl.get("POSITIVE", 0) / tot), neutralPct=round(100 * sl.get("NEUTRAL", 0) / tot), negativePct=round(100 * sl.get("NEGATIVE", 0) / tot))
    stations.append(dict(summary=summary, amenities=amen_by.get(sid, []), points=points, ratingBreakdown=rb, sentiment=split, uptimePct=s["uptime_pct"]))
save("stations.json", stations)

# ---- demand_forecast
save("demand_forecast.json", [dict(stationId=r["station_id"], dayOfWeek=r["day_of_week"], hourOfDay=r["hour_of_day"],
     expectedSessions=r["expected_sessions"], crowdingIndex=r["crowding_index"])
     for r in q("select * from demand_forecast order by station_id, day_of_week, hour_of_day")])

# ---- admin stats-like counts
counts = {}
for t in ["users", "operators", "fleets", "stations", "charging_points", "vehicles", "bookings", "charging_sessions", "reviews",
          "wallets", "payments", "notifications", "funnel_events", "weather_daily", "holidays", "demand_forecast", "network_forecast",
          "dw_fact_session", "dw_fact_booking", "dw_dim_date", "dw_dim_station", "dw_dim_user", "dw_dim_vehicle"]:
    counts[t] = q(f"select count(*) n from {t}")[0]["n"]
save("analytics/admin_stats.json", dict(counts=counts, bookingsToday=q(
    "select count(*) n from bookings where start_time>='2026-10-03' and start_time<'2026-10-04' and status not in ('CANCELLED','EXPIRED')")[0]["n"],
    bookingsLive=q("select count(*) n from bookings where status in ('HOLD','CONFIRMED','CHECKED_IN') and end_time > %s", "2026-10-03 09:30:00")[0]["n"],
    now="2026-10-03T09:30:00", clockMode="FIXED"))
