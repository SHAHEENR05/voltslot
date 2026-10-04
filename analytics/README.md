# VoltSlot analytics and synthetic data pipeline

Everything is synthetic (seed 42, numpy `default_rng(42)`); re-running gives identical data. Reference "now" is 03-Oct-2026 09:30 IST.

## Run

```bash
pip install pymysql pandas numpy scipy statsmodels scikit-learn textblob bcrypt matplotlib seaborn xlsxwriter nbformat nbconvert ipykernel
python analytics/run_all.py            # whole pipeline (about 5 minutes)
python analytics/run_all.py --skip-dump --skip-notebook --skip-excel   # faster
python analytics/verify_data.py        # checks only
```

Prerequisites: MySQL 8 on 127.0.0.1:3306 (root / root) with database `chargeiq` created from `db/01_schema.sql` and `db/04_warehouse.sql`.
The pipeline touches only the `chargeiq` database (change defaults in `analytics/common.py`).

## Steps

<table>
<thead><tr><th style="text-align:center"><b>Sr No</b></th><th style="text-align:center"><b>Script</b></th><th style="text-align:center"><b>What it does</b></th></tr></thead>
<tbody>
<tr><td style="text-align:right">1</td><td style="text-align:left"><code>generate_data.py</code></td><td style="text-align:left">Simulates the world (operators, zones, stations, points, 656 users, 701 vehicles, bookings, sessions, payments, wallets, reviews, funnel, notifications). Writes clean CSVs to data/ and dirty extracts to data/raw/.</td></tr>
<tr><td style="text-align:right">2</td><td style="text-align:left"><code>clean_data.py</code></td><td style="text-align:left">Cleans data/raw/*_raw.csv (duplicates, date formats, spellings, outliers, tokens); writes data/cleaned/, cleaning_log.csv and cleaning_verification.csv.</td></tr>
<tr><td style="text-align:right">3</td><td style="text-align:left"><code>load_to_mysql.py</code></td><td style="text-align:left">FK-safe load of the 30 tables into the chargeiq database (ML tables are left empty for the next steps).</td></tr>
<tr><td style="text-align:right">4</td><td style="text-align:left"><code>sentiment.py</code></td><td style="text-align:left">TextBlob polarity per review; station aggregates, reliability and sentiment_keywords.</td></tr>
<tr><td style="text-align:right">5</td><td style="text-align:left"><code>forecast.py</code></td><td style="text-align:left">Holt-Winters network forecast (6 zones x 42 days, back-test) and the demand/crowding table (32 x 7 x 24).</td></tr>
<tr><td style="text-align:right">6</td><td style="text-align:left"><code>segmentation.py</code></td><td style="text-align:left">K-Means user segments and station clusters (silhouette selection).</td></tr>
<tr><td style="text-align:right">7</td><td style="text-align:left"><code>recharge_predictions.py</code></td><td style="text-align:left">Per-vehicle next-due date from the median of the last 6 charging intervals.</td></tr>
<tr><td style="text-align:right">8</td><td style="text-align:left"><code>(inline) CALL sp_refresh_warehouse()</code></td><td style="text-align:left">Rebuilds the dw_ star schema.</td></tr>
<tr><td style="text-align:right">9</td><td style="text-align:left"><code>export_clean.py</code></td><td style="text-align:left">Exports the 30 tables to data/clean/*.csv.</td></tr>
<tr><td style="text-align:right">10</td><td style="text-align:left"><code>verify_data.py</code></td><td style="text-align:left">83 assertions (volume, FK, slots, overlaps, wallet, demo accounts, distributions).</td></tr>
<tr><td style="text-align:right">11</td><td style="text-align:left"><code>visual_report.py</code></td><td style="text-align:left">20 dark-theme charts in analytics/reports/.</td></tr>
<tr><td style="text-align:right">12</td><td style="text-align:left"><code>make_notebook.py</code></td><td style="text-align:left">Builds and executes analytics/VoltSlot_Analytics.ipynb.</td></tr>
<tr><td style="text-align:right">13</td><td style="text-align:left"><code>make_excel.py</code></td><td style="text-align:left">data/VoltSlot_Synthetic_Data.xlsx (README, Data Dictionary, 30 tables, fact_session, forecast, segments, station_clusters_named, kpi_summary).</td></tr>
<tr><td style="text-align:right">14</td><td style="text-align:left"><code>make_report.py</code></td><td style="text-align:left">data/DATA_REPORT.md.</td></tr>
<tr><td style="text-align:right">15</td><td style="text-align:left"><code>(inline) mysqldump</code></td><td style="text-align:left">db/chargeiq_full.sql.</td></tr>
</tbody></table>

## Restore the database elsewhere

```bash
mysql -uroot -p < db/chargeiq_full.sql
```

## Notes for the backend developer

- `booking_slots` rows exist only for bookings that are not CANCELLED or EXPIRED; `UNIQUE(charging_point_id, slot_start)` is respected.
- ML tables (`sentiment_keywords`, `network_forecast`, `demand_forecast`, `user_segments`, `station_clusters`, `recharge_predictions`) are written by the Python steps and re-written on every run.
- Demo logins (spec section 'Demo accounts'): admin@ (Admin@123), operator@ (Operator@123), fleet@ (Fleet@123), demo@, priya@, rahul@, sneha@voltslot.in (User@123); every other user has User@123.
- Crowding index: HIGH >= 65, MEDIUM 35 to < 65, LOW < 35.
