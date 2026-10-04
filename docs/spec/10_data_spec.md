# Synthetic data + analytics specification (Python)

Goal: PS‑IV needs a convincing analytics dataset of **6,000–10,000 records** with real, discoverable patterns, plus Python analytics
(cleaning, forecasting, K‑Means, sentiment, Matplotlib/Seaborn). The same data seeds the MySQL DB used by the Spring Boot app.
Everything must be **seeded/reproducible (seed 42)**, and clearly documented as **synthetic**.

## Volumes (targets)
| table | rows |
|---|---|
| operators | 8 fictional (VoltGrid, ChargeNest, AmpereHub, GreenPlug, UrjaCharge, ZapStation, MetroCharge, EcoJuice) |
| stations | 32 across Mumbai Metropolitan Region (8 `HUB` + 24 `STANDARD`), approx real locality centroids + small jitter |
| charging_points | ≈ 100 (hub 4‑6 each, standard 2‑3 each) |
| users | ≈ 656: 640 USER, 6 FLEET_MANAGER, 8 OPERATOR (1 per operator), 2 ADMIN + demo accounts (see 00_overview) |
| vehicles | ≈ 700 (≈ 50 are fleet vehicles in 6 fleets; demo fleet has 12) |
| **bookings** | **history ≈ 9,200‑9,500 + upcoming ≈ 250 = total must stay between 9,300 and 9,900** |
| charging_sessions | ≈ 7,300‑7,900 (COMPLETED bookings) |
| reviews | ≈ 1,700‑1,900 |
| funnel_events | ≈ 50k‑70k (≈ 12‑14k journeys) |
| weather_daily | 2025‑10‑01 … 2026‑10‑10 |
| holidays | ≈ 18 approximate Indian/Maharashtra holidays in window |
| demand_forecast | 32 × 7 × 24 = 5,376 |
| network_forecast | next 42 days for zone ALL + top‑5 zones |

Stations/zones (centroids, approx): Thane West (19.2183,72.9781) · Powai (19.1176,72.9060) · Andheri East (19.1136,72.8697) ·
BKC (19.0690,72.8680) · Lower Parel (18.9930,72.8300) · Worli (19.0176,72.8180) · Dadar (19.0178,72.8478) · Borivali (19.2307,72.8567) ·
Malad (19.1860,72.8480) · Goregaon (19.1663,72.8526) · Ghatkopar (19.0860,72.9080) · Mulund (19.1726,72.9425) · Chembur (19.0522,72.9005) ·
Vashi (19.0745,72.9978) · Nerul (19.0330,73.0297) · Kharghar (19.0474,73.0699) · Panvel (18.9894,73.1175) · Airport/Vile Parle (19.0990,72.8480) ·
Kalyan (19.2437,73.1355) · Dombivli (19.2183,73.0868).
HUB zones: BKC, Powai, Thane West, Lower Parel, Vashi, Andheri East, Airport, Kharghar. Realistic fictional names such as
"VoltGrid BKC Hub – G Block", addresses plausible but invented. Zone types: OFFICE (BKC, Powai, Lower Parel, Andheri East, Worli, Airport), RESIDENTIAL (Thane West,
Borivali, Malad, Goregaon, Ghatkopar, Mulund, Chembur, Dombivli, Kalyan, Kharghar, Nerul), TRANSIT (Dadar, Vashi, Panvel, Airport).
Point mix: AC `TYPE2` 7.4 kW (tariff ₹11‑13.5), `CCS2` 30/60/120 kW (₹16 / ₹18‑19 / ₹22‑24), `CHADEMO` 50 kW (₹17), `LECCS` 3.3 kW (₹9), `BHARAT_DC` 15 kW (₹13) rare.
Every station has at least one TYPE2 or CCS2; hubs have ≥1 CCS2 ≥60 kW and ≥1 LECCS. 3‑4 points currently MAINTENANCE/OFFLINE.
Amenities: Cafe, Restroom, Wi‑Fi, Covered Parking, Mall, Lounge, 24x7 Security, Snacks, EV Mechanic (icons = short lucide‑style names). 2‑6 per station.
Some stations (malls) open_hour=6/close_hour=23, the rest 0/24.
Vehicle models (approximate public specs, simulation only) — `make, model, category, battery_kwh, ac_max_kw, dc_max_kw, range_km (real-world blend), km_per_kwh, connectors`:
* Tata Nexon EV Long Range, CAR, 40.5, 7.2, 50, 330, 7.0, [CCS2, TYPE2]
* Tata Tiago EV, CAR, 24, 7.2, 25, 230, 8.0, [CCS2, TYPE2]
* Tata Punch EV, CAR, 35, 7.2, 50, 300, 7.5, [CCS2, TYPE2]
* MG ZS EV, CAR, 50.3, 7.4, 76, 350, 6.2, [CCS2, TYPE2, CHADEMO]
* MG Comet EV, CAR, 17.3, 3.3, 0, 180, 10.0, [TYPE2]
* Mahindra XUV400 EL, CAR, 39.4, 7.2, 50, 320, 7.5, [CCS2, TYPE2]
* Hyundai Kona Electric, CAR, 39.2, 7.2, 50, 300, 7.0, [CCS2, TYPE2, CHADEMO]
* BYD Atto 3, CAR, 60.5, 7.0, 88, 420, 6.0, [CCS2, TYPE2]
* Ather 450X, TWO_WHEELER, 3.7, 0, 3.0, 105, 28, [LECCS]
* Ola S1 Pro, TWO_WHEELER, 4.0, 0, 3.0, 120, 28, [LECCS]
* TVS iQube ST, TWO_WHEELER, 3.4, 0, 3.0, 100, 28, [LECCS]
* Tata Ace EV, LCV, 21.3, 3.3, 25, 150, 5.0, [CCS2, TYPE2]
* Mahindra Treo, THREE_WHEELER, 7.4, 0, 7.5, 120, 14, [LECCS, BHARAT_DC]
For 2/3-wheelers `ac_max_kw` is 0, so only DC-type points (`LECCS`, `BHARAT_DC`) are compatible (acceptedKw = min(point kW, dc_max_kw)).
Make sure enough LECCS points exist (≥ 1 at every hub, ≥ 6 across standard stations) and at least a few `BHARAT_DC` points exist.

## Behaviour model (what makes the data analyzable)
Personas for vehicle owners (target number of public‑charging bookings per year per vehicle):
* **Daily Commuter** ~100 users (35‑40/yr, cadence ≈ 7‑11 days, weekday, office+home zones, pref hours 9‑11 or 18‑21)
* **Fleet / Logistics** 50 vehicles (≈ 40/yr each, planned shifts: 05‑07h or 22‑01h and midday top‑ups, source FLEET, mostly DC at hubs/transit zones)
* **Weekend Explorer** ~120 users (10‑18/yr, cadence ≈ 14‑28 d, Sat/Sun 11‑17h, mall/hub stations, long durations)
* **Night Charger** ~90 users (12‑20/yr, AC chargers 22‑02h, residential zones; overnight 4‑7 h)
* **Occasional** ~270 users (2‑6/yr, random)
* **2‑wheeler/3‑wheeler** owners ~60 (frequent short LECCS sessions).
Inter‑arrival times: log‑normal around the persona cadence with ≈ 20 % CV so recharge prediction has signal.
Zone hour profiles: OFFICE weekday peaks 9‑11 and 13‑15 + 18‑20, weekend −25 %; RESIDENTIAL evening 19‑23 + morning 7‑9, weekend +15 %;
TRANSIT morning 6‑9 and late 21‑24. Monthly growth ≈ +2.5 %/month Oct→Sep. Festive (Diwali window Oct 17‑25 2025) +10 %.
Monsoon (Jun‑Sep) −7 %; days with rainfall > 20 mm −15 %; public holidays: OFFICE −30 %, RESIDENTIAL +10 %.
Booking lead time: 55 % WEB 1‑24 h ahead, 15 % WEB 1‑7 days, 10 % REMINDER (booked 2‑20 h after a reminder – lead 2‑20 h), 20 % WALK_IN logged by operator (lead 0, start snapped to 30‑min grid).
FLEET source: planned 12‑30 h ahead. Source ∈ `WEB, WALK_IN, FLEET, REMINDER, WAITLIST` (a few WAITLIST).
Slot conflict resolution during generation: preferred station/point busy → shift ±30‑90 min → alternative compatible station nearby →
otherwise the journey becomes an *abandoned funnel session* (drop at SELECT_SLOT). Peak hub hours therefore show real congestion.
Outcomes: COMPLETED ≈ 83 %, CANCELLED ≈ 8 %, NO_SHOW ≈ 5 %, EXPIRED ≈ 4 % (hold never confirmed; no slots, no payment).
Cancellations happen 10 min – 12 h before start (late <60 min ⇒ 50 % refund `PART_REFUND`, else full `REFUNDED`). NO_SHOW: payment row amount = 25 % of est_cost kept (status `PAID`).
SoC start 12‑45 % (commuter), 8‑30 % (fleet); target 80 % (DC) or 90‑100 % (AC); 10 % of sessions stop early. Session starts 0‑12 min after slot start.
Energy delivered = from estimator with soc_end; amount = energy × tariff × multiplier(start hour); `tariff` col = effective tariff.
Payments: WALLET 45 %, UPI 40 %, CARD 15 %; invoice `INV-2526-000123`. Wallet: every user gets a wallet; wallet_transactions consistent (TOPUP/DEBIT/REFUND/PENALTY, running balance never negative).
`bookings.created_at` = booked time (start − lead). `hold_expires_at` = created_at + 5 min for EXPIRED rows and for CONFIRMED rows it can stay NULL.
Upcoming bookings (≈ 250, status CONFIRMED, start after 2026‑10‑03 09:30 until 2026‑10‑10, plus 2 CHECKED_IN at NOW) must be concentrated on hubs' evening peaks so that some slots are fully booked (demo conflicts!).
The 7 demo accounts must exist exactly as described in 00_overview, with ≥ 30 completed sessions for demo@, a clear ≈6‑day cadence whose last session ended ≈ 2026‑09‑27 19:xx so that next_due ≈ 2026‑10‑03 19:xx
(reminder active at NOW with lead 24 h), 1 upcoming booking for demo@ on 2026‑10‑05 (so the reminder logic must still work: the reminder is about the *Nexon*; the upcoming booking is for the Ather),
wallet ₹1,250 for demo@, ≥3 reviews, 1 cancelled booking. priya@: next_due ≈ 2026‑10‑05 14:00. rahul@: next_due ≈ 2026‑10‑02 22:00.
Users’ emails `first.last##@example.com`; phones fake `+91 00000 xxxxx`; names realistic Indian first+last (≥ 100 distinct each).
`users.created_at` spread over 2025‑07 → 2026‑09 (no booking before signup); `last_login_at` plausible.

Reviews: ≈ 22 % of completed sessions; rating mean ≈ 4.1; station quality bias (3‑4 poor stations with low uptime and recurring complaints about broken connector/long wait).
Comment text from templates mixing clauses (charger speed, cleanliness, wait time, app/booking, pricing, parking, staff, connector fault, payment issues) → 8‑30 words, mixed‑sentiment included, rating/sentiment correlated but noisy.
Weather: Mumbai monthly climate (monsoon Jun‑Sep rainfall heavy, daily noise), `condition_label` CLEAR / CLOUDY / RAIN (1‑20 mm) / HEAVY_RAIN (>20 mm).
Holidays (approx dates): 2025‑10‑18 Dhanteras, 2025‑10‑21 Diwali, 2025‑10‑23 Bhai Dooj, 2025‑12‑25 Christmas, 2026‑01‑01 New Year, 2026‑01‑26 Republic Day,
2026‑02‑15 Maha Shivratri, 2026‑03‑04 Holi, 2026‑03‑19 Gudi Padwa, 2026‑03‑21 Eid‑ul‑Fitr, 2026‑03‑26 Ram Navami, 2026‑04‑03 Good Friday, 2026‑05‑01 Maharashtra Day,
2026‑05‑27 Bakri Eid, 2026‑06‑26 Muharram, 2026‑08‑15 Independence Day, 2026‑09‑14 Ganesh Chaturthi, 2026‑10‑02 Gandhi Jayanti.
Funnel: journeys for app‑sourced bookings (WEB, REMINDER, FLEET, WAITLIST; not WALK_IN) = SEARCH → VIEW_STATION → SELECT_SLOT → BOOK (→ CHECK_IN → COMPLETE per outcome),
plus ≈ 4,000 abandoned journeys (stop after SEARCH/VIEW/SELECT; abandonment ↑ with peak crowding; ≈ 15 % of SEARCH‑only journeys anonymous user_id NULL). EXPIRED holds reach SELECT_SLOT but have no BOOK event.
Devices MOBILE 68 / DESKTOP 27 / TABLET 5. Event times: SEARCH 2‑20 min before the BOOK etc.

## Pipeline & files to deliver
1. `analytics/generate_data.py` → writes **clean CSVs** in `data/clean/` (one per table, column order = schema) and the **dirty raw** extracts in `data/raw/`
   (bookings_raw, sessions_raw, users_raw, stations_raw, reviews_raw) with injected defects: 1‑2 % duplicate rows, 2‑4 % missing values, mixed date formats (ISO vs DD/MM/YYYY), inconsistent
   categorical spellings (`ccs2`/`CCS-2`/`Ccs 2`, `completed `/`COMPLETE`), trailing spaces, phone format variants, a few swapped lat/lon, negative / 10× outlier energy values, "N/A"/"-" tokens.
2. `analytics/clean_data.py` → cleans the raw files with Pandas (PS experiment: data cleaning), writes a **cleaning log** (`data/cleaning_log.csv`: issue type, column, rows fixed) and
   verifies that cleaned output matches `data/clean` (report match %).
3. `analytics/load_to_mysql.py` → loads clean CSVs into MySQL in FK‑safe order (pymysql, executemany batches, args `--host --port --user --password --db`; defaults 127.0.0.1/3306/root/root/chargeiq). Truncates first.
   bcrypt password hashes are generated once per demo password (the rest reuse one hash for `User@123`).
4. `analytics/sentiment.py` (TextBlob polarity; label POSITIVE ≥ 0.15, NEGATIVE ≤ −0.05 else NEUTRAL – tune so ≈ 70/15/15 split; update `reviews`, station aggregates, `reliability_score`, `sentiment_keywords` with own stop‑word list; no NLTK downloads).
5. `analytics/forecast.py` → (a) `network_forecast`: Holt‑Winters (statsmodels, additive trend damped + weekly seasonality) daily sessions, next 42 days from 2026‑10‑03, zone ALL + top 5 zones, 95 % bounds;
   backtest last 28 days vs seasonal‑naive and 7‑day MA → `analytics/reports/forecast_eval.csv` (MAE, RMSE, MAPE). (b) `demand_forecast`: per station × weekday × hour expected starts from the last 26 weeks,
   recency‑weighted, with ±1 hour smoothing and growth adjustment; `crowding_index` = percentile rank (0‑100) of `expected_sessions / num_points` across all cells **but** map cells with zero expected demand to 0; ensure
   hub evening peaks reach ≥ 65 (HIGH) and typical off‑peak is < 35.
6. `analytics/segmentation.py` → K‑Means on users (features: sessions_12m, avg_energy_kwh, recency_days, night_share, weekend_share, total_spend; StandardScaler; choose k by silhouette in 3..7 (plot saved), final labels from centroid rules:
   "Daily Commuters", "Fleet & Logistics", "Night Chargers", "Weekend Explorers", "Occasional Chargers" (adapt if k differs) → `user_segments`. K‑Means on stations → `station_clusters` with labels
   "High‑demand hub", "Steady performer", "Under‑utilised", "Emerging" and a `recommendation` sentence (e.g. "Add 2 DC fast points – peak crowding 78 %").
7. `recharge_predictions` table filled with the algorithm in 00_overview for every vehicle with ≥ 3 sessions (Python), `pricing_bands`, `holidays`, `weather_daily`, `connector_types`, … – every table in the schema must be populated (waitlist_entries: ≈ 25 rows mixed statuses incl. 3 WAITING
   for upcoming windows; notifications: ≈ 150 mixed historical read notifications – DO NOT create RECHARGE_REMINDER rows, the Java app generates those on startup).
8. After loading: `CALL sp_refresh_warehouse();` (db/04_warehouse.sql already loaded) and verify dw counts.
9. `analytics/visual_report.py` (Matplotlib + Seaborn, dark style, saved to `analytics/reports/*.png`, ≥ 14 charts: hourly×weekday heatmap, monthly sessions + forecast, KDE of energy by connector, boxplot duration by vehicle category,
   correlation heatmap, rain vs sessions scatter/regression, segment scatter, funnel, station utilisation bar, sentiment distribution, lead‑time histogram, revenue by zone, cohort retention heatmap, pairplot sample).
   Also a Jupyter notebook `analytics/VoltSlot_Analytics.ipynb` (executed with outputs, if nbformat/nbconvert installable) – narrative cells referencing PS‑IV concepts.
10. `data/VoltSlot_Synthetic_Data.xlsx` (xlsxwriter): first sheet "README" (what it is, synthetic disclaimer, generation date/seed, table list with row counts, how it maps to the DB), sheet "Data Dictionary"
   (table, column, type, description), then one sheet per table (password hashes replaced by "***"), frozen header row, autofilter, sensible widths, header colour dark teal with white bold text, number formats (₹ amounts with 2 decimals, dates `dd-mmm-yyyy hh:mm`),
   plus sheets: `fact_session`, `forecast`, `segments`, `station_clusters`, `kpi_summary` (monthly KPIs with formulas where sensible). Also copy all clean CSVs to data/clean/.
11. `db/chargeiq_full.sql` = `mysqldump --routines --databases chargeiq --no-tablespaces --set-gtid-purged=OFF --skip-lock-tables` of the final database (must restore cleanly into an empty MySQL 8 with `mysql < chargeiq_full.sql`), and `db/05_bi_queries.sql` (≥ 15 commented analytical queries on dw_ tables:
   roll‑up with `WITH ROLLUP`, window functions (RANK, LAG, running total, moving average), CASE pivots, top‑N per zone, cohort retention, funnel conversion, peak‑hour analysis, etc.).
12. `data/DATA_REPORT.md` with the verification results (row counts per table, bookings by status, monthly sessions & revenue, utilisation, peak crowding stats, missing/duplicate checks, distribution sanity) and
   `analytics/verify_data.py` that asserts: no overlapping slots per point, FK integrity, bookings 9,300‑9,900, start times on 30‑min grid, session ≤ booking window, wallet balances ≥ 0, every vehicle model has ≥1 connector, etc.
All scripts must run end‑to‑end with one command: `python analytics/run_all.py` (documented in `analytics/README.md`).

DB used by the data pipeline: MySQL on 127.0.0.1:3306, user root / password root, database `chargeiq` (schema already created from db/01_schema.sql, warehouse from db/04_warehouse.sql).
