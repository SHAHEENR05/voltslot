-- =====================================================================
--  VoltSlot  |  Smart EV Charging Station Locator & Slot Booking System
--  01_schema.sql  -  Operational (OLTP) schema, MySQL 8.x
--  Run in MySQL Workbench:  File > Open SQL Script > (lightning icon)
-- =====================================================================
CREATE DATABASE IF NOT EXISTS chargeiq CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE chargeiq;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS sentiment_keywords, holidays, weather_daily, funnel_events, station_clusters, user_segments,
  network_forecast, demand_forecast, recharge_predictions, notifications, waitlist_entries, reviews, payments,
  charging_sessions, booking_slots, bookings, pricing_bands, charging_points, station_amenities, amenities, stations,
  vehicles, vehicle_model_connectors, vehicle_models, connector_types, wallet_transactions, wallets, users, fleets, operators;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------- Organisations ----------
CREATE TABLE operators (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(80)  NOT NULL UNIQUE,
  brand_color   VARCHAR(9)   NOT NULL DEFAULT '#22d3ee',
  contact_email VARCHAR(120) NOT NULL,
  created_at    DATETIME     NOT NULL
) ENGINE=InnoDB;

CREATE TABLE fleets (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(80) NOT NULL UNIQUE,
  city       VARCHAR(40) NOT NULL,
  created_at DATETIME    NOT NULL
) ENGINE=InnoDB;

-- ---------- Users & wallet ----------
CREATE TABLE users (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
  full_name           VARCHAR(100) NOT NULL,
  email               VARCHAR(120) NOT NULL UNIQUE,
  password_hash       VARCHAR(100) NOT NULL,
  phone               VARCHAR(20),
  role                VARCHAR(20)  NOT NULL,              -- USER | OPERATOR | ADMIN | FLEET_MANAGER
  city                VARCHAR(40),
  status              VARCHAR(12)  NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE | BLOCKED
  operator_id         BIGINT NULL,
  fleet_id            BIGINT NULL,
  home_lat            DOUBLE NULL,
  home_lon            DOUBLE NULL,
  reminder_enabled    TINYINT(1)   NOT NULL DEFAULT 1,
  reminder_lead_hours INT          NOT NULL DEFAULT 24,
  no_show_count       INT          NOT NULL DEFAULT 0,
  created_at          DATETIME     NOT NULL,
  last_login_at       DATETIME NULL,
  CONSTRAINT fk_users_operator FOREIGN KEY (operator_id) REFERENCES operators(id),
  CONSTRAINT fk_users_fleet    FOREIGN KEY (fleet_id)    REFERENCES fleets(id),
  INDEX idx_users_role (role)
) ENGINE=InnoDB;

CREATE TABLE wallets (                                    -- One-to-One with users
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT NOT NULL UNIQUE,
  balance    DECIMAL(10,2) NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_wallet_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE wallet_transactions (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  wallet_id     BIGINT NOT NULL,
  txn_type      VARCHAR(12) NOT NULL,                     -- TOPUP | DEBIT | REFUND | PENALTY
  amount        DECIMAL(10,2) NOT NULL,
  balance_after DECIMAL(10,2) NOT NULL,
  reference     VARCHAR(60),
  created_at    DATETIME NOT NULL,
  CONSTRAINT fk_wtxn_wallet FOREIGN KEY (wallet_id) REFERENCES wallets(id),
  INDEX idx_wtxn_wallet (wallet_id, created_at)
) ENGINE=InnoDB;

-- ---------- Vehicles ----------
CREATE TABLE connector_types (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  code         VARCHAR(20) NOT NULL UNIQUE,               -- CCS2, TYPE2, CHADEMO, LECCS, BHARAT_DC
  display_name VARCHAR(60) NOT NULL,
  current_type VARCHAR(2)  NOT NULL,                      -- AC | DC
  typical_kw   DOUBLE      NOT NULL
) ENGINE=InnoDB;

CREATE TABLE vehicle_models (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  make        VARCHAR(40) NOT NULL,
  model       VARCHAR(60) NOT NULL,
  variant     VARCHAR(40),
  category    VARCHAR(14) NOT NULL,                       -- CAR | TWO_WHEELER | THREE_WHEELER | LCV
  battery_kwh DOUBLE NOT NULL,
  ac_max_kw   DOUBLE NOT NULL,
  dc_max_kw   DOUBLE NOT NULL DEFAULT 0,
  range_km    INT    NOT NULL,                            -- claimed/real-world blend used by trip planner
  km_per_kwh  DOUBLE NOT NULL
) ENGINE=InnoDB;

CREATE TABLE vehicle_model_connectors (                   -- Many-to-Many
  vehicle_model_id  BIGINT NOT NULL,
  connector_type_id BIGINT NOT NULL,
  PRIMARY KEY (vehicle_model_id, connector_type_id),
  CONSTRAINT fk_vmc_model FOREIGN KEY (vehicle_model_id)  REFERENCES vehicle_models(id),
  CONSTRAINT fk_vmc_conn  FOREIGN KEY (connector_type_id) REFERENCES connector_types(id)
) ENGINE=InnoDB;

CREATE TABLE vehicles (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id      BIGINT NOT NULL,                           -- owner (fleet manager for fleet vehicles)
  fleet_id     BIGINT NULL,
  model_id     BIGINT NOT NULL,
  reg_number   VARCHAR(20) NOT NULL UNIQUE,
  nickname     VARCHAR(40),
  avg_daily_km INT NOT NULL DEFAULT 40,
  created_at   DATETIME NOT NULL,
  CONSTRAINT fk_veh_user  FOREIGN KEY (user_id)  REFERENCES users(id),
  CONSTRAINT fk_veh_fleet FOREIGN KEY (fleet_id) REFERENCES fleets(id),
  CONSTRAINT fk_veh_model FOREIGN KEY (model_id) REFERENCES vehicle_models(id),
  INDEX idx_veh_user (user_id)
) ENGINE=InnoDB;

-- ---------- Stations ----------
CREATE TABLE stations (
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  operator_id       BIGINT NOT NULL,
  name              VARCHAR(100) NOT NULL,
  address           VARCHAR(200) NOT NULL,
  zone              VARCHAR(40)  NOT NULL,
  city              VARCHAR(40)  NOT NULL,
  latitude          DOUBLE NOT NULL,
  longitude         DOUBLE NOT NULL,
  tier              VARCHAR(10) NOT NULL DEFAULT 'STANDARD',  -- HUB | STANDARD
  open_hour         INT NOT NULL DEFAULT 0,                    -- 0..24
  close_hour        INT NOT NULL DEFAULT 24,
  status            VARCHAR(12) NOT NULL DEFAULT 'ACTIVE',     -- ACTIVE | INACTIVE
  uptime_pct        DOUBLE NOT NULL DEFAULT 97,
  avg_rating        DOUBLE NOT NULL DEFAULT 0,
  review_count      INT    NOT NULL DEFAULT 0,
  sentiment_score   DOUBLE NOT NULL DEFAULT 0,                 -- -1 .. +1
  reliability_score DOUBLE NOT NULL DEFAULT 0,                 -- 0 .. 100
  created_at        DATETIME NOT NULL,
  CONSTRAINT fk_station_operator FOREIGN KEY (operator_id) REFERENCES operators(id),
  INDEX idx_station_zone (zone),
  INDEX idx_station_geo (latitude, longitude)
) ENGINE=InnoDB;

CREATE TABLE amenities (
  id   BIGINT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(40) NOT NULL UNIQUE,
  icon VARCHAR(20) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE station_amenities (                          -- Many-to-Many
  station_id BIGINT NOT NULL,
  amenity_id BIGINT NOT NULL,
  PRIMARY KEY (station_id, amenity_id),
  CONSTRAINT fk_sa_station FOREIGN KEY (station_id) REFERENCES stations(id),
  CONSTRAINT fk_sa_amenity FOREIGN KEY (amenity_id) REFERENCES amenities(id)
) ENGINE=InnoDB;

CREATE TABLE charging_points (
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  station_id        BIGINT NOT NULL,
  label             VARCHAR(20) NOT NULL,
  connector_type_id BIGINT NOT NULL,
  power_kw          DOUBLE NOT NULL,
  tariff_per_kwh    DECIMAL(6,2) NOT NULL,
  status            VARCHAR(12) NOT NULL DEFAULT 'ACTIVE',     -- ACTIVE | MAINTENANCE | OFFLINE
  created_at        DATETIME NOT NULL,
  CONSTRAINT fk_cp_station   FOREIGN KEY (station_id)        REFERENCES stations(id),
  CONSTRAINT fk_cp_connector FOREIGN KEY (connector_type_id) REFERENCES connector_types(id),
  INDEX idx_cp_station (station_id)
) ENGINE=InnoDB;

CREATE TABLE pricing_bands (                              -- time-of-day tariff multiplier, one row per hour
  hour_of_day INT PRIMARY KEY,
  band_name   VARCHAR(10)  NOT NULL,                      -- OFFPEAK | NORMAL | PEAK
  multiplier  DECIMAL(4,2) NOT NULL
) ENGINE=InnoDB;

-- ---------- Bookings ----------
CREATE TABLE bookings (
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  booking_code      VARCHAR(16) NOT NULL UNIQUE,
  user_id           BIGINT NOT NULL,
  vehicle_id        BIGINT NOT NULL,
  charging_point_id BIGINT NOT NULL,
  station_id        BIGINT NOT NULL,                      -- denormalised for fast station-level queries
  start_time        DATETIME NOT NULL,
  end_time          DATETIME NOT NULL,
  slots             INT NOT NULL,                         -- number of 30-minute slots
  status            VARCHAR(12) NOT NULL,                 -- HOLD|CONFIRMED|CHECKED_IN|COMPLETED|CANCELLED|NO_SHOW|EXPIRED
  source            VARCHAR(12) NOT NULL DEFAULT 'WEB',   -- WEB|WALK_IN|FLEET|REMINDER|TRIP|WAITLIST
  soc_start         INT NOT NULL,
  soc_target        INT NOT NULL,
  est_energy_kwh    DOUBLE NOT NULL,
  est_cost          DECIMAL(10,2) NOT NULL,
  created_at        DATETIME NOT NULL,
  hold_expires_at   DATETIME NULL,
  checked_in_at     DATETIME NULL,
  cancelled_at      DATETIME NULL,
  cancel_reason     VARCHAR(100) NULL,
  CONSTRAINT fk_bk_user    FOREIGN KEY (user_id)           REFERENCES users(id),
  CONSTRAINT fk_bk_vehicle FOREIGN KEY (vehicle_id)        REFERENCES vehicles(id),
  CONSTRAINT fk_bk_point   FOREIGN KEY (charging_point_id) REFERENCES charging_points(id),
  CONSTRAINT fk_bk_station FOREIGN KEY (station_id)        REFERENCES stations(id),
  INDEX idx_bk_user_start    (user_id, start_time),
  INDEX idx_bk_station_start (station_id, start_time),
  INDEX idx_bk_point_start   (charging_point_id, start_time),
  INDEX idx_bk_status_start  (status, start_time)
) ENGINE=InnoDB;

-- One row per occupied 30-min slot. The UNIQUE key is the database-level guarantee against double booking.
CREATE TABLE booking_slots (
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  charging_point_id BIGINT NOT NULL,
  slot_start        DATETIME NOT NULL,
  booking_id        BIGINT NOT NULL,
  CONSTRAINT uq_point_slot UNIQUE (charging_point_id, slot_start),
  CONSTRAINT fk_bs_point   FOREIGN KEY (charging_point_id) REFERENCES charging_points(id),
  CONSTRAINT fk_bs_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  INDEX idx_bs_booking (booking_id)
) ENGINE=InnoDB;

CREATE TABLE charging_sessions (                          -- One-to-One with bookings (only for charged bookings)
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  booking_id     BIGINT NOT NULL UNIQUE,
  started_at     DATETIME NOT NULL,
  ended_at       DATETIME NOT NULL,
  energy_kwh     DOUBLE NOT NULL,
  soc_start      INT NOT NULL,
  soc_end        INT NOT NULL,
  avg_kw         DOUBLE NOT NULL,
  tariff         DECIMAL(6,2) NOT NULL,                  -- effective ₹/kWh incl. time-of-day multiplier
  amount         DECIMAL(10,2) NOT NULL,
  co2_avoided_kg DOUBLE NOT NULL,
  CONSTRAINT fk_cs_booking FOREIGN KEY (booking_id) REFERENCES bookings(id)
) ENGINE=InnoDB;

CREATE TABLE payments (                                   -- One-to-One with bookings
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  booking_id      BIGINT NOT NULL UNIQUE,
  amount          DECIMAL(10,2) NOT NULL,
  method          VARCHAR(10) NOT NULL,                  -- WALLET | UPI | CARD (simulated)
  status          VARCHAR(16) NOT NULL,                  -- PAID | REFUNDED | PART_REFUND | FAILED
  invoice_no      VARCHAR(24) NOT NULL UNIQUE,
  refunded_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  paid_at         DATETIME NOT NULL,
  CONSTRAINT fk_pay_booking FOREIGN KEY (booking_id) REFERENCES bookings(id)
) ENGINE=InnoDB;

CREATE TABLE reviews (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  station_id      BIGINT NOT NULL,
  user_id         BIGINT NOT NULL,
  booking_id      BIGINT NULL,
  rating          INT NOT NULL,
  comment         VARCHAR(500),
  sentiment_score DOUBLE NOT NULL DEFAULT 0,             -- -1 .. +1
  sentiment_label VARCHAR(10) NOT NULL DEFAULT 'NEUTRAL', -- POSITIVE | NEUTRAL | NEGATIVE
  created_at      DATETIME NOT NULL,
  CONSTRAINT fk_rv_station FOREIGN KEY (station_id) REFERENCES stations(id),
  CONSTRAINT fk_rv_user    FOREIGN KEY (user_id)    REFERENCES users(id),
  CONSTRAINT fk_rv_booking FOREIGN KEY (booking_id) REFERENCES bookings(id),
  INDEX idx_rv_station (station_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE waitlist_entries (
  id                 BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id            BIGINT NOT NULL,
  vehicle_id         BIGINT NOT NULL,
  station_id         BIGINT NOT NULL,
  desired_start      DATETIME NOT NULL,
  slots              INT NOT NULL,
  status             VARCHAR(12) NOT NULL,               -- WAITING | PROMOTED | EXPIRED | CANCELLED
  promoted_booking_id BIGINT NULL,
  created_at         DATETIME NOT NULL,
  CONSTRAINT fk_wl_user    FOREIGN KEY (user_id)    REFERENCES users(id),
  CONSTRAINT fk_wl_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
  CONSTRAINT fk_wl_station FOREIGN KEY (station_id) REFERENCES stations(id),
  INDEX idx_wl_station (station_id, status, desired_start)
) ENGINE=InnoDB;

-- ---------- Smart recharge reminders (BigBasket-style replenishment nudges) ----------
CREATE TABLE recharge_predictions (
  id                   BIGINT AUTO_INCREMENT PRIMARY KEY,
  vehicle_id           BIGINT NOT NULL UNIQUE,
  user_id              BIGINT NOT NULL,
  last_charge_at       DATETIME NOT NULL,
  median_interval_days DOUBLE NOT NULL,
  avg_energy_kwh       DOUBLE NOT NULL,
  preferred_hour       INT NOT NULL,
  preferred_station_id BIGINT NULL,
  sessions_used        INT NOT NULL,
  confidence           DOUBLE NOT NULL,                   -- 0..1
  next_due_at          DATETIME NOT NULL,
  updated_at           DATETIME NOT NULL,
  CONSTRAINT fk_rp_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
  CONSTRAINT fk_rp_user    FOREIGN KEY (user_id)    REFERENCES users(id),
  CONSTRAINT fk_rp_station FOREIGN KEY (preferred_station_id) REFERENCES stations(id),
  INDEX idx_rp_due (next_due_at)
) ENGINE=InnoDB;

CREATE TABLE notifications (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id       BIGINT NOT NULL,
  type          VARCHAR(24) NOT NULL,   -- RECHARGE_REMINDER|BOOKING_CONFIRMED|BOOKING_CANCELLED|WAITLIST_PROMOTED|BOOKING_SOON|CHARGE_COMPLETE|NO_SHOW|SYSTEM
  title         VARCHAR(120) NOT NULL,
  message       VARCHAR(400) NOT NULL,
  payload       VARCHAR(600),           -- small JSON string (vehicleId, stationId, suggestedStart ...)
  is_read       TINYINT(1) NOT NULL DEFAULT 0,
  status        VARCHAR(12) NOT NULL DEFAULT 'ACTIVE',     -- ACTIVE | SNOOZED | DISMISSED | DONE
  snoozed_until DATETIME NULL,
  created_at    DATETIME NOT NULL,
  CONSTRAINT fk_nt_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_nt_user (user_id, is_read, created_at)
) ENGINE=InnoDB;

-- ---------- Analytics / ML output tables (written by Python, read by Spring Boot) ----------
CREATE TABLE demand_forecast (                            -- seasonal profile: station x weekday x hour
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  station_id        BIGINT NOT NULL,
  day_of_week       INT NOT NULL,                         -- 1=Mon .. 7=Sun
  hour_of_day       INT NOT NULL,
  expected_sessions DOUBLE NOT NULL,                      -- expected bookings starting in that hour
  crowding_index    DOUBLE NOT NULL,                      -- 0..100 (percentile-scaled)
  method            VARCHAR(30) NOT NULL,
  CONSTRAINT uq_df UNIQUE (station_id, day_of_week, hour_of_day),
  CONSTRAINT fk_df_station FOREIGN KEY (station_id) REFERENCES stations(id)
) ENGINE=InnoDB;

CREATE TABLE network_forecast (                           -- Holt-Winters daily forecast (zone='ALL' = whole network)
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  forecast_date     DATE NOT NULL,
  zone              VARCHAR(40) NOT NULL DEFAULT 'ALL',
  predicted_sessions DOUBLE NOT NULL,
  lower_bound       DOUBLE NOT NULL,
  upper_bound       DOUBLE NOT NULL,
  method            VARCHAR(30) NOT NULL,
  CONSTRAINT uq_nf UNIQUE (forecast_date, zone)
) ENGINE=InnoDB;

CREATE TABLE user_segments (                              -- K-Means output
  user_id         BIGINT PRIMARY KEY,
  cluster_id      INT NOT NULL,
  segment_label   VARCHAR(40) NOT NULL,
  sessions_12m    INT NOT NULL,
  avg_energy_kwh  DOUBLE NOT NULL,
  recency_days    INT NOT NULL,
  night_share     DOUBLE NOT NULL,
  weekend_share   DOUBLE NOT NULL,
  total_spend     DECIMAL(12,2) NOT NULL,
  CONSTRAINT fk_seg_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE station_clusters (                           -- K-Means on stations
  station_id         BIGINT PRIMARY KEY,
  cluster_id         INT NOT NULL,
  cluster_label      VARCHAR(40) NOT NULL,
  avg_daily_sessions DOUBLE NOT NULL,
  peak_crowding      DOUBLE NOT NULL,
  revenue_12m        DECIMAL(12,2) NOT NULL,
  recommendation     VARCHAR(200) NOT NULL,
  CONSTRAINT fk_sc_station FOREIGN KEY (station_id) REFERENCES stations(id)
) ENGINE=InnoDB;

CREATE TABLE funnel_events (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_key VARCHAR(20) NOT NULL,
  user_id     BIGINT NULL,
  station_id  BIGINT NULL,
  event_type  VARCHAR(16) NOT NULL,        -- SEARCH|VIEW_STATION|SELECT_SLOT|BOOK|CHECK_IN|COMPLETE
  event_time  DATETIME NOT NULL,
  device      VARCHAR(10) NOT NULL,        -- MOBILE | DESKTOP | TABLET
  INDEX idx_fe_type_time (event_type, event_time),
  INDEX idx_fe_session (session_key)
) ENGINE=InnoDB;

CREATE TABLE weather_daily (
  weather_date    DATE PRIMARY KEY,
  city            VARCHAR(40) NOT NULL,
  avg_temp_c      DOUBLE NOT NULL,
  rainfall_mm     DOUBLE NOT NULL,
  condition_label VARCHAR(16) NOT NULL     -- CLEAR | CLOUDY | RAIN | HEAVY_RAIN
) ENGINE=InnoDB;

CREATE TABLE holidays (
  holiday_date DATE PRIMARY KEY,
  name         VARCHAR(60) NOT NULL,
  holiday_type VARCHAR(16) NOT NULL        -- NATIONAL | FESTIVAL | REGIONAL
) ENGINE=InnoDB;

CREATE TABLE sentiment_keywords (
  id    BIGINT AUTO_INCREMENT PRIMARY KEY,
  label VARCHAR(10) NOT NULL,              -- POSITIVE | NEGATIVE
  word  VARCHAR(40) NOT NULL,
  freq  INT NOT NULL
) ENGINE=InnoDB;
