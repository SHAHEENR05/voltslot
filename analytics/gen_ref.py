"""Reference/master data generation: operators, stations, charging points, amenities, weather, holidays (SYNTHETIC)."""
import datetime as dt
import math
import numpy as np
import pandas as pd
from common import *

OPERATORS = [("VoltGrid", "#22d3ee"), ("ChargeNest", "#a78bfa"), ("AmpereHub", "#f59e0b"), ("GreenPlug", "#34d399"),
             ("UrjaCharge", "#f472b6"), ("ZapStation", "#facc15"), ("MetroCharge", "#60a5fa"), ("EcoJuice", "#fb923c")]

# zone: (lat, lon, type, city, is_hub)
ZONES = {
    "Thane West": (19.2183, 72.9781, "RESIDENTIAL", "Thane", True),
    "Powai": (19.1176, 72.9060, "OFFICE", "Mumbai", True),
    "Andheri East": (19.1136, 72.8697, "OFFICE", "Mumbai", True),
    "BKC": (19.0690, 72.8680, "OFFICE", "Mumbai", True),
    "Lower Parel": (18.9930, 72.8300, "OFFICE", "Mumbai", True),
    "Worli": (19.0176, 72.8180, "OFFICE", "Mumbai", False),
    "Dadar": (19.0178, 72.8478, "TRANSIT", "Mumbai", False),
    "Borivali": (19.2307, 72.8567, "RESIDENTIAL", "Mumbai", False),
    "Malad": (19.1860, 72.8480, "RESIDENTIAL", "Mumbai", False),
    "Goregaon": (19.1663, 72.8526, "RESIDENTIAL", "Mumbai", False),
    "Ghatkopar": (19.0860, 72.9080, "RESIDENTIAL", "Mumbai", False),
    "Mulund": (19.1726, 72.9425, "RESIDENTIAL", "Mumbai", False),
    "Chembur": (19.0522, 72.9005, "RESIDENTIAL", "Mumbai", False),
    "Vashi": (19.0745, 72.9978, "TRANSIT", "Navi Mumbai", True),
    "Nerul": (19.0330, 73.0297, "RESIDENTIAL", "Navi Mumbai", False),
    "Kharghar": (19.0474, 73.0699, "RESIDENTIAL", "Navi Mumbai", True),
    "Panvel": (18.9894, 73.1175, "TRANSIT", "Navi Mumbai", False),
    "Airport": (19.0990, 72.8480, "TRANSIT", "Mumbai", True),
    "Kalyan": (19.2437, 73.1355, "RESIDENTIAL", "Kalyan-Dombivli", False),
    "Dombivli": (19.2183, 73.0868, "RESIDENTIAL", "Kalyan-Dombivli", False),
}
HUB_OP = {"BKC": 0, "Powai": 1, "Thane West": 2, "Lower Parel": 3, "Vashi": 4, "Andheri East": 5, "Airport": 6, "Kharghar": 7}
HUB_SUFFIX = {"BKC": "G Block", "Powai": "Lakeside", "Thane West": "Ghodbunder Rd", "Lower Parel": "Mill Compound",
              "Vashi": "Sector 17", "Andheri East": "MIDC Road", "Airport": "Sahar Link Rd", "Kharghar": "Central Park Rd"}
HUB_ADDR = {"BKC": "Plot C-54, G Block, Bandra Kurla Complex, Mumbai 400051",
            "Powai": "Lakeside Drive, Near Central Avenue, Powai, Mumbai 400076",
            "Thane West": "Ghodbunder Road, Opp. Orchid Square, Thane West 400607",
            "Lower Parel": "Senapati Bapat Marg, Mill Compound, Lower Parel, Mumbai 400013",
            "Vashi": "Sector 17, Palm Beach Link Road, Vashi, Navi Mumbai 400703",
            "Andheri East": "MIDC Central Road, Andheri East, Mumbai 400093",
            "Airport": "Sahar Link Road, Vile Parle East, Mumbai 400099",
            "Kharghar": "Central Park Road, Sector 20, Kharghar, Navi Mumbai 410210"}
STD_PLACES = ["Orchid Mall", "Sapphire Plaza", "Maple Heights", "Harbour View Complex", "Lotus Corporate Park",
              "Silver Oak Society", "City Square Mall", "Railway Station Parking", "Greenfield Residency", "Metro Pillar Bay",
              "Sunrise Arcade", "Highway Plaza", "Lakeshore Towers", "Crescent Business Park", "Palm Court", "Skyline Residency",
              "Vertex Tower", "Orion Square", "Riverside Complex", "Heritage Plaza"]
POOR = {("Kalyan", 1), ("Dombivli", 0), ("Ghatkopar", 1), ("Panvel", 0)}   # (zone, index) low-quality stations
MALL_ZONES = {"Malad", "Goregaon", "Mulund", "Chembur", "Borivali", "Dadar", "Nerul"}  # first station in zone = mall

AMENITIES = [("Cafe", "coffee"), ("Restroom", "bath"), ("Wi-Fi", "wifi"), ("Covered Parking", "car"), ("Mall", "shopping-bag"),
             ("Lounge", "sofa"), ("24x7 Security", "shield-check"), ("Snacks", "utensils"), ("EV Mechanic", "wrench")]

TARIFF = {("CCS2", 30): 16.0, ("CCS2", 60): 18.5, ("CCS2", 120): 23.0, ("CHADEMO", 50): 17.0, ("LECCS", 3.3): 9.0,
          ("BHARAT_DC", 15): 13.0}


def make_stations(rng):
    ops = pd.DataFrame([dict(id=i + 1, name=n, brand_color=c, contact_email=f"support@{n.lower()}.example.com",
                             created_at=dt.datetime(2024, 3 + i % 6, 5 + i, 10, 0)) for i, (n, c) in enumerate(OPERATORS)])
    stations, points, sa = [], [], []
    sid = 0
    pid = 0
    std_counter = 0
    amen_id = {n: i + 1 for i, (n, _) in enumerate(AMENITIES)}
    zone_names = list(ZONES)
    hub_zones = [z for z in zone_names if ZONES[z][4]]
    hub_order = sorted(hub_zones, key=lambda z: HUB_OP[z])
    # hubs first
    hub_plans = {  # points per hub (kind, kw)
        "BKC": [("CCS2", 120), ("CCS2", 60), ("CCS2", 30), ("CHADEMO", 50), ("TYPE2", 7.4), ("LECCS", 3.3)],
        "Powai": [("CCS2", 120), ("CCS2", 60), ("CCS2", 30), ("TYPE2", 7.4), ("TYPE2", 7.4), ("LECCS", 3.3)],
        "Thane West": [("CCS2", 120), ("CCS2", 60), ("CHADEMO", 50), ("TYPE2", 7.4), ("TYPE2", 7.4), ("LECCS", 3.3)],
        "Andheri East": [("CCS2", 120), ("CCS2", 60), ("CCS2", 30), ("TYPE2", 7.4), ("LECCS", 3.3)],
        "Lower Parel": [("CCS2", 120), ("CCS2", 60), ("TYPE2", 7.4), ("TYPE2", 7.4), ("LECCS", 3.3)],
        "Vashi": [("CCS2", 60), ("CCS2", 30), ("BHARAT_DC", 15), ("TYPE2", 7.4), ("LECCS", 3.3)],
        "Airport": [("CCS2", 120), ("CCS2", 60), ("CHADEMO", 50), ("TYPE2", 7.4), ("BHARAT_DC", 15), ("LECCS", 3.3)],
        "Kharghar": [("CCS2", 60), ("CHADEMO", 50), ("TYPE2", 7.4), ("LECCS", 3.3)],
    }
    all_amen_hub = ["Cafe", "Restroom", "Wi-Fi", "24x7 Security", "Covered Parking", "Lounge", "Snacks", "EV Mechanic"]
    conn_id = {c[0]: i + 1 for i, c in enumerate(CONNECTORS)}

    def add_station(zone, tier, op_idx, name, addr, idx_in_zone, plan, amen, open_h, close_h):
        nonlocal sid, pid
        sid += 1
        lat, lon, zt, city, _ = ZONES[zone]
        jlat, jlon = rng.normal(0, 0.0035), rng.normal(0, 0.0035)
        poor = (zone, idx_in_zone) in POOR and tier == "STANDARD"
        created = dt.datetime(2025, 1 + (sid % 6), 3 + sid % 20, 11, 0)
        stations.append(dict(id=sid, operator_id=op_idx + 1, name=name, address=addr, zone=zone, city=city,
                             latitude=round(lat + jlat, 6), longitude=round(lon + jlon, 6), tier=tier,
                             open_hour=open_h, close_hour=close_h, status="ACTIVE",
                             uptime_pct=round(float(rng.uniform(84, 90.5)) if poor else float(rng.uniform(96.2, 99.7)), 1),
                             avg_rating=0.0, review_count=0, sentiment_score=0.0, reliability_score=0.0, created_at=created,
                             x_poor=poor, x_zone_type=zt))
        n_ac = n_dc = 0
        for kind, kw in plan:
            pid += 1
            cur = CONN_CURRENT[kind]
            if cur == "AC":
                n_ac += 1
                label = f"AC-{n_ac}"
                tariff = round(float(rng.choice([11.0, 12.0, 12.5, 13.0, 13.5])), 2)
            else:
                n_dc += 1
                label = f"DC-{n_dc}"
                tariff = TARIFF[(kind, kw)]
                if kind == "CCS2" and kw == 60:
                    tariff = float(rng.choice([18.0, 18.5, 19.0]))
                if kind == "CCS2" and kw == 120:
                    tariff = float(rng.choice([22.0, 23.0, 24.0]))
            points.append(dict(id=pid, station_id=sid, label=label, connector_type_id=conn_id[kind], power_kw=float(kw),
                               tariff_per_kwh=tariff, status="ACTIVE", created_at=created, _kind=kind, _out_from=None))
        for a in amen:
            sa.append(dict(station_id=sid, amenity_id=amen_id[a]))

    for z in hub_order:
        op = HUB_OP[z]
        add_station(z, "HUB", op, f"{OPERATORS[op][0]} {z} Hub – {HUB_SUFFIX[z]}", HUB_ADDR[z], 0, hub_plans[z],
                    rng.choice(all_amen_hub, size=int(rng.integers(5, 7)), replace=False).tolist() if z != "BKC" else all_amen_hub[:6], 0, 24)
    std_zones = [z for z in zone_names if not ZONES[z][4]]
    # operator rotation for standard stations: each operator gets 3
    rot = [i % 8 for i in range(24)]
    rng.shuffle(rot)
    k = 0
    three_pt = 0
    for z in std_zones:
        for idx in range(2):
            op = rot[k]
            k += 1
            mall = idx == 0 and z in MALL_ZONES
            if mall:
                std_counter += 1
            non_mall = [p for p in STD_PLACES if "Mall" not in p]
            malls = ["Orchid Mall", "City Square Mall", "Galleria Mall", "Sapphire Mall", "Atlas Mall", "Cascade Mall", "Zenith Mall", "Meridian Mall"]
            place = malls[std_counter % 8] if mall else non_mall[k % len(non_mall)]
            name = f"{OPERATORS[op][0]} {z} {place}"
            addr = f"{int(rng.integers(2, 180))}, {'Mall Road' if mall else place}, {z}, {ZONES[z][3]}"
            ccs_kw = 60 if rng.random() < 0.4 else 30
            plan = [("TYPE2", 7.4), ("CCS2", ccs_kw)]
            if (z, idx) in {("Panvel", 1), ("Kalyan", 0)}:
                plan = [("TYPE2", 7.4), ("CCS2", 30), ("BHARAT_DC", 15)]
            elif three_pt < 10:
                three_pt += 1
                plan.append(("LECCS", 3.3) if three_pt <= 9 else ("TYPE2", 7.4))
            amen = ["Restroom"] + rng.choice(["Cafe", "Wi-Fi", "Covered Parking", "24x7 Security", "Snacks"], size=int(rng.integers(1, 4)), replace=False).tolist()
            if mall:
                amen += ["Mall", "Covered Parking"] if "Covered Parking" not in amen else ["Mall"]
            add_station(z, "STANDARD", op, name, addr, idx, plan, list(dict.fromkeys(amen)),
                        6 if mall else 0, 23 if mall else 24)
    stn = pd.DataFrame(stations)
    pts = pd.DataFrame(points)
    # 4 points out of service (as of NOW)
    def set_status(zone, kind, status, d, nth=0):
        sids = stn.index[stn.zone == zone].tolist()
        for si in sids:
            st_id = int(stn.loc[si, "id"])
            cand = pts.index[(pts.station_id == st_id) & (pts._kind == kind)]
            if len(cand) > nth:
                pts.loc[cand[nth], ["status", "_out_from"]] = [status, d]
                return
    set_status("Kalyan", "CCS2", "OFFLINE", dt.datetime(2026, 9, 12))
    set_status("Dombivli", "TYPE2", "MAINTENANCE", dt.datetime(2026, 9, 24))
    set_status("Ghatkopar", "TYPE2", "OFFLINE", dt.datetime(2026, 8, 30), 0)
    set_status("Kharghar", "CHADEMO", "MAINTENANCE", dt.datetime(2026, 9, 28))
    amen = pd.DataFrame([dict(id=i + 1, name=n, icon=ic) for i, (n, ic) in enumerate(AMENITIES)])
    sad = pd.DataFrame(sa).drop_duplicates()
    return ops, stn, pts, amen, sad


# ---------------------------------------------------------------- weather & holidays
MONTH_CLIM = {  # month: (avg temp, monthly rain mm, wet-day prob)
    1: (24.5, 1, 0.02), 2: (25.5, 1, 0.02), 3: (28.0, 2, 0.03), 4: (30.0, 6, 0.04), 5: (31.0, 25, 0.08),
    6: (29.0, 520, 0.80), 7: (27.5, 840, 0.92), 8: (27.3, 580, 0.88), 9: (27.8, 360, 0.72), 10: (29.0, 80, 0.17),
    11: (28.0, 12, 0.05), 12: (25.5, 4, 0.03)}


def make_weather(rng):
    rows = []
    d = dt.date(2025, 10, 1)
    while d <= WEATHER_END:
        t, rain_m, p = MONTH_CLIM[d.month]
        dim = 31 if d.month in (1, 3, 5, 7, 8, 10, 12) else (30 if d.month != 2 else 28)
        rain = 0.0
        if rng.random() < p:
            mean_wet = max(rain_m / (p * dim), 1.5)
            rain = float(rng.gamma(0.6, mean_wet / 0.6))
            rain = min(rain, 280.0)
            if rain < 0.5:
                rain = 0.5
        temp = t + float(rng.normal(0, 1.0)) - (1.5 if rain > 5 else 0)
        if rain > 20:
            lab = "HEAVY_RAIN"
        elif rain >= 1:
            lab = "RAIN"
        else:
            cloudy = 0.75 if d.month in (6, 7, 8, 9) else (0.35 if d.month in (10, 5) else 0.12)
            lab = "CLOUDY" if rng.random() < cloudy else "CLEAR"
        rows.append(dict(weather_date=d, city="Mumbai", avg_temp_c=round(temp, 1), rainfall_mm=round(rain, 1), condition_label=lab))
        d += dt.timedelta(days=1)
    return pd.DataFrame(rows)


HOLIDAYS = [("2025-10-18", "Dhanteras", "FESTIVAL"), ("2025-10-21", "Diwali", "FESTIVAL"), ("2025-10-23", "Bhai Dooj", "FESTIVAL"),
            ("2025-12-25", "Christmas", "NATIONAL"), ("2026-01-01", "New Year's Day", "NATIONAL"),
            ("2026-01-26", "Republic Day", "NATIONAL"), ("2026-02-15", "Maha Shivratri", "FESTIVAL"), ("2026-03-04", "Holi", "FESTIVAL"),
            ("2026-03-19", "Gudi Padwa", "REGIONAL"), ("2026-03-21", "Eid-ul-Fitr", "FESTIVAL"), ("2026-03-26", "Ram Navami", "FESTIVAL"),
            ("2026-04-03", "Good Friday", "NATIONAL"), ("2026-05-01", "Maharashtra Day", "REGIONAL"),
            ("2026-05-27", "Bakri Eid", "FESTIVAL"), ("2026-06-26", "Muharram", "FESTIVAL"),
            ("2026-08-15", "Independence Day", "NATIONAL"), ("2026-09-14", "Ganesh Chaturthi", "REGIONAL"),
            ("2026-10-02", "Gandhi Jayanti", "NATIONAL")]


def make_holidays():
    return pd.DataFrame([dict(holiday_date=dt.date.fromisoformat(d), name=n, holiday_type=t) for d, n, t in HOLIDAYS])


FIRST = """Aarav Aditya Akash Amit Ankit Anil Arjun Arnav Aryan Ashok Bhavesh Chetan Deepak Dev Dhruv Gaurav Harsh Hemant Ishaan
Jay Kabir Karan Kunal Lalit Manish Mayur Mihir Mohit Nikhil Nilesh Omkar Pranav Pratik Rajesh Rohan Sachin Sagar Sameer Sanjay
Siddharth Suresh Tushar Uday Varun Vedant Vijay Vikram Vinay Yash Yogesh Zubin Abhishek Rakesh Prasad Ganesh Tanmay Shreyas
Priya Ananya Anjali Aditi Disha Divya Isha Kavya Kritika Meera Neha Nisha Pooja Pallavi Radhika Riya Rutuja Sakshi Sanya Shruti
Smita Swati Tanvi Trisha Vaishnavi Vidya Aishwarya Amruta Bhakti Chaitali Deepika Gayatri Hetal Jyoti Kiran Lata Madhuri Mansi
Mrunal Namrata Payal Rashmi Rekha Sapna Shweta Sonal Supriya Tejal Urvi Vrushali Zoya Farhan Imran Irfan Salman Rizwan Aisha Fatima
Sana Nazia Simran Harpreet Gurpreet Jasleen Manpreet Tarun Ritesh Kedar Nitin Parag Sandeep Rahul Sneha""".split()
LAST = """Mehta Nair Deshmukh Iyer Sharma Verma Patil Kulkarni Joshi Shah Desai Jain Gupta Agarwal Bansal Chavan Pawar Shinde More
Jadhav Gaikwad Sawant Kadam Mhatre Naik Rane Bhosale Salvi Thakur Yadav Singh Kapoor Malhotra Khanna Chopra Bhatia Sethi Menon
Pillai Reddy Rao Naidu Krishnan Subramanian Ramesh Banerjee Chatterjee Mukherjee Ghosh Das Bose Sen Dutta Khan Ansari Sheikh
Qureshi Siddiqui Fernandes D'Souza Pereira Gomes Rodrigues Mascarenhas Kamat Prabhu Shenoy Bhat Hegde Gokhale Apte Bhide Phadke
Ranade Joglekar Tendulkar Wagh Waghmare Surve Kamble Sonawane Gawde Parab Tawde Dalvi Shetty Poojary Kotian Lobo Dias Rego
Trivedi Pandya Modi Parekh Vyas Dave Bhatt Soni Mistry Kothari Chawla Arora Bajaj Tiwari Mishra Pandey Dubey Shukla Saxena
Srivastava Kaur Gill Sandhu""".split()
