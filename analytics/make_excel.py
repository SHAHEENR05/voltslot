"""Step 10 - data/VoltSlot_Synthetic_Data.xlsx (xlsxwriter).

Sheets: README, Data Dictionary, one sheet per table (password hashes -> ***), fact_session, forecast, segments, station_clusters, kpi_summary.
Org table standard: every sheet starts with a 'Sr No' column; header = bold, centred; numbers right-aligned, text left-aligned;
INR amounts in Indian digit grouping (Rs 12,34,567.00).
"""
import datetime as dt
import decimal
import numpy as np
import pandas as pd
import xlsxwriter
from common import *

TEAL = "#0F4C5C"
INR_FMT = '[>=10000000]"₹"##\\,##\\,##\\,##0.00;[>=100000]"₹"##\\,##\\,##0.00;"₹"##,##0.00'
INT_IN = '[>=10000000]##\\,##\\,##\\,##0;[>=100000]##\\,##\\,##0;##,##0'   # Indian grouping for counts
DT_FMT = "dd-mmm-yyyy hh:mm"
D_FMT = "dd-mmm-yyyy"
MONEY = {("bookings", "est_cost"), ("charging_sessions", "amount"), ("charging_sessions", "tariff"), ("payments", "amount"), ("payments", "refunded_amount"),
         ("wallets", "balance"), ("wallet_transactions", "amount"), ("wallet_transactions", "balance_after"), ("user_segments", "total_spend"),
         ("station_clusters", "revenue_12m"), ("charging_points", "tariff_per_kwh")}
ID_COLS = {"id", "booking_id", "user_id", "vehicle_id", "station_id", "operator_id", "fleet_id", "model_id", "wallet_id", "charging_point_id", "connector_type_id",
           "amenity_id", "vehicle_model_id", "promoted_booking_id", "preferred_station_id", "cluster_id", "hour_of_day", "day_of_week", "open_hour", "close_hour",
           "preferred_hour", "station_key", "user_key", "vehicle_key", "connector_key", "session_id", "date_key", "time_key", "pincode"}
FK = {"user_id": "users", "vehicle_id": "vehicles", "station_id": "stations", "booking_id": "bookings", "operator_id": "operators", "fleet_id": "fleets",
      "charging_point_id": "charging_points", "connector_type_id": "connector_types", "model_id": "vehicle_models", "amenity_id": "amenities",
      "wallet_id": "wallets", "vehicle_model_id": "vehicle_models", "promoted_booking_id": "bookings", "preferred_station_id": "stations"}
DESC = {
    "name": "Display name", "email": "Login e-mail (synthetic, @example.com except demo accounts)", "password_hash": "BCrypt hash (shown as *** in this workbook)",
    "phone": "Fake phone '+91 00000 xxxxx'", "role": "USER | OPERATOR | ADMIN | FLEET_MANAGER", "city": "City / area", "status": "Lifecycle status",
    "home_lat": "Home latitude (approx.)", "home_lon": "Home longitude (approx.)", "reminder_enabled": "1 = user wants recharge reminders",
    "reminder_lead_hours": "Hours before predicted due time to start reminding", "no_show_count": "Number of NO_SHOW bookings",
    "last_login_at": "Last login (IST)", "balance": "Wallet balance in INR", "txn_type": "TOPUP | DEBIT | REFUND | PENALTY", "amount": "Amount in INR",
    "balance_after": "Running wallet balance after this transaction (INR)", "reference": "Booking code or top-up reference",
    "code": "Short code", "display_name": "Human readable name", "current_type": "AC | DC", "typical_kw": "Typical power (kW)", "make": "Manufacturer",
    "model": "Model name", "variant": "Variant", "category": "CAR | TWO_WHEELER | THREE_WHEELER | LCV", "battery_kwh": "Usable battery capacity (kWh)",
    "ac_max_kw": "Max AC charging power accepted (kW)", "dc_max_kw": "Max DC charging power accepted (kW)", "range_km": "Real-world range blend (km)",
    "km_per_kwh": "Efficiency (km per kWh)", "reg_number": "Registration number (synthetic)", "nickname": "Owner's nickname for the vehicle",
    "avg_daily_km": "Average daily distance (km)", "address": "Street address (invented)", "zone": "Locality / zone", "latitude": "Latitude (WGS84)",
    "longitude": "Longitude (WGS84)", "tier": "HUB | STANDARD", "open_hour": "Opening hour (0-24)", "close_hour": "Closing hour (0-24)",
    "uptime_pct": "Network uptime (%)", "avg_rating": "Average review rating (1-5)", "review_count": "Number of reviews", "sentiment_score": "Mean TextBlob polarity (-1..+1)",
    "reliability_score": "0.5*rating% + 0.3*sentiment% + 0.2*uptime (0-100)", "icon": "lucide-style icon name", "label": "Short label",
    "power_kw": "Rated power (kW)", "tariff_per_kwh": "Base tariff (INR per kWh)", "hour_of_day": "Hour 0-23", "band_name": "OFFPEAK | NORMAL | PEAK",
    "multiplier": "Tariff multiplier", "booking_code": "Unique booking reference (VSL-xxxxxx)", "start_time": "Slot start (IST)", "end_time": "Slot end (IST)",
    "slots": "Number of 30-minute slots (ceil(duration/30))", "source": "WEB | WALK_IN | FLEET | REMINDER | TRIP | WAITLIST", "soc_start": "State of charge at start (%)",
    "soc_target": "Target state of charge (%)", "est_energy_kwh": "Estimated energy from the estimator (kWh)", "est_cost": "Estimated cost (INR)",
    "hold_expires_at": "Hold expiry (created_at + 5 min) for EXPIRED holds", "checked_in_at": "Check-in time", "cancelled_at": "Cancellation time",
    "cancel_reason": "Free-text cancellation reason", "slot_start": "Start of the occupied 30-minute slot", "started_at": "Session start (IST)",
    "ended_at": "Session end (IST)", "energy_kwh": "Energy delivered (kWh, wall energy)", "soc_end": "State of charge at end (%)", "avg_kw": "Average charging power (kW)",
    "tariff": "Effective tariff incl. time-of-day multiplier (INR/kWh)", "co2_avoided_kg": "Tailpipe CO2 avoided (kg)", "method": "Payment method or model name",
    "invoice_no": "Invoice number INV-2526-nnnnnn", "refunded_amount": "Refunded part of the payment (INR)", "paid_at": "Payment timestamp",
    "rating": "Star rating 1-5", "comment": "Free-text review (synthetic template text)", "sentiment_label": "POSITIVE | NEUTRAL | NEGATIVE",
    "desired_start": "Start time the user wanted", "last_charge_at": "End of the last completed session", "median_interval_days": "Median days between recent sessions",
    "avg_energy_kwh": "Average energy per session (kWh)", "preferred_hour": "Most common start hour (last 10 sessions)", "sessions_used": "Completed sessions available",
    "confidence": "Prediction confidence 0-1", "next_due_at": "Predicted next recharge time", "type": "Notification type", "title": "Notification title",
    "message": "Notification text", "payload": "Small JSON string with ids", "is_read": "1 = read", "snoozed_until": "Snooze end", "day_of_week": "1=Mon .. 7=Sun",
    "expected_sessions": "Expected bookings starting in that hour", "crowding_index": "Percentile crowding 0-100 (>=65 HIGH)", "forecast_date": "Forecast date",
    "predicted_sessions": "Forecast daily sessions", "lower_bound": "95% lower bound", "upper_bound": "95% upper bound", "cluster_id": "K-Means cluster number",
    "segment_label": "Segment name from centroid rules", "sessions_12m": "Completed sessions in the last 12 months", "recency_days": "Days since last session",
    "night_share": "Share of sessions starting 22:00-05:59", "weekend_share": "Share of sessions on Sat/Sun", "total_spend": "Total spend (INR)",
    "cluster_label": "Station cluster name", "avg_daily_sessions": "Average sessions per day", "peak_crowding": "Maximum crowding index", "revenue_12m": "Revenue in 12 months (INR)",
    "recommendation": "Auto-generated recommendation", "session_key": "Journey id (one search-to-complete path)", "event_type": "SEARCH | VIEW_STATION | SELECT_SLOT | BOOK | CHECK_IN | COMPLETE",
    "event_time": "Event timestamp", "device": "MOBILE | DESKTOP | TABLET", "weather_date": "Date", "avg_temp_c": "Average temperature (C)", "rainfall_mm": "Rainfall (mm)",
    "condition_label": "CLEAR | CLOUDY | RAIN | HEAVY_RAIN", "holiday_date": "Date", "holiday_type": "NATIONAL | FESTIVAL | REGIONAL", "word": "Keyword", "freq": "Frequency in reviews",
    "brand_color": "Hex brand colour", "contact_email": "Support e-mail", "id": "Primary key", "created_at": "Row creation time (IST)", "updated_at": "Last update (IST)",
}


def describe(table, col, comment):
    if col in FK:
        return f"Foreign key to {FK[col]}.id"
    if col == "id":
        return "Primary key"
    if comment and col in ("status", "txn_type", "role", "source", "type", "event_type", "label", "band_name", "category", "tier", "current_type", "device",
                           "sentiment_label", "condition_label", "holiday_type", "method"):
        return comment.split("|")[0].strip() if "|" not in comment else comment
    if table == "payments" and col == "method":
        return "WALLET | UPI | CARD (simulated)"
    if table == "payments" and col == "status":
        return "PAID | REFUNDED | PART_REFUND | FAILED"
    if table in ("bookings",) and col == "status":
        return "HOLD | CONFIRMED | CHECKED_IN | COMPLETED | CANCELLED | NO_SHOW | EXPIRED"
    if table == "waitlist_entries" and col == "status":
        return "WAITING | PROMOTED | EXPIRED | CANCELLED"
    if table == "demand_forecast" and col == "method":
        return "Forecasting method name"
    if table == "network_forecast" and col == "zone":
        return "'ALL' = whole network, else zone name"
    if table in ("vehicle_models", "vehicles") and col == "model":
        return DESC["model"]
    return DESC.get(col) or comment or col.replace("_", " ").capitalize()


def ser(df):
    """Convert DB values to python types xlsxwriter understands."""
    df = df.copy()
    for c in df.columns:
        s = df[c]
        if s.dtype == object and s.notna().any():
            v = s.dropna().iloc[0]
            if isinstance(v, decimal.Decimal):
                df[c] = s.map(lambda x: None if x is None else float(x))
    return df


def write_sheet(wb, name, df, fmts, money=(), table=None, widths=None, note=None):
    ws = wb.add_worksheet(name[:31])
    cols = list(df.columns)
    ws.write(0, 0, "Sr No", fmts["hdr"])
    for j, c in enumerate(cols):
        ws.write(0, j + 1, c, fmts["hdr"])
    ws.set_row(0, 22)
    maxw = [len(str(c)) + 3 for c in cols]
    kinds = []
    for c in cols:
        s = df[c].dropna()
        v = s.iloc[0] if len(s) else None
        if isinstance(v, (pd.Timestamp, dt.datetime)):
            kinds.append("dt")
        elif isinstance(v, dt.date):
            kinds.append("d")
        elif isinstance(v, (int, float, decimal.Decimal, np.integer, np.floating)) and not isinstance(v, (bool, np.bool_)):
            if (table, c) in money or c in money:
                kinds.append("inr")
            elif c in ID_COLS or all(float(x).is_integer() for x in s.head(200)):
                kinds.append("id" if c in ID_COLS else "int")
            else:
                kinds.append("num")
        else:
            kinds.append("txt")
    vals = df.astype(object).where(df.notna(), None).values.tolist()
    for i, row in enumerate(vals, start=1):
        ws.write_number(i, 0, i, fmts["srno"])
        for j, v in enumerate(row):
            k = kinds[j]
            if v is None:
                ws.write_blank(i, j + 1, None)
                continue
            if k == "dt":
                ws.write_datetime(i, j + 1, pd.Timestamp(v).to_pydatetime(), fmts["dt"])
            elif k == "d":
                ws.write_datetime(i, j + 1, dt.datetime(v.year, v.month, v.day), fmts["d"])
            elif k == "inr":
                ws.write_number(i, j + 1, float(v), fmts["inr"])
            elif k == "id":
                ws.write_number(i, j + 1, float(v), fmts["id"])
            elif k == "int":
                ws.write_number(i, j + 1, float(v), fmts["int"])
            elif k == "num":
                ws.write_number(i, j + 1, float(v), fmts["num"])
            else:
                s = str(v)
                ws.write_string(i, j + 1, s, fmts["txt"])
                if i < 300:
                    maxw[j] = max(maxw[j], min(len(s) + 2, 60))
            if k in ("dt",):
                maxw[j] = max(maxw[j], 18)
            elif k in ("d",):
                maxw[j] = max(maxw[j], 13)
            elif k == "inr":
                maxw[j] = max(maxw[j], 16)
            elif i < 300:
                maxw[j] = max(maxw[j], min(len(str(v)) + 2, 24))
    ws.set_column(0, 0, 7)
    for j, w in enumerate(maxw):
        ws.set_column(j + 1, j + 1, (widths or {}).get(cols[j], w))
    ws.freeze_panes(1, 1)
    ws.autofilter(0, 0, max(len(df), 1), len(cols))
    return ws


def main():
    conn = get_conn()
    schema = schema_tables()
    out = DATA / "VoltSlot_Synthetic_Data.xlsx"
    wb = xlsxwriter.Workbook(str(out), {"nan_inf_to_errors": False, "default_date_format": D_FMT})
    base = {"font_name": "Calibri", "font_size": 10}
    fmts = dict(
        hdr=wb.add_format({**base, "bold": True, "font_color": "#FFFFFF", "bg_color": TEAL, "align": "center", "valign": "vcenter", "border": 1, "text_wrap": True}),
        srno=wb.add_format({**base, "align": "right"}), txt=wb.add_format({**base, "align": "left"}),
        id=wb.add_format({**base, "num_format": "0", "align": "right"}), int=wb.add_format({**base, "num_format": INT_IN, "align": "right"}),
        num=wb.add_format({**base, "num_format": "#,##0.00", "align": "right"}), inr=wb.add_format({**base, "num_format": INR_FMT, "align": "right"}),
        dt=wb.add_format({**base, "num_format": DT_FMT, "align": "right"}), d=wb.add_format({**base, "num_format": D_FMT, "align": "right"}),
        title=wb.add_format({"font_name": "Calibri", "font_size": 20, "bold": True, "font_color": TEAL}),
        h2=wb.add_format({"font_name": "Calibri", "font_size": 12, "bold": True, "font_color": TEAL}),
        wrap=wb.add_format({**base, "text_wrap": True, "valign": "top", "align": "left"}),
        warn=wb.add_format({**base, "bold": True, "font_color": "#9C2B2B", "text_wrap": True, "valign": "top"}))
    # ---------------- README (placeholder, filled after counts are known)
    readme = wb.add_worksheet("README")
    dd = wb.add_worksheet("Data Dictionary")
    counts = {}
    tabs = {}
    for t in TABLE_ORDER:
        df = ser(query(f"SELECT * FROM {t}", conn=conn))
        df = df[[c for c, _, _ in schema[t]]]
        if t == "users":
            df["password_hash"] = "***"
        counts[t] = len(df)
        tabs[t] = df
    # data dictionary
    dd.write_row(0, 0, ["Sr No", "Table", "Column", "Type", "Description"], fmts["hdr"])
    r = 1
    for t in TABLE_ORDER:
        for (c, ty, cm) in schema[t]:
            dd.write_number(r, 0, r, fmts["srno"])
            dd.write_string(r, 1, t, fmts["txt"])
            dd.write_string(r, 2, c, fmts["txt"])
            dd.write_string(r, 3, ty, fmts["txt"])
            dd.write_string(r, 4, describe(t, c, cm), fmts["txt"])
            r += 1
    dd.set_column(0, 0, 7); dd.set_column(1, 1, 26); dd.set_column(2, 2, 24); dd.set_column(3, 3, 14); dd.set_column(4, 4, 80)
    dd.freeze_panes(1, 1)
    dd.autofilter(0, 0, r - 1, 4)
    dd.write(r + 1, 1, "Note: 'Sr No' is a presentation serial number added to every sheet in this workbook; it is not a database column.", fmts["txt"])
    # table sheets
    for t in TABLE_ORDER:
        write_sheet(wb, t, tabs[t], fmts, MONEY, table=t)
    # ---------------- derived sheets
    fs = ser(query("""SELECT f.session_id, f.booking_id, d.full_date AS date, d.day_name, d.is_weekend, d.is_holiday, d.weather_label, f.time_key AS hour_of_day,
                      s.station_name, s.zone, s.tier, s.operator_name, c.code AS connector, v.make, v.model, v.category, f.source, f.energy_kwh, f.duration_min,
                      f.revenue, f.effective_tariff, f.lead_time_hours, f.soc_start, f.soc_end, f.co2_avoided_kg
                      FROM dw_fact_session f JOIN dw_dim_date d ON d.date_key=f.date_key JOIN dw_dim_station s ON s.station_key=f.station_key
                      JOIN dw_dim_connector c ON c.connector_key=f.connector_key JOIN dw_dim_vehicle v ON v.vehicle_key=f.vehicle_key ORDER BY f.session_id""", conn=conn))
    write_sheet(wb, "fact_session", fs, fmts, {"revenue", "effective_tariff"}, table="fact_session")
    nf = ser(query("SELECT forecast_date, zone, predicted_sessions, lower_bound, upper_bound, method FROM network_forecast ORDER BY zone, forecast_date", conn=conn))
    write_sheet(wb, "forecast", nf, fmts, table="forecast")
    sg = ser(query("""SELECT u.id AS user_id, u.full_name, u.email, g.cluster_id, g.segment_label, g.sessions_12m, g.avg_energy_kwh, g.recency_days, g.night_share,
                      g.weekend_share, g.total_spend FROM user_segments g JOIN users u ON u.id=g.user_id ORDER BY g.segment_label, g.total_spend DESC""", conn=conn))
    write_sheet(wb, "segments", sg, fmts, {"total_spend"}, table="segments")
    sc = ser(query("""SELECT s.id AS station_id, s.name AS station_name, s.zone, s.tier, c.cluster_id, c.cluster_label, c.avg_daily_sessions, c.peak_crowding, c.revenue_12m,
                      s.reliability_score, c.recommendation FROM station_clusters c JOIN stations s ON s.id=c.station_id ORDER BY c.cluster_label, c.revenue_12m DESC""", conn=conn))
    write_sheet(wb, "station_clusters_named", sc, fmts, {"revenue_12m"}, table="station_clusters")
    # kpi_summary with formulas
    km = ser(query("""SELECT d.month_key, COUNT(*) sessions, ROUND(SUM(f.energy_kwh),2) energy_kwh, ROUND(SUM(f.revenue),2) revenue
                      FROM dw_fact_session f JOIN dw_dim_date d ON d.date_key=f.date_key GROUP BY d.month_key ORDER BY d.month_key""", conn=conn))
    ws = wb.add_worksheet("kpi_summary")
    heads = ["Sr No", "Month", "Sessions", "Energy (kWh)", "Revenue (INR)", "Revenue per session (INR)", "kWh per session", "INR per kWh", "Sessions MoM %", "Cumulative revenue (INR)"]
    ws.write_row(0, 0, heads, fmts["hdr"])
    ws.set_row(0, 32)
    pct = wb.add_format({**base, "num_format": "0.0%", "align": "right"})
    kwh = wb.add_format({**base, "num_format": "#,##0.00", "align": "right"})
    tot = {c: wb.add_format({**base, "bold": True, "top": 1, "align": "right", "num_format": f}) for c, f in
           (("inr", INR_FMT), ("int", INT_IN), ("kwh", "#,##0.00"), ("txt", "@"))}
    cum = 0.0
    n = len(km)
    for i, row in enumerate(km.itertuples(index=False), start=1):
        x = i + 1
        ws.write_number(i, 0, i, fmts["srno"])
        ws.write_string(i, 1, row.month_key + (" (partial)" if row.month_key == "2026-10" else ""), fmts["txt"])
        ws.write_number(i, 2, row.sessions, fmts["int"])
        ws.write_number(i, 3, row.energy_kwh, kwh)
        ws.write_number(i, 4, row.revenue, fmts["inr"])
        ws.write_formula(i, 5, f"=E{x}/C{x}", fmts["inr"], row.revenue / row.sessions)
        ws.write_formula(i, 6, f"=D{x}/C{x}", kwh, row.energy_kwh / row.sessions)
        ws.write_formula(i, 7, f"=E{x}/D{x}", fmts["inr"], row.revenue / row.energy_kwh)
        if i == 1:
            ws.write_string(i, 8, "n/a", fmts["txt"])
        else:
            prev = km.sessions.iloc[i - 2]
            ws.write_formula(i, 8, f"=C{x}/C{x - 1}-1", pct, row.sessions / prev - 1)
        cum += row.revenue
        ws.write_formula(i, 9, f"=SUM($E$2:E{x})", fmts["inr"], cum)
    t = n + 1
    ws.write_string(t, 0, "", tot["txt"]); ws.write_string(t, 1, "Total", tot["txt"])
    ws.write_formula(t, 2, f"=SUM(C2:C{t})", tot["int"], int(km.sessions.sum()))
    ws.write_formula(t, 3, f"=SUM(D2:D{t})", tot["kwh"], float(km.energy_kwh.sum()))
    ws.write_formula(t, 4, f"=SUM(E2:E{t})", tot["inr"], float(km.revenue.sum()))
    ws.write_formula(t, 5, f"=E{t + 1}/C{t + 1}", tot["inr"], float(km.revenue.sum() / km.sessions.sum()))
    ws.write_formula(t, 6, f"=D{t + 1}/C{t + 1}", tot["kwh"], float(km.energy_kwh.sum() / km.sessions.sum()))
    ws.write_formula(t, 7, f"=E{t + 1}/D{t + 1}", tot["inr"], float(km.revenue.sum() / km.energy_kwh.sum()))
    ws.set_column(0, 0, 7); ws.set_column(1, 1, 16); ws.set_column(2, 9, 17)
    ws.freeze_panes(1, 1)
    ch = wb.add_chart({"type": "column"})
    ch.add_series({"name": "Sessions", "categories": f"=kpi_summary!$B$2:$B${n}", "values": f"=kpi_summary!$C$2:$C${n}", "fill": {"color": "#3987e5"}})
    ch.set_title({"name": "Monthly sessions"}); ch.set_legend({"none": True})
    ws.insert_chart(t + 3, 1, ch, {"x_scale": 1.6, "y_scale": 1.1})
    # ---------------- README
    readme.hide_gridlines(2)
    readme.set_column(0, 0, 7); readme.set_column(1, 1, 30); readme.set_column(2, 2, 16); readme.set_column(3, 3, 70)
    readme.write(0, 1, "VoltSlot - Synthetic Data Workbook", fmts["title"])
    readme.merge_range(2, 1, 2, 3, "SYNTHETIC DATA DISCLAIMER: every record in this workbook is simulated for a college project (TCET IT: PBL + IP + PS-IV). No real people, "
                       "vehicles, bookings, payments, reviews or charging stations are represented; names, e-mails and phones are fictional, operators are fictional, vehicle "
                       "specifications are approximate public figures used for simulation only.", fmts["warn"])
    readme.set_row(2, 62)
    info = [("Project", "VoltSlot - Smart EV Charging Station Locator & Slot Booking System (Mumbai Metropolitan Region)"),
            ("Generated on", dt.datetime.now().strftime("%d-%b-%Y %H:%M")), ("Random seed", "42 (numpy default_rng); fully reproducible with python analytics/run_all.py"),
            ("Demo clock (NOW)", "03-Oct-2026 09:30 IST (Saturday); history 01-Oct-2025 to 03-Oct-2026 09:29; upcoming bookings to 10-Oct-2026"),
            ("Currency / time zone", "INR; amounts in Indian digit grouping; all timestamps naive Asia/Kolkata local time"),
            ("How it maps to the DB", "One sheet per MySQL table of db/01_schema.sql (same column order; password hashes replaced by ***). The same rows are loaded into MySQL by "
                                      "analytics/load_to_mysql.py. Derived sheets: fact_session (star-schema join), forecast, segments, station_clusters, kpi_summary (formulas)."),
            ("Added column", "'Sr No' on every sheet is a presentation serial number, not a DB column.")]
    for i, (k, v) in enumerate(info):
        readme.write(4 + i, 1, k, fmts["h2"])
        readme.merge_range(4 + i, 2, 4 + i, 3, v, fmts["wrap"])
        readme.set_row(4 + i, 32 if len(v) > 80 else 18)
    r0 = 4 + len(info) + 1
    readme.write(r0, 1, "Table list and row counts", fmts["h2"])
    readme.write_row(r0 + 1, 0, ["Sr No", "Sheet / table", "Rows", "Notes"], fmts["hdr"])
    notes = {"bookings": "history + upcoming (CONFIRMED / CHECKED_IN after 03-Oct-2026 09:30)", "booking_slots": "one row per occupied 30-min slot; UNIQUE (point, slot)",
             "charging_sessions": "one per COMPLETED booking", "funnel_events": "search-to-complete journeys incl. abandoned ones", "users": "656 incl. 7 demo accounts",
             "recharge_predictions": "algorithm in docs/spec/00_overview.md", "demand_forecast": "32 stations x 7 weekdays x 24 hours",
             "network_forecast": "Holt-Winters, 42 days, ALL + top-5 zones", "user_segments": "K-Means", "station_clusters": "K-Means",
             "sentiment_keywords": "TextBlob, own stop-words"}
    rr = r0 + 2
    sheets = [(t, counts[t], notes.get(t, "")) for t in TABLE_ORDER] + [("fact_session", len(fs), "dw_fact_session joined to dimensions"), ("forecast", len(nf), "network_forecast"),
                                                                       ("segments", len(sg), "user_segments + user names"), ("station_clusters_named", len(sc), "with station names"),
                                                                       ("kpi_summary", n, "monthly KPIs with Excel formulas")]
    for i, (t, c, nt) in enumerate(sheets, start=1):
        readme.write_number(rr, 0, i, fmts["srno"])
        readme.write_string(rr, 1, t, fmts["txt"])
        readme.write_number(rr, 2, c, fmts["int"])
        readme.write_string(rr, 3, nt, fmts["txt"])
        rr += 1
    readme.activate()
    wb.close()
    conn.close()
    print(f"wrote {out} ({out.stat().st_size / 1e6:.1f} MB), {len(TABLE_ORDER) + 7} sheets")


if __name__ == "__main__":
    main()
