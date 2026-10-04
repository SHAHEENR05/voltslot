# VoltSlot – shared build specification (overview)

Project: **VoltSlot – Smart EV Charging Station Locator & Slot Booking System** (TCET IT, PBL + IP (Java FSD) + PS‑IV).
Team: 2 students. Must run on a student laptop: MySQL (Workbench) + Java 17+ + browser. Everything runs from `./mvnw spring-boot:run`;
the React UI is pre-built into `backend/src/main/resources/static`.

## Folder layout (all under /home/claude/chargeiq)
```
db/            01_schema.sql (CONTRACT – do not change without telling the architect), 04_warehouse.sql, 05_bi_queries.sql, chargeiq_full.sql (dump)
analytics/     Python: generate_data.py, clean_data.py, load_to_mysql.py, forecast.py, segmentation.py, sentiment.py, visual_report.py, reports/
data/          raw/ (dirty CSVs), clean/ (final CSVs), VoltSlot_Synthetic_Data.xlsx, DATA_REPORT.md
backend/       Spring Boot 3 (Maven) – the IP project
frontend/      React + Vite (dark theme) – built output copied into backend/src/main/resources/static
docs/          spec/, Postman collection, openapi.json, viva notes, README material
```

## Global conventions
* Time zone: **Asia/Kolkata**, all timestamps are naive local `DATETIME` (Java `LocalDateTime`). No UTC conversion anywhere.
* **Demo clock anchor ("NOW") = 2026-10-03 09:30 (Saturday)**. History window = 2025-10-01 00:00 → 2026-10-03 09:29.
  Upcoming (future) bookings = after NOW up to 2026-10-10.
* Currency ₹ (INR). In UI use Indian grouping (₹1,25,000).
* Slots: 30 minutes. Booking `start_time` is always on the :00/:30 grid; `end_time = start_time + slots*30min`.
* Booking statuses: `HOLD, CONFIRMED, CHECKED_IN, COMPLETED, CANCELLED, NO_SHOW, EXPIRED`.
  A booking occupies rows in `booking_slots` unless status is `CANCELLED` or `EXPIRED`.
* Roles: `USER, OPERATOR, ADMIN, FLEET_MANAGER`.
* Passwords: BCrypt. Demo accounts (exact):

| email | password | role | notes |
|---|---|---|---|
| admin@voltslot.in | Admin@123 | ADMIN | |
| operator@voltslot.in | Operator@123 | OPERATOR | operator "VoltGrid" |
| fleet@voltslot.in | Fleet@123 | FLEET_MANAGER | fleet "SwiftLogix Deliveries", 12 LCV/3W vehicles |
| demo@voltslot.in | User@123 | USER | "Aarav Mehta", Thane, Tata Nexon EV (+ Ather 450X); daily commuter, charging cadence ≈ 6 days; **recharge reminder is ACTIVE at NOW** |
| priya@voltslot.in | User@123 | USER | "Priya Nair", Tata Punch EV, weekend explorer (cadence ≈ 14 d), next due ≈ 2026-10-05 |
| rahul@voltslot.in | User@123 | USER | "Rahul Deshmukh", MG ZS EV, night charger, **overdue** by ~1 day |
| sneha@voltslot.in | User@123 | USER | "Sneha Iyer", Ola S1 Pro (2‑wheeler, LECCS connector) |

All other synthetic users: password `User@123`.

## Master reference data (shared by data generator and backend tests)
Connector types (code → name, current, typical kW):
`CCS2` CCS Combo 2 DC 60 · `TYPE2` Type 2 AC 7.4 · `CHADEMO` CHAdeMO DC 50 · `LECCS` LECCS (Light EV) DC 3 · `BHARAT_DC` Bharat DC‑001 DC 15.

Pricing bands (hour → band, multiplier): hours 22,23,0‑5 → `OFFPEAK` 0.85 ; 6‑17 → `NORMAL` 1.00 ; 18‑21 → `PEAK` 1.20.

Estimator (used identically by Python generator and Java `EstimatorService`):
```
acceptedKw   = min(point.power_kw, vehicle.(point.current=='AC' ? ac_max_kw : dc_max_kw))      # 0 => incompatible
wallEnergy   = (socTarget-socStart)/100 * battery_kwh / 0.92                                    # 92% charging efficiency
# taper: up to 80% SoC at acceptedKw ; above 80% at 40% of acceptedKw
energy_to_80 = max(0, min(socTarget,80)-socStart)/100*battery_kwh/0.92
energy_above = max(0, socTarget-max(socStart,80))/100*battery_kwh/0.92
hours        = energy_to_80/acceptedKw + energy_above/(0.4*acceptedKw)
durationMin  = ceil(hours*60) + 3 (handshake) ; slots = ceil(durationMin/30)
effectiveTariff = point.tariff_per_kwh * multiplier(hour of start)
cost = round(wallEnergy * effectiveTariff, 2)
kmAdded = (socTarget-socStart)/100*battery_kwh*km_per_kwh
co2AvoidedKg (tailpipe only) = kmAdded * factor  (CAR .12, TWO_WHEELER .04, THREE_WHEELER .08, LCV .22)
```
Vehicle is compatible with a charging point when `vehicle_model_connectors` contains the point's connector AND acceptedKw > 0.

Recharge prediction algorithm (identical in Python seeding and Java `RechargePredictionService`):
```
sessions = vehicle's COMPLETED charging sessions ordered by started_at (use started_at)
need >= 3 sessions else no prediction (fallback in Java only: days = (range_km*0.6)/avg_daily_km)
intervals = day-differences (fractional days) between consecutive session starts, take the last 6
median_interval_days = median(intervals)
last_charge_at = ended_at of last session
next_due_at = last_charge_at + median_interval_days
cv = std(intervals)/mean(intervals) ; confidence = clamp(1-cv, 0.2, 0.95) * min(1, n_sessions/6)
preferred_hour = mode(start hour of last 10 sessions) ; preferred_station = mode(station of last 10 sessions)
avg_energy_kwh = mean energy of last 10 sessions
```
A reminder is *active* when `now >= next_due_at - user.reminder_lead_hours` and `now <= next_due_at + 72h`, the vehicle has no CONFIRMED/HOLD/CHECKED_IN booking in the future, and the user has reminders enabled.

Station reliability: `reliability = 0.5*(avg_rating/5*100) + 0.3*((sentiment+1)/2*100) + 0.2*uptime_pct` (0‑100).
Crowding level from `crowding_index`: `<35` LOW, `35‑64.99` MEDIUM, `>=65` HIGH.
