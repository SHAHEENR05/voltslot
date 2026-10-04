-- =====================================================================
--  05_bi_queries.sql  -  Analytical (BI / OLAP) queries on the VoltSlot star schema
--  Tables: dw_fact_session, dw_fact_booking, dw_dim_date, dw_dim_time, dw_dim_station, dw_dim_user, dw_dim_vehicle, dw_dim_connector
--  Refresh the warehouse first:  CALL sp_refresh_warehouse();
--  All data is SYNTHETIC. Money in INR. History window 2025-10-01 .. 2026-10-03 09:29 (demo clock 2026-10-03 09:30).
-- =====================================================================
USE chargeiq;

-- ---------------------------------------------------------------------
-- Q01  Monthly KPI roll-up with ROLLUP (sub-totals per quarter and grand total)
--      Concepts: star join, GROUP BY ... WITH ROLLUP
-- ---------------------------------------------------------------------
SELECT COALESCE(d.quarter_num, 'ALL') AS quarter_no, COALESCE(d.month_key, 'ALL') AS month_key,
       COUNT(*) AS sessions, ROUND(SUM(f.energy_kwh),1) AS energy_kwh, ROUND(SUM(f.revenue),2) AS revenue_inr
FROM dw_fact_session f JOIN dw_dim_date d ON d.date_key = f.date_key
GROUP BY d.quarter_num, d.month_key WITH ROLLUP;

-- ---------------------------------------------------------------------
-- Q02  Revenue by zone and station tier with ROLLUP (zone > tier)
-- ---------------------------------------------------------------------
SELECT COALESCE(s.zone,'ALL ZONES') AS zone, COALESCE(s.tier,'ALL TIERS') AS tier,
       COUNT(*) AS sessions, ROUND(SUM(f.revenue),2) AS revenue_inr, ROUND(SUM(f.revenue)/SUM(f.energy_kwh),2) AS inr_per_kwh
FROM dw_fact_session f JOIN dw_dim_station s ON s.station_key = f.station_key
GROUP BY s.zone, s.tier WITH ROLLUP;

-- ---------------------------------------------------------------------
-- Q03  RANK stations by revenue inside each operator (window function RANK + share of operator total)
-- ---------------------------------------------------------------------
SELECT operator_name, station_name, revenue_inr,
       RANK() OVER (PARTITION BY operator_name ORDER BY revenue_inr DESC) AS rank_in_operator,
       ROUND(100 * revenue_inr / SUM(revenue_inr) OVER (PARTITION BY operator_name), 1) AS pct_of_operator
FROM (SELECT s.operator_name, s.station_name, SUM(f.revenue) AS revenue_inr
      FROM dw_fact_session f JOIN dw_dim_station s ON s.station_key = f.station_key
      GROUP BY s.operator_name, s.station_name) x
ORDER BY operator_name, rank_in_operator;

-- ---------------------------------------------------------------------
-- Q04  Month-over-month growth with LAG and a 3-month moving average
-- ---------------------------------------------------------------------
WITH m AS (
  SELECT d.month_key, COUNT(*) AS sessions, SUM(f.revenue) AS revenue
  FROM dw_fact_session f JOIN dw_dim_date d ON d.date_key = f.date_key
  WHERE d.full_date < '2026-10-01'
  GROUP BY d.month_key)
SELECT month_key, sessions,
       LAG(sessions) OVER (ORDER BY month_key) AS prev_month,
       ROUND(100 * (sessions / LAG(sessions) OVER (ORDER BY month_key) - 1), 1) AS mom_growth_pct,
       ROUND(AVG(sessions) OVER (ORDER BY month_key ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), 1) AS moving_avg_3m,
       ROUND(SUM(revenue) OVER (ORDER BY month_key), 2) AS running_revenue_inr
FROM m ORDER BY month_key;

-- ---------------------------------------------------------------------
-- Q05  Daily sessions with 7-day moving average and running total (window frame)
-- ---------------------------------------------------------------------
SELECT full_date, sessions,
       ROUND(AVG(sessions) OVER (ORDER BY full_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW), 1) AS ma_7d,
       SUM(sessions) OVER (ORDER BY full_date) AS running_sessions
FROM v_daily_kpis
WHERE full_date >= '2026-08-01'
ORDER BY full_date;

-- ---------------------------------------------------------------------
-- Q06  Pivot with CASE: sessions by weekday (rows) x day-part (columns)
-- ---------------------------------------------------------------------
SELECT d.day_name,
       SUM(CASE WHEN t.day_part = 'NIGHT'     THEN 1 ELSE 0 END) AS night,
       SUM(CASE WHEN t.day_part = 'MORNING'   THEN 1 ELSE 0 END) AS morning,
       SUM(CASE WHEN t.day_part = 'AFTERNOON' THEN 1 ELSE 0 END) AS afternoon,
       SUM(CASE WHEN t.day_part = 'EVENING'   THEN 1 ELSE 0 END) AS evening,
       SUM(CASE WHEN t.day_part = 'LATE'      THEN 1 ELSE 0 END) AS late,
       COUNT(*) AS total
FROM dw_fact_session f JOIN dw_dim_date d ON d.date_key = f.date_key JOIN dw_dim_time t ON t.time_key = f.time_key
GROUP BY d.day_of_week, d.day_name ORDER BY d.day_of_week;

-- ---------------------------------------------------------------------
-- Q07  Peak-hour analysis: top 5 busiest hours of the week per tier (RANK inside tier)
-- ---------------------------------------------------------------------
SELECT * FROM (
  SELECT s.tier, d.day_name, t.hour_label, COUNT(*) AS sessions,
         RANK() OVER (PARTITION BY s.tier ORDER BY COUNT(*) DESC) AS rnk
  FROM dw_fact_session f JOIN dw_dim_station s ON s.station_key = f.station_key
  JOIN dw_dim_date d ON d.date_key = f.date_key JOIN dw_dim_time t ON t.time_key = f.time_key
  GROUP BY s.tier, d.day_of_week, d.day_name, t.hour_label) x
WHERE rnk <= 5 ORDER BY tier, rnk;

-- ---------------------------------------------------------------------
-- Q08  Top-3 stations per zone by sessions (top-N per group with ROW_NUMBER)
-- ---------------------------------------------------------------------
SELECT zone, station_name, sessions, revenue_inr FROM (
  SELECT s.zone, s.station_name, COUNT(*) AS sessions, ROUND(SUM(f.revenue),2) AS revenue_inr,
         ROW_NUMBER() OVER (PARTITION BY s.zone ORDER BY COUNT(*) DESC) AS rn
  FROM dw_fact_session f JOIN dw_dim_station s ON s.station_key = f.station_key
  GROUP BY s.zone, s.station_name) x
WHERE rn <= 3 ORDER BY zone, rn;

-- ---------------------------------------------------------------------
-- Q09  Weather impact: average daily sessions by weather label and monsoon flag
-- ---------------------------------------------------------------------
SELECT COALESCE(d.weather_label,'N/A') AS weather, IF(d.month_num BETWEEN 6 AND 9, 'monsoon (Jun-Sep)', 'other months') AS season,
       COUNT(DISTINCT d.date_key) AS days, ROUND(COUNT(f.session_id) / COUNT(DISTINCT d.date_key), 1) AS avg_sessions_per_day
FROM dw_dim_date d LEFT JOIN dw_fact_session f ON f.date_key = d.date_key
WHERE d.full_date BETWEEN '2025-10-01' AND '2026-10-02'
GROUP BY d.weather_label, season ORDER BY season, weather;

-- ---------------------------------------------------------------------
-- Q10  Holiday vs normal day, split by weekday/weekend and zone family
-- ---------------------------------------------------------------------
SELECT IF(d.is_holiday = 1, 'public holiday', 'regular day') AS day_type, IF(d.is_weekend = 1, 'weekend', 'weekday') AS wk,
       COUNT(f.session_id) AS sessions, COUNT(DISTINCT d.date_key) AS days,
       ROUND(COUNT(f.session_id) / COUNT(DISTINCT d.date_key), 1) AS sessions_per_day,
       ROUND(SUM(f.revenue) / COUNT(DISTINCT d.date_key), 0) AS revenue_per_day_inr
FROM dw_dim_date d LEFT JOIN dw_fact_session f ON f.date_key = d.date_key
WHERE d.full_date BETWEEN '2025-10-01' AND '2026-10-02'
GROUP BY day_type, wk ORDER BY wk, day_type;

-- ---------------------------------------------------------------------
-- Q11  Booking funnel conversion (stage counts and step conversion with LAG)
-- ---------------------------------------------------------------------
SELECT event_type, stage_no, sessions,
       ROUND(100 * sessions / FIRST_VALUE(sessions) OVER (ORDER BY stage_no), 1) AS pct_of_search,
       ROUND(100 * sessions / LAG(sessions) OVER (ORDER BY stage_no), 1) AS step_conversion_pct
FROM v_funnel_summary ORDER BY stage_no;

-- ---------------------------------------------------------------------
-- Q12  Booking outcome mix by source (CASE pivot) - how reliable is each channel?
-- ---------------------------------------------------------------------
SELECT source, COUNT(*) AS bookings,
       ROUND(100 * AVG(status = 'COMPLETED'), 1) AS completed_pct,
       ROUND(100 * AVG(status = 'CANCELLED'), 1) AS cancelled_pct,
       ROUND(100 * AVG(status = 'NO_SHOW'), 1) AS no_show_pct,
       ROUND(100 * AVG(status = 'EXPIRED'), 1) AS expired_pct,
       ROUND(AVG(lead_time_hours), 1) AS avg_lead_h
FROM dw_fact_booking WHERE status IN ('COMPLETED','CANCELLED','NO_SHOW','EXPIRED')
GROUP BY source ORDER BY bookings DESC;

-- ---------------------------------------------------------------------
-- Q13  Lead-time distribution (bucketed) and average revenue per bucket
-- ---------------------------------------------------------------------
SELECT CASE WHEN lead_time_hours = 0 THEN '0  walk-in'
            WHEN lead_time_hours < 2 THEN '1  < 2 h'
            WHEN lead_time_hours < 6 THEN '2  2-6 h'
            WHEN lead_time_hours < 24 THEN '3  6-24 h'
            WHEN lead_time_hours < 72 THEN '4  1-3 days'
            ELSE '5  > 3 days' END AS lead_bucket,
       COUNT(*) AS bookings, ROUND(AVG(est_revenue),2) AS avg_est_revenue_inr
FROM dw_fact_booking WHERE status NOT IN ('CONFIRMED','CHECKED_IN')
GROUP BY lead_bucket ORDER BY lead_bucket;

-- ---------------------------------------------------------------------
-- Q14  Cohort retention: users by signup month x months since signup (active = >=1 completed session)
-- ---------------------------------------------------------------------
WITH act AS (
  SELECT DISTINCT f.user_key, d.month_key AS active_month FROM dw_fact_session f JOIN dw_dim_date d ON d.date_key = f.date_key),
cohort AS (
  SELECT user_key, signup_month FROM dw_dim_user WHERE role = 'USER'),
sizes AS (SELECT signup_month, COUNT(*) AS cohort_size FROM cohort GROUP BY signup_month)
SELECT c.signup_month, s.cohort_size,
       TIMESTAMPDIFF(MONTH, STR_TO_DATE(CONCAT(c.signup_month,'-01'), '%Y-%m-%d'), STR_TO_DATE(CONCAT(a.active_month,'-01'), '%Y-%m-%d')) AS months_since_signup,
       COUNT(DISTINCT c.user_key) AS active_users,
       ROUND(100 * COUNT(DISTINCT c.user_key) / s.cohort_size, 1) AS retention_pct
FROM cohort c JOIN act a ON a.user_key = c.user_key JOIN sizes s ON s.signup_month = c.signup_month
WHERE a.active_month >= c.signup_month AND c.signup_month >= '2025-10'
GROUP BY c.signup_month, s.cohort_size, months_since_signup
HAVING months_since_signup BETWEEN 0 AND 6
ORDER BY c.signup_month, months_since_signup;

-- ---------------------------------------------------------------------
-- Q15  Segment economics: sessions, energy and revenue by K-Means segment (join to dim_user)
-- ---------------------------------------------------------------------
SELECT u.segment, COUNT(DISTINCT u.user_key) AS users, COUNT(f.session_id) AS sessions,
       ROUND(SUM(f.revenue),0) AS revenue_inr, ROUND(SUM(f.revenue) / COUNT(DISTINCT u.user_key), 0) AS revenue_per_user_inr,
       ROUND(100 * SUM(f.revenue) / SUM(SUM(f.revenue)) OVER (), 1) AS pct_of_revenue
FROM dw_dim_user u LEFT JOIN dw_fact_session f ON f.user_key = u.user_key
WHERE u.role IN ('USER','FLEET_MANAGER')
GROUP BY u.segment ORDER BY revenue_inr DESC;

-- ---------------------------------------------------------------------
-- Q16  Connector mix and effective tariff by time-of-use band (CASE + join to dim_time / dim_connector)
-- ---------------------------------------------------------------------
SELECT c.code AS connector, c.current_type,
       COUNT(*) AS sessions, ROUND(AVG(f.energy_kwh),1) AS avg_kwh, ROUND(AVG(f.duration_min),0) AS avg_min,
       ROUND(AVG(CASE WHEN t.pricing_band = 'OFFPEAK' THEN f.effective_tariff END),2) AS tariff_offpeak,
       ROUND(AVG(CASE WHEN t.pricing_band = 'NORMAL'  THEN f.effective_tariff END),2) AS tariff_normal,
       ROUND(AVG(CASE WHEN t.pricing_band = 'PEAK'    THEN f.effective_tariff END),2) AS tariff_peak
FROM dw_fact_session f JOIN dw_dim_connector c ON c.connector_key = f.connector_key JOIN dw_dim_time t ON t.time_key = f.time_key
GROUP BY c.code, c.current_type ORDER BY sessions DESC;

-- ---------------------------------------------------------------------
-- Q17  Vehicle category x energy: CO2 avoided and kWh per session (OLAP slice)
-- ---------------------------------------------------------------------
SELECT v.category, v.model, COUNT(*) AS sessions, ROUND(SUM(f.energy_kwh),0) AS energy_kwh, ROUND(SUM(f.co2_avoided_kg),0) AS co2_avoided_kg,
       ROUND(AVG(f.soc_end - f.soc_start),1) AS avg_soc_gain_pct
FROM dw_fact_session f JOIN dw_dim_vehicle v ON v.vehicle_key = f.vehicle_key
GROUP BY v.category, v.model ORDER BY sessions DESC;

-- ---------------------------------------------------------------------
-- Q18  Station health: utilisation, rating, reliability and sessions per point (joins operational + warehouse)
-- ---------------------------------------------------------------------
SELECT p.station_name, p.zone, p.tier, p.num_points, p.sessions, p.utilization_pct, s.avg_rating, s.uptime_pct, s.reliability_score,
       ROUND(p.sessions / p.num_points, 0) AS sessions_per_point,
       NTILE(4) OVER (ORDER BY s.reliability_score) AS reliability_quartile
FROM v_station_performance p JOIN stations s ON s.id = p.station_key
ORDER BY s.reliability_score;

-- ---------------------------------------------------------------------
-- Q19  Upcoming-week load: confirmed bookings per hub and evening hour (demo conflicts - fully booked slots)
-- ---------------------------------------------------------------------
SELECT s.station_name, d.full_date, t.hour_label, COUNT(*) AS confirmed_bookings, s.num_points
FROM dw_fact_booking b JOIN dw_dim_station s ON s.station_key = b.station_key JOIN dw_dim_date d ON d.date_key = b.date_key JOIN dw_dim_time t ON t.time_key = b.time_key
WHERE b.status IN ('CONFIRMED','CHECKED_IN') AND d.full_date >= '2026-10-03' AND s.tier = 'HUB' AND b.time_key BETWEEN 17 AND 21
GROUP BY s.station_name, d.full_date, t.hour_label, s.num_points
HAVING COUNT(*) >= 3
ORDER BY confirmed_bookings DESC, d.full_date, t.hour_label LIMIT 20;

-- ---------------------------------------------------------------------
-- Q20  Pareto: cumulative revenue share by station (running total window)
-- ---------------------------------------------------------------------
SELECT station_name, revenue_inr,
       ROUND(100 * SUM(revenue_inr) OVER (ORDER BY revenue_inr DESC) / SUM(revenue_inr) OVER (), 1) AS cumulative_pct
FROM (SELECT s.station_name, SUM(f.revenue) AS revenue_inr
      FROM dw_fact_session f JOIN dw_dim_station s ON s.station_key = f.station_key GROUP BY s.station_name) x
ORDER BY revenue_inr DESC;
