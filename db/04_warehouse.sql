-- =====================================================================
--  04_warehouse.sql  -  Star-schema data warehouse + BI views (PS-IV)
--  Natural ids are used as dimension keys to keep the model small.
--  Rebuild any time with:  CALL sp_refresh_warehouse();
-- =====================================================================
USE chargeiq;

DROP VIEW IF EXISTS v_daily_kpis, v_station_performance, v_zone_summary, v_hourly_heatmap, v_funnel_summary, v_segment_summary;
DROP TABLE IF EXISTS dw_fact_session, dw_fact_booking, dw_dim_date, dw_dim_time, dw_dim_station, dw_dim_user, dw_dim_vehicle, dw_dim_connector;
DROP PROCEDURE IF EXISTS sp_refresh_warehouse;

CREATE TABLE dw_dim_date (
  date_key      INT PRIMARY KEY,               -- yyyymmdd
  full_date     DATE NOT NULL,
  day_of_month  INT NOT NULL,
  month_num     INT NOT NULL,
  month_name    VARCHAR(10) NOT NULL,
  month_key     VARCHAR(7)  NOT NULL,          -- yyyy-mm
  quarter_num   INT NOT NULL,
  year_num      INT NOT NULL,
  day_of_week   INT NOT NULL,                  -- 1=Mon .. 7=Sun
  day_name      VARCHAR(10) NOT NULL,
  week_of_year  INT NOT NULL,
  is_weekend    TINYINT(1) NOT NULL,
  is_holiday    TINYINT(1) NOT NULL,
  holiday_name  VARCHAR(60) NULL,
  rainfall_mm   DOUBLE NULL,
  avg_temp_c    DOUBLE NULL,
  weather_label VARCHAR(16) NULL,
  INDEX idx_dd_date (full_date)
) ENGINE=InnoDB;

CREATE TABLE dw_dim_time (
  time_key     INT PRIMARY KEY,                -- hour 0..23
  hour_label   VARCHAR(8)  NOT NULL,
  day_part     VARCHAR(10) NOT NULL,           -- NIGHT | MORNING | AFTERNOON | EVENING | LATE
  pricing_band VARCHAR(10) NOT NULL,
  multiplier   DECIMAL(4,2) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE dw_dim_station (
  station_key  BIGINT PRIMARY KEY,
  station_name VARCHAR(100) NOT NULL,
  zone         VARCHAR(40)  NOT NULL,
  city         VARCHAR(40)  NOT NULL,
  operator_id  BIGINT NOT NULL,
  operator_name VARCHAR(80) NOT NULL,
  tier         VARCHAR(10) NOT NULL,
  num_points   INT NOT NULL,
  max_kw       DOUBLE NOT NULL,
  latitude     DOUBLE NOT NULL,
  longitude    DOUBLE NOT NULL
) ENGINE=InnoDB;

CREATE TABLE dw_dim_user (
  user_key     BIGINT PRIMARY KEY,
  role         VARCHAR(20) NOT NULL,
  city         VARCHAR(40),
  signup_month VARCHAR(7) NOT NULL,
  segment      VARCHAR(40) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE dw_dim_vehicle (
  vehicle_key BIGINT PRIMARY KEY,
  make        VARCHAR(40) NOT NULL,
  model       VARCHAR(60) NOT NULL,
  category    VARCHAR(14) NOT NULL,
  battery_kwh DOUBLE NOT NULL,
  is_fleet    TINYINT(1) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE dw_dim_connector (
  connector_key BIGINT PRIMARY KEY,
  code          VARCHAR(20) NOT NULL,
  current_type  VARCHAR(2)  NOT NULL
) ENGINE=InnoDB;

CREATE TABLE dw_fact_booking (
  booking_id      BIGINT PRIMARY KEY,
  date_key        INT NOT NULL,
  time_key        INT NOT NULL,
  station_key     BIGINT NOT NULL,
  user_key        BIGINT NOT NULL,
  vehicle_key     BIGINT NOT NULL,
  connector_key   BIGINT NOT NULL,
  status          VARCHAR(12) NOT NULL,
  source          VARCHAR(12) NOT NULL,
  lead_time_hours DOUBLE NOT NULL,
  slots           INT NOT NULL,
  est_revenue     DECIMAL(10,2) NOT NULL,
  INDEX idx_fb_date (date_key), INDEX idx_fb_station (station_key), INDEX idx_fb_status (status)
) ENGINE=InnoDB;

CREATE TABLE dw_fact_session (
  session_id      BIGINT PRIMARY KEY,
  booking_id      BIGINT NOT NULL,
  date_key        INT NOT NULL,
  time_key        INT NOT NULL,
  station_key     BIGINT NOT NULL,
  user_key        BIGINT NOT NULL,
  vehicle_key     BIGINT NOT NULL,
  connector_key   BIGINT NOT NULL,
  source          VARCHAR(12) NOT NULL,
  energy_kwh      DOUBLE NOT NULL,
  duration_min    INT NOT NULL,
  revenue         DECIMAL(10,2) NOT NULL,
  effective_tariff DECIMAL(6,2) NOT NULL,
  lead_time_hours DOUBLE NOT NULL,
  soc_start       INT NOT NULL,
  soc_end         INT NOT NULL,
  co2_avoided_kg  DOUBLE NOT NULL,
  INDEX idx_fs_date (date_key), INDEX idx_fs_station (station_key), INDEX idx_fs_user (user_key), INDEX idx_fs_time (time_key)
) ENGINE=InnoDB;

DELIMITER $$
CREATE PROCEDURE sp_refresh_warehouse()
BEGIN
  SET SESSION cte_max_recursion_depth = 5000;

  TRUNCATE TABLE dw_fact_session;
  TRUNCATE TABLE dw_fact_booking;
  TRUNCATE TABLE dw_dim_date;
  TRUNCATE TABLE dw_dim_time;
  TRUNCATE TABLE dw_dim_station;
  TRUNCATE TABLE dw_dim_user;
  TRUNCATE TABLE dw_dim_vehicle;
  TRUNCATE TABLE dw_dim_connector;

  -- Date dimension (calendar + holiday + weather integration, PS experiment: multiple data sources)
  INSERT INTO dw_dim_date
  WITH RECURSIVE d AS (
    SELECT DATE('2025-10-01') AS dt
    UNION ALL SELECT dt + INTERVAL 1 DAY FROM d WHERE dt < DATE('2026-12-31')
  )
  SELECT CAST(DATE_FORMAT(d.dt,'%Y%m%d') AS UNSIGNED), d.dt, DAY(d.dt), MONTH(d.dt), MONTHNAME(d.dt),
         DATE_FORMAT(d.dt,'%Y-%m'), QUARTER(d.dt), YEAR(d.dt), WEEKDAY(d.dt)+1, DAYNAME(d.dt), WEEK(d.dt,3),
         IF(WEEKDAY(d.dt)>=5,1,0), IF(h.holiday_date IS NULL,0,1), h.name,
         w.rainfall_mm, w.avg_temp_c, w.condition_label
  FROM d
  LEFT JOIN holidays h      ON h.holiday_date = d.dt
  LEFT JOIN weather_daily w ON w.weather_date = d.dt;

  INSERT INTO dw_dim_time
  SELECT pb.hour_of_day,
         CONCAT(LPAD(pb.hour_of_day,2,'0'),':00'),
         CASE WHEN pb.hour_of_day BETWEEN 0 AND 5 THEN 'NIGHT'
              WHEN pb.hour_of_day BETWEEN 6 AND 11 THEN 'MORNING'
              WHEN pb.hour_of_day BETWEEN 12 AND 16 THEN 'AFTERNOON'
              WHEN pb.hour_of_day BETWEEN 17 AND 21 THEN 'EVENING' ELSE 'LATE' END,
         pb.band_name, pb.multiplier
  FROM pricing_bands pb;

  INSERT INTO dw_dim_station
  SELECT s.id, s.name, s.zone, s.city, o.id, o.name, s.tier,
         COUNT(cp.id), COALESCE(MAX(cp.power_kw),0), s.latitude, s.longitude
  FROM stations s JOIN operators o ON o.id = s.operator_id
  LEFT JOIN charging_points cp ON cp.station_id = s.id
  GROUP BY s.id, s.name, s.zone, s.city, o.id, o.name, s.tier, s.latitude, s.longitude;

  INSERT INTO dw_dim_user
  SELECT u.id, u.role, u.city, DATE_FORMAT(u.created_at,'%Y-%m'), COALESCE(us.segment_label,'Unsegmented')
  FROM users u LEFT JOIN user_segments us ON us.user_id = u.id;

  INSERT INTO dw_dim_vehicle
  SELECT v.id, m.make, m.model, m.category, m.battery_kwh, IF(v.fleet_id IS NULL,0,1)
  FROM vehicles v JOIN vehicle_models m ON m.id = v.model_id;

  INSERT INTO dw_dim_connector SELECT id, code, current_type FROM connector_types;

  INSERT INTO dw_fact_booking
  SELECT b.id, CAST(DATE_FORMAT(b.start_time,'%Y%m%d') AS UNSIGNED), HOUR(b.start_time), b.station_id, b.user_id,
         b.vehicle_id, cp.connector_type_id, b.status, b.source,
         ROUND(GREATEST(TIMESTAMPDIFF(MINUTE, b.created_at, b.start_time),0)/60, 2), b.slots, b.est_cost
  FROM bookings b JOIN charging_points cp ON cp.id = b.charging_point_id;

  INSERT INTO dw_fact_session
  SELECT cs.id, cs.booking_id, CAST(DATE_FORMAT(cs.started_at,'%Y%m%d') AS UNSIGNED), HOUR(cs.started_at),
         b.station_id, b.user_id, b.vehicle_id, cp.connector_type_id, b.source, cs.energy_kwh,
         TIMESTAMPDIFF(MINUTE, cs.started_at, cs.ended_at), cs.amount, cs.tariff,
         ROUND(GREATEST(TIMESTAMPDIFF(MINUTE, b.created_at, b.start_time),0)/60, 2),
         cs.soc_start, cs.soc_end, cs.co2_avoided_kg
  FROM charging_sessions cs
  JOIN bookings b ON b.id = cs.booking_id
  JOIN charging_points cp ON cp.id = b.charging_point_id;
END$$
DELIMITER ;

-- ---------- BI views (point Metabase / Workbench at these) ----------
CREATE VIEW v_daily_kpis AS
SELECT d.full_date, d.day_name, d.is_weekend, d.is_holiday, d.weather_label, d.rainfall_mm,
       COUNT(f.session_id) AS sessions, ROUND(SUM(f.energy_kwh),1) AS energy_kwh,
       ROUND(SUM(f.revenue),2) AS revenue, ROUND(AVG(f.duration_min),1) AS avg_duration_min
FROM dw_dim_date d LEFT JOIN dw_fact_session f ON f.date_key = d.date_key
WHERE d.full_date <= '2026-10-02'
GROUP BY d.full_date, d.day_name, d.is_weekend, d.is_holiday, d.weather_label, d.rainfall_mm;

CREATE VIEW v_station_performance AS
SELECT s.station_key, s.station_name, s.zone, s.operator_name, s.tier, s.num_points,
       COUNT(f.session_id) AS sessions, ROUND(SUM(f.energy_kwh),1) AS energy_kwh, ROUND(SUM(f.revenue),2) AS revenue,
       ROUND(AVG(f.duration_min),1) AS avg_duration_min,
       ROUND(100*SUM(f.duration_min)/(s.num_points*365*24*60),2) AS utilization_pct
FROM dw_dim_station s LEFT JOIN dw_fact_session f ON f.station_key = s.station_key
GROUP BY s.station_key, s.station_name, s.zone, s.operator_name, s.tier, s.num_points;

CREATE VIEW v_zone_summary AS
SELECT s.zone, COUNT(DISTINCT s.station_key) AS stations, COUNT(f.session_id) AS sessions,
       ROUND(SUM(f.energy_kwh),1) AS energy_kwh, ROUND(SUM(f.revenue),2) AS revenue,
       AVG(s.latitude) AS latitude, AVG(s.longitude) AS longitude
FROM dw_dim_station s LEFT JOIN dw_fact_session f ON f.station_key = s.station_key
GROUP BY s.zone;

CREATE VIEW v_hourly_heatmap AS
SELECT d.day_of_week, d.day_name, f.time_key AS hour_of_day, COUNT(*) AS sessions, ROUND(SUM(f.revenue),2) AS revenue
FROM dw_fact_session f JOIN dw_dim_date d ON d.date_key = f.date_key
GROUP BY d.day_of_week, d.day_name, f.time_key;

CREATE VIEW v_funnel_summary AS
SELECT event_type,
       CASE event_type WHEN 'SEARCH' THEN 1 WHEN 'VIEW_STATION' THEN 2 WHEN 'SELECT_SLOT' THEN 3
                       WHEN 'BOOK' THEN 4 WHEN 'CHECK_IN' THEN 5 ELSE 6 END AS stage_no,
       COUNT(DISTINCT session_key) AS sessions
FROM funnel_events GROUP BY event_type;

CREATE VIEW v_segment_summary AS
SELECT segment_label, COUNT(*) AS users, ROUND(AVG(sessions_12m),1) AS avg_sessions,
       ROUND(AVG(avg_energy_kwh),1) AS avg_kwh, ROUND(SUM(total_spend),2) AS revenue
FROM user_segments GROUP BY segment_label;
