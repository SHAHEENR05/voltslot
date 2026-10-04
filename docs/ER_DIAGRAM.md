# VoltSlot - ER diagrams

Sources: `db/01_schema.sql` (operational) and `db/04_warehouse.sql` (warehouse). PNG copies (white background, readable in light and dark mode) are in `docs/img/`.
The operational database has 30 tables: 20 transactional/reference tables (diagram 1) and 10 analytics-output tables (diagram 2). The warehouse adds 8 `dw_` tables and 6 views.

## 1. Operational schema (transactional tables)

![Operational ER diagram](img/er_core.png)

```mermaid
erDiagram
    operators ||--o{ stations : "owns"
    operators ||--o{ users : "staff (OPERATOR role)"
    fleets ||--o{ users : "managers"
    fleets ||--o{ vehicles : "fleet vehicles"
    users ||--o{ vehicles : "owns"
    users ||--|| wallets : "has one"
    wallets ||--o{ wallet_transactions : "ledger"
    vehicle_models ||--o{ vehicles : "is a"
    vehicle_models ||--o{ vehicle_model_connectors : "accepts"
    connector_types ||--o{ vehicle_model_connectors : "fits"
    stations ||--o{ station_amenities : "offers"
    amenities ||--o{ station_amenities : "listed in"
    stations ||--o{ charging_points : "has"
    connector_types ||--o{ charging_points : "plug type"
    users ||--o{ bookings : "makes"
    vehicles ||--o{ bookings : "charges"
    charging_points ||--o{ bookings : "reserved"
    stations ||--o{ bookings : "at (denormalised)"
    bookings ||--o{ booking_slots : "occupies 30-min slots"
    charging_points ||--o{ booking_slots : "UNIQUE(point, slot_start)"
    bookings ||--o| charging_sessions : "produces"
    bookings ||--o| payments : "paid by"
    stations ||--o{ reviews : "reviewed"
    users ||--o{ reviews : "writes"
    bookings |o--o{ reviews : "optional link"
    users ||--o{ waitlist_entries : "waits"
    vehicles ||--o{ waitlist_entries : "for"
    stations ||--o{ waitlist_entries : "at"
    vehicles ||--o| recharge_predictions : "predicted for"
    users ||--o{ recharge_predictions : "owner"
    stations |o--o{ recharge_predictions : "preferred station"
    users ||--o{ notifications : "receives"

    operators { bigint id PK
      varchar name UK
      varchar contact_email }
    fleets { bigint id PK
      varchar name UK
      varchar city }
    users { bigint id PK
      varchar email UK
      varchar password_hash
      varchar role
      varchar status
      bigint operator_id FK
      bigint fleet_id FK
      boolean reminder_enabled
      int reminder_lead_hours }
    wallets { bigint id PK
      bigint user_id FK,UK
      decimal balance }
    wallet_transactions { bigint id PK
      bigint wallet_id FK
      varchar txn_type
      decimal amount
      decimal balance_after }
    connector_types { bigint id PK
      varchar code UK
      varchar current_type
      double typical_kw }
    vehicle_models { bigint id PK
      varchar make
      varchar model
      varchar category
      double battery_kwh
      double ac_max_kw
      double dc_max_kw }
    vehicle_model_connectors { bigint vehicle_model_id PK,FK
      bigint connector_type_id PK,FK }
    vehicles { bigint id PK
      bigint user_id FK
      bigint fleet_id FK
      bigint model_id FK
      varchar reg_number UK
      int avg_daily_km }
    stations { bigint id PK
      bigint operator_id FK
      varchar name
      varchar zone
      double latitude
      double longitude
      varchar tier
      int open_hour
      int close_hour
      double reliability_score }
    amenities { bigint id PK
      varchar name UK }
    station_amenities { bigint station_id PK,FK
      bigint amenity_id PK,FK }
    charging_points { bigint id PK
      bigint station_id FK
      bigint connector_type_id FK
      double power_kw
      decimal tariff_per_kwh
      varchar status }
    pricing_bands { int hour_of_day PK
      varchar band_name
      decimal multiplier }
    bookings { bigint id PK
      varchar booking_code UK
      bigint user_id FK
      bigint vehicle_id FK
      bigint charging_point_id FK
      bigint station_id FK
      datetime start_time
      datetime end_time
      varchar status
      varchar source
      decimal est_cost
      datetime hold_expires_at }
    booking_slots { bigint id PK
      bigint charging_point_id FK
      datetime slot_start
      bigint booking_id FK }
    charging_sessions { bigint id PK
      bigint booking_id FK,UK
      double energy_kwh
      decimal amount
      double co2_avoided_kg }
    payments { bigint id PK
      bigint booking_id FK,UK
      decimal amount
      varchar method
      varchar status
      varchar invoice_no UK }
    reviews { bigint id PK
      bigint station_id FK
      bigint user_id FK
      bigint booking_id FK
      int rating
      double sentiment_score
      varchar sentiment_label }
    waitlist_entries { bigint id PK
      bigint user_id FK
      bigint vehicle_id FK
      bigint station_id FK
      datetime desired_start
      varchar status }
    recharge_predictions { bigint id PK
      bigint vehicle_id FK,UK
      bigint user_id FK
      bigint preferred_station_id FK
      double median_interval_days
      double confidence
      datetime next_due_at }
    notifications { bigint id PK
      bigint user_id FK
      varchar type
      varchar status
      boolean is_read }
```

Notes
- `bookings.station_id` is deliberately denormalised (it equals the charging point's station) for fast station-level queries.
- `booking_slots` has one row per occupied 30-minute slot. `UNIQUE(charging_point_id, slot_start)` is the database-level guarantee against double booking.
- `users.operator_id` / `users.fleet_id` are nullable: only OPERATOR and FLEET_MANAGER users have them.
- Enumerations (role, status, source ...) are stored as `VARCHAR` and mapped with `@Enumerated(EnumType.STRING)`.

## 2. Analytics-output tables (written by Python, read by Spring Boot)

![Analytics tables](img/er_analytics.png)

```mermaid
erDiagram
    stations ||--o{ demand_forecast : "UNIQUE(station, weekday, hour)"
    stations ||--o| station_clusters : "K-Means label"
    users ||--o| user_segments : "K-Means label"
    stations { bigint id PK }
    users { bigint id PK }
    demand_forecast { bigint id PK
      bigint station_id FK
      int day_of_week
      int hour_of_day
      double expected_sessions
      double crowding_index }
    station_clusters { bigint station_id PK,FK
      int cluster_id
      varchar cluster_label
      decimal revenue_12m
      varchar recommendation }
    user_segments { bigint user_id PK,FK
      int cluster_id
      varchar segment_label
      int sessions_12m
      decimal total_spend }
    network_forecast { bigint id PK
      date forecast_date
      varchar zone
      double predicted_sessions
      double lower_bound
      double upper_bound }
    funnel_events { bigint id PK
      varchar session_key
      bigint user_id
      bigint station_id
      varchar event_type
      datetime event_time }
    weather_daily { date weather_date PK
      double rainfall_mm
      varchar condition_label }
    holidays { date holiday_date PK
      varchar name
      varchar holiday_type }
    sentiment_keywords { bigint id PK
      varchar label
      varchar word
      int freq }
```

`pricing_bands` (diagram 1) drives dynamic off-peak pricing. `weather_daily` and `holidays` are external sources joined into `dw_dim_date`.

## 3. Warehouse star schema

Two fact tables (`dw_fact_session`: one row per charging session, `dw_fact_booking`: one row per booking) share six conformed dimensions. Natural ids are used as dimension keys. Rebuild everything with `CALL sp_refresh_warehouse();` (or Admin console, "Refresh warehouse").

![Star schema](img/er_star.png)

```mermaid
erDiagram
    dw_dim_date ||--o{ dw_fact_session : date_key
    dw_dim_time ||--o{ dw_fact_session : "time_key (hour)"
    dw_dim_station ||--o{ dw_fact_session : station_key
    dw_dim_user ||--o{ dw_fact_session : user_key
    dw_dim_vehicle ||--o{ dw_fact_session : vehicle_key
    dw_dim_connector ||--o{ dw_fact_session : connector_key
    dw_dim_date ||--o{ dw_fact_booking : date_key
    dw_dim_time ||--o{ dw_fact_booking : time_key
    dw_dim_station ||--o{ dw_fact_booking : station_key
    dw_dim_user ||--o{ dw_fact_booking : user_key
    dw_dim_vehicle ||--o{ dw_fact_booking : vehicle_key
    dw_dim_connector ||--o{ dw_fact_booking : connector_key

    dw_fact_session { bigint session_id PK
      bigint booking_id
      int date_key FK
      int time_key FK
      bigint station_key FK
      bigint user_key FK
      bigint vehicle_key FK
      bigint connector_key FK
      varchar source
      double energy_kwh
      int duration_min
      decimal revenue
      decimal effective_tariff
      double lead_time_hours
      double co2_avoided_kg }
    dw_fact_booking { bigint booking_id PK
      int date_key FK
      int time_key FK
      bigint station_key FK
      bigint user_key FK
      bigint vehicle_key FK
      bigint connector_key FK
      varchar status
      varchar source
      double lead_time_hours
      int slots
      decimal est_revenue }
    dw_dim_date { int date_key PK
      date full_date
      varchar month_key
      int quarter_num
      int day_of_week
      boolean is_weekend
      boolean is_holiday
      double rainfall_mm
      varchar weather_label }
    dw_dim_time { int time_key PK
      varchar hour_label
      varchar day_part
      varchar pricing_band
      decimal multiplier }
    dw_dim_station { bigint station_key PK
      varchar station_name
      varchar zone
      varchar operator_name
      varchar tier
      int num_points
      double max_kw }
    dw_dim_user { bigint user_key PK
      varchar role
      varchar city
      varchar signup_month
      varchar segment }
    dw_dim_vehicle { bigint vehicle_key PK
      varchar make
      varchar model
      varchar category
      double battery_kwh
      boolean is_fleet }
    dw_dim_connector { bigint connector_key PK
      varchar code
      varchar current_type }
```

Views on top of the star schema (point Metabase or Workbench at them): `v_daily_kpis`, `v_station_performance`, `v_zone_summary`, `v_hourly_heatmap`, `v_funnel_summary`, `v_segment_summary`. Twenty ready-made analytic queries are in `db/05_bi_queries.sql`.

## 4. Relationship cheat sheet

<table>
<thead><tr><th style="text-align:center"><b>Sr No</b></th><th style="text-align:center"><b>Type</b></th><th style="text-align:center"><b>Tables</b></th><th style="text-align:center"><b>How it is enforced in SQL</b></th><th style="text-align:center"><b>JPA mapping (entity class)</b></th></tr></thead>
<tbody>
<tr><td style="text-align:right">1</td><td style="text-align:left;vertical-align:top">1-1</td><td style="text-align:left;vertical-align:top">users - wallets</td><td style="text-align:left;vertical-align:top"><code>wallets.user_id</code> UNIQUE NOT NULL</td><td style="text-align:left;vertical-align:top"><code>Wallet.user</code> @OneToOne</td></tr>
<tr><td style="text-align:right">2</td><td style="text-align:left;vertical-align:top">1-1</td><td style="text-align:left;vertical-align:top">bookings - charging_sessions</td><td style="text-align:left;vertical-align:top"><code>charging_sessions.booking_id</code> UNIQUE</td><td style="text-align:left;vertical-align:top"><code>ChargingSession.booking</code> @OneToOne</td></tr>
<tr><td style="text-align:right">3</td><td style="text-align:left;vertical-align:top">1-1</td><td style="text-align:left;vertical-align:top">bookings - payments</td><td style="text-align:left;vertical-align:top"><code>payments.booking_id</code> UNIQUE</td><td style="text-align:left;vertical-align:top"><code>Payment.booking</code> @OneToOne</td></tr>
<tr><td style="text-align:right">4</td><td style="text-align:left;vertical-align:top">1-1</td><td style="text-align:left;vertical-align:top">vehicles - recharge_predictions</td><td style="text-align:left;vertical-align:top"><code>recharge_predictions.vehicle_id</code> UNIQUE</td><td style="text-align:left;vertical-align:top"><code>RechargePrediction.vehicle</code> @OneToOne</td></tr>
<tr><td style="text-align:right">5</td><td style="text-align:left;vertical-align:top">1-N</td><td style="text-align:left;vertical-align:top">operators - stations</td><td style="text-align:left;vertical-align:top"><code>stations.operator_id</code> FK</td><td style="text-align:left;vertical-align:top"><code>Station.operator</code> @ManyToOne</td></tr>
<tr><td style="text-align:right">6</td><td style="text-align:left;vertical-align:top">1-N</td><td style="text-align:left;vertical-align:top">stations - charging_points</td><td style="text-align:left;vertical-align:top"><code>charging_points.station_id</code> FK</td><td style="text-align:left;vertical-align:top"><code>ChargingPoint.station</code> @ManyToOne</td></tr>
<tr><td style="text-align:right">7</td><td style="text-align:left;vertical-align:top">1-N</td><td style="text-align:left;vertical-align:top">charging_points - booking_slots</td><td style="text-align:left;vertical-align:top">FK + <code>UNIQUE(charging_point_id, slot_start)</code></td><td style="text-align:left;vertical-align:top"><code>BookingSlot.chargingPoint</code> @ManyToOne</td></tr>
<tr><td style="text-align:right">8</td><td style="text-align:left;vertical-align:top">1-N</td><td style="text-align:left;vertical-align:top">bookings - booking_slots</td><td style="text-align:left;vertical-align:top"><code>booking_slots.booking_id</code> FK, ON DELETE CASCADE</td><td style="text-align:left;vertical-align:top"><code>BookingSlot.booking</code> @ManyToOne</td></tr>
<tr><td style="text-align:right">9</td><td style="text-align:left;vertical-align:top">N-M</td><td style="text-align:left;vertical-align:top">vehicle_models - connector_types</td><td style="text-align:left;vertical-align:top">junction <code>vehicle_model_connectors</code></td><td style="text-align:left;vertical-align:top"><code>VehicleModel.connectors</code> @ManyToMany + @JoinTable</td></tr>
<tr><td style="text-align:right">10</td><td style="text-align:left;vertical-align:top">N-M</td><td style="text-align:left;vertical-align:top">stations - amenities</td><td style="text-align:left;vertical-align:top">junction <code>station_amenities</code></td><td style="text-align:left;vertical-align:top"><code>Station.amenities</code> @ManyToMany + @JoinTable</td></tr>
</tbody>
</table>

The entities map only the owning (FK) side; the "1" side of every 1-N relation is reached by repository queries instead of a `@OneToMany` collection (no lazy-loading surprises, `open-in-view=false`).

## 5. Regenerating the PNGs

```bash
npm install -g @mermaid-js/mermaid-cli
# puppeteer config: {"executablePath":"<path to chromium>","args":["--no-sandbox"]}
mmdc -p puppeteer.json -i docs/img/src/er_core.mmd -o docs/img/er_core.png -b white -s 2 -w 1800
```
