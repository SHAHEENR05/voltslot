# VoltSlot - Smart EV Charging Station Locator and Slot Booking

VoltSlot helps electric-vehicle drivers find the **right** charger, not just the nearest one: it predicts how crowded each station will be, recommends a station with an explainable score, books a conflict-free slot, and reminds you to charge before the battery runs low.
One project by a team of two (TCET IT), submitted for **PBL**, **IP (Java Full Stack: Spring Boot, REST, JPA, JWT)** and **PS-IV (BI / analytics)**. All data is synthetic.

## What makes it different

<table>
<thead><tr><th style="text-align:center"><b>Sr No</b></th><th style="text-align:center"><b>Feature</b></th><th style="text-align:center"><b>In one line</b></th></tr></thead>
<tbody>
<tr><td style="text-align:right">1</td><td style="text-align:left;vertical-align:top">Demand-aware smart recommendation</td><td style="text-align:left;vertical-align:top">Six-factor score (distance, wait, predicted crowding, price, reliability, speed) with a per-factor explanation and "saves 30 min and Rs 180 vs the nearest station".</td></tr>
<tr><td style="text-align:right">2</td><td style="text-align:left;vertical-align:top">Predictive recharge reminders</td><td style="text-align:left;vertical-align:top">BigBasket-style replenishment nudge: learns each vehicle's charging rhythm and pops up a ready-to-book slot before you run low.</td></tr>
<tr><td style="text-align:right">3</td><td style="text-align:left;vertical-align:top">Conflict-safe slot holds</td><td style="text-align:left;vertical-align:top">5-minute holds, database row locks and a UNIQUE key make double booking impossible; a lost race returns alternative slots and stations.</td></tr>
<tr><td style="text-align:right">4</td><td style="text-align:left;vertical-align:top">Dynamic off-peak pricing</td><td style="text-align:left;vertical-align:top">Night x0.85, day x1.00, evening peak x1.20, used in estimates and ranking.</td></tr>
<tr><td style="text-align:right">5</td><td style="text-align:left;vertical-align:top">Waitlist auto-promotion</td><td style="text-align:left;vertical-align:top">When someone cancels, the first person waiting gets a hold and a notification automatically.</td></tr>
<tr><td style="text-align:right">6</td><td style="text-align:left;vertical-align:top">Fleet smart scheduler</td><td style="text-align:left;vertical-align:top">Plans charging for many vehicles inside a time window, then books the plan in one click.</td></tr>
<tr><td style="text-align:right">7</td><td style="text-align:left;vertical-align:top">Trip planner</td><td style="text-align:left;vertical-align:top">Charging stops along a route with timing and cost.</td></tr>
<tr><td style="text-align:right">8</td><td style="text-align:left;vertical-align:top">Time-machine demo clock</td><td style="text-align:left;vertical-align:top">Admin moves the app clock forward to demo reminders, hold expiry and no-shows live.</td></tr>
<tr><td style="text-align:right">9</td><td style="text-align:left;vertical-align:top">8-tab analytics</td><td style="text-align:left;vertical-align:top">Overview, Demand and Forecast (Holt-Winters + anomalies), Stations and Zones, Customers (K-Means, cohorts), Bookings and Funnel, Reviews and Sentiment, Weather and Events, Smart Features.</td></tr>
</tbody>
</table>

## Architecture

```text
 Browser (React 18 + Vite, dark UI, Leaflet map, Recharts)          Postman / Swagger UI
        |  HTTPS/HTTP + JSON, "Authorization: Bearer <JWT>"                  |
        v                                                                    v
 +--------------------------- Spring Boot 3 (one jar, port 8080) ---------------------------+
 |  static UI (src/main/resources/static)      JwtAuthFilter -> SecurityConfig (roles)      |
 |  Controller  ->  Service  ->  Repository (Spring Data JPA) ----+                         |
 |  (@Valid, DTO)   (rules,      JdbcTemplate (analytics SQL) -----+--> MySQL 8 "chargeiq"  |
 |                  @Transactional)                                      30 OLTP tables     |
 |  GlobalExceptionHandler   AppClock (demo time)   JobScheduler          dw_* star schema   |
 +------------------------------------------------------------------------------------------+
                                                                          ^
 Python pipeline (analytics/): generate -> clean (Pandas) -> load -> sentiment, forecast,  |
 K-Means, recharge predictions -> CALL sp_refresh_warehouse() ------------------------------+
```

## Folder map

<table>
<thead><tr><th style="text-align:center"><b>Sr No</b></th><th style="text-align:center"><b>Folder / file</b></th><th style="text-align:center"><b>What is inside</b></th></tr></thead>
<tbody>
<tr><td style="text-align:right">1</td><td style="text-align:left;vertical-align:top"><code>backend/</code></td><td style="text-align:left;vertical-align:top">Spring Boot app (<code>pom.xml</code>, <code>mvnw</code>, <code>mvnw.cmd</code>, <code>Dockerfile</code>, <code>src/main/java/com/chargeiq/...</code>, <code>src/test/java/...</code>). <code>src/main/resources/static</code> holds the built React UI.</td></tr>
<tr><td style="text-align:right">2</td><td style="text-align:left;vertical-align:top"><code>frontend/</code></td><td style="text-align:left;vertical-align:top">React + Vite source (<code>src/</code>), Node mock API (<code>mock/</code>), screenshots, <code>README_DEV.md</code>.</td></tr>
<tr><td style="text-align:right">3</td><td style="text-align:left;vertical-align:top"><code>db/</code></td><td style="text-align:left;vertical-align:top"><code>01_schema.sql</code> (tables), <code>04_warehouse.sql</code> (star schema, procedure, views), <code>05_bi_queries.sql</code> (20 BI queries), <code>chargeiq_full.sql</code> (complete dump: schema + data + warehouse, about 11 MB).</td></tr>
<tr><td style="text-align:right">4</td><td style="text-align:left;vertical-align:top"><code>analytics/</code></td><td style="text-align:left;vertical-align:top">Python pipeline (<code>run_all.py</code>, <code>generate_data.py</code>, <code>clean_data.py</code>, <code>load_to_mysql.py</code>, <code>sentiment.py</code>, <code>forecast.py</code>, <code>segmentation.py</code>, <code>recharge_predictions.py</code>, <code>visual_report.py</code> ...), <code>VoltSlot_Analytics.ipynb</code>, <code>reports/</code> (charts), <code>README.md</code>.</td></tr>
<tr><td style="text-align:right">5</td><td style="text-align:left;vertical-align:top"><code>data/</code></td><td style="text-align:left;vertical-align:top"><code>raw/</code> (dirty CSV), <code>cleaned/</code>, <code>clean/</code> (final CSV of the 30 tables), <code>VoltSlot_Synthetic_Data.xlsx</code>, <code>DATA_REPORT.md</code>, <code>cleaning_log.csv</code>.</td></tr>
<tr><td style="text-align:right">6</td><td style="text-align:left;vertical-align:top"><code>docs/</code></td><td style="text-align:left;vertical-align:top"><code>API_CONTRACT.md</code>, <code>VIVA_NOTES.md</code>, <code>ER_DIAGRAM.md</code>, <code>PS4_MAPPING.md</code>, <code>PBL_FEATURE_LIST.md</code>, <code>postman/</code>, <code>img/</code>, <code>spec/</code> (original build specification).</td></tr>
<tr><td style="text-align:right">7</td><td style="text-align:left;vertical-align:top"><code>tools/</code></td><td style="text-align:left;vertical-align:top"><code>stubcheck.sh</code> (developer helper used while the code was written; not needed to run the app).</td></tr>
</tbody>
</table>

## Quick start

You need: **JDK 17 or newer**, **MySQL 8** (Server + MySQL Workbench), a browser and an internet connection for the first run (Maven and libraries are downloaded once). Node.js is only needed if you want to change the UI. Python is only needed to regenerate data.

### Step 1 - Install the tools

<table>
<thead><tr><th style="text-align:center"><b>Sr No</b></th><th style="text-align:center"><b>System</b></th><th style="text-align:center"><b>Java 17+</b></th><th style="text-align:center"><b>MySQL 8 Server + Workbench</b></th></tr></thead>
<tbody>
<tr><td style="text-align:right">1</td><td style="text-align:left;vertical-align:top">Windows</td><td style="text-align:left;vertical-align:top">Download Temurin 17 from adoptium.net (MSI, tick "Set JAVA_HOME"), or <code>winget install EclipseAdoptium.Temurin.17.JDK</code>.</td><td style="text-align:left;vertical-align:top">MySQL Installer from dev.mysql.com/downloads/installer (choose Server + Workbench, set a root password and remember it).</td></tr>
<tr><td style="text-align:right">2</td><td style="text-align:left;vertical-align:top">macOS</td><td style="text-align:left;vertical-align:top"><code>brew install --cask temurin@17</code></td><td style="text-align:left;vertical-align:top"><code>brew install mysql@8.0</code> then <code>brew services start mysql@8.0</code>, and <code>brew install --cask mysqlworkbench</code>.</td></tr>
<tr><td style="text-align:right">3</td><td style="text-align:left;vertical-align:top">Linux (Ubuntu/Debian)</td><td style="text-align:left;vertical-align:top"><code>sudo apt install openjdk-17-jdk</code></td><td style="text-align:left;vertical-align:top"><code>sudo apt install mysql-server</code> (then <code>sudo mysql_secure_installation</code> or set a root password), Workbench <code>.deb</code> from dev.mysql.com/downloads/workbench.</td></tr>
</tbody>
</table>

Check: `java -version` (must say 17 or higher) and that MySQL runs on port 3306. MariaDB and MySQL 5.7 will not work with the dump (it uses MySQL 8 collations).

### Step 2 - Create the database

**Option A (recommended): import the ready dump `db/chargeiq_full.sql`** (schema + about 9,500 bookings of synthetic data + ML tables + warehouse + procedure + views)

1. Open **MySQL Workbench** and create/open a connection: Home -> `+` next to *MySQL Connections* -> name `local`, host `127.0.0.1`, port `3306`, user `root` -> *Test Connection* -> OK.
2. Open the connection, then menu **Server -> Data Import**.
3. Choose **Import from Self-Contained File**, browse to `db/chargeiq_full.sql`. For *Default Target Schema* leave it empty (the file creates and selects the `chargeiq` database itself).
4. Click **Start Import**. It takes under a minute.
5. Check: refresh the schema list, then run in a SQL tab:

```sql
USE chargeiq;
SELECT (SELECT COUNT(*) FROM bookings) AS bookings, (SELECT COUNT(*) FROM stations) AS stations,
       (SELECT COUNT(*) FROM dw_fact_session) AS warehouse_sessions;
-- expected: 9542, 32, 7789
```

Alternative to the Import wizard: **File -> Open SQL Script**, pick the file and press the lightning button (works, but Workbench can be slow with an 11 MB script), or from a terminal: `mysql -u root -p < db/chargeiq_full.sql`.

**Option B: build the database from the schema scripts and CSV files** (needs Python 3.10+)

```bash
pip install pymysql pandas numpy scipy statsmodels scikit-learn textblob bcrypt matplotlib seaborn
mysql -u root -p < db/01_schema.sql        # tables (drops and recreates chargeiq)
mysql -u root -p < db/04_warehouse.sql     # star schema, procedure sp_refresh_warehouse, views
# in Workbench you can instead use File -> Open SQL Script for the two files above
python analytics/load_to_mysql.py --password YOURPASSWORD      # loads data/clean/*.csv (24 base tables)
python analytics/sentiment.py ; python analytics/forecast.py ; python analytics/segmentation.py ; python analytics/recharge_predictions.py
mysql -u root -p chargeiq -e "CALL sp_refresh_warehouse()"
```

Notes for Option B: `load_to_mysql.py` only fills the base tables; the four Python scripts fill the ML tables (sentiment keywords, forecasts, segments, recharge predictions) that the app and Insights page need. The loader accepts `--host --port --user --password --db`, but the other scripts use the defaults in `analytics/common.py` (`127.0.0.1:3306`, user `root`, password `root`, database `chargeiq`), so either set the MySQL root password to `root` for this step or edit `DB_DEFAULT` in that file. Use `python3` instead of `python` on macOS/Linux if needed.

### Step 3 - Tell the app your MySQL password

The defaults in `backend/src/main/resources/application.properties` are `root` / `root` on `localhost:3306`. If your password differs, set environment variables **in the same terminal you will start the app from** (no file edit needed):

<table>
<thead><tr><th style="text-align:center"><b>Sr No</b></th><th style="text-align:center"><b>Variable</b></th><th style="text-align:center"><b>Meaning</b></th><th style="text-align:center"><b>Default</b></th></tr></thead>
<tbody>
<tr><td style="text-align:right">1</td><td style="text-align:left;vertical-align:top"><code>DB_USER</code></td><td style="text-align:left;vertical-align:top">MySQL user</td><td style="text-align:left;vertical-align:top"><code>root</code></td></tr>
<tr><td style="text-align:right">2</td><td style="text-align:left;vertical-align:top"><code>DB_PASSWORD</code></td><td style="text-align:left;vertical-align:top">MySQL password</td><td style="text-align:left;vertical-align:top"><code>root</code></td></tr>
<tr><td style="text-align:right">3</td><td style="text-align:left;vertical-align:top"><code>DB_URL</code></td><td style="text-align:left;vertical-align:top">JDBC URL</td><td style="text-align:left;vertical-align:top"><code>jdbc:mysql://localhost:3306/chargeiq?useSSL=false&amp;allowPublicKeyRetrieval=true&amp;serverTimezone=Asia/Kolkata&amp;characterEncoding=UTF-8</code></td></tr>
</tbody>
</table>

Windows PowerShell:

```powershell
$env:DB_USER = "root"
$env:DB_PASSWORD = "your-password"
$env:DB_URL = "jdbc:mysql://localhost:3306/chargeiq?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Kolkata&characterEncoding=UTF-8"
```

Windows cmd: `set DB_PASSWORD=your-password`. macOS / Linux (bash or zsh):

```bash
export DB_USER=root
export DB_PASSWORD='your-password'
export DB_URL='jdbc:mysql://localhost:3306/chargeiq?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Kolkata&characterEncoding=UTF-8'
```

Or edit the three `spring.datasource.*` lines in `backend/src/main/resources/application.properties` directly (do not commit your real password).

### Step 4 - Run the application

```bash
cd backend
./mvnw spring-boot:run          # macOS / Linux  (if "permission denied": chmod +x mvnw)
mvnw.cmd spring-boot:run        # Windows (cmd or PowerShell: .\mvnw.cmd spring-boot:run)
```

The first run downloads Maven 3.9.9 and all libraries (a few minutes). Wait for `Started ChargeIqApplication`.

- App (UI + API): http://localhost:8080
- Swagger UI: http://localhost:8080/swagger-ui.html (click **Authorize**, paste the token from `POST /api/auth/login`)
- OpenAPI JSON: http://localhost:8080/v3/api-docs

The React UI is already built into the jar's static folder, so no Node.js is needed to run the demo.

## Demo accounts

<table>
<thead><tr><th style="text-align:center"><b>Sr No</b></th><th style="text-align:center"><b>E-mail</b></th><th style="text-align:center"><b>Password</b></th><th style="text-align:center"><b>Role</b></th><th style="text-align:center"><b>Notes</b></th></tr></thead>
<tbody>
<tr><td style="text-align:right">1</td><td style="text-align:left;vertical-align:top"><code>admin@voltslot.in</code></td><td style="text-align:left;vertical-align:top"><code>Admin@123</code></td><td style="text-align:left;vertical-align:top">ADMIN</td><td style="text-align:left;vertical-align:top">Users, warehouse refresh, time machine, all Insights.</td></tr>
<tr><td style="text-align:right">2</td><td style="text-align:left;vertical-align:top"><code>operator@voltslot.in</code></td><td style="text-align:left;vertical-align:top"><code>Operator@123</code></td><td style="text-align:left;vertical-align:top">OPERATOR</td><td style="text-align:left;vertical-align:top">Operator VoltGrid: stations, points, schedule, walk-ins, own Insights.</td></tr>
<tr><td style="text-align:right">3</td><td style="text-align:left;vertical-align:top"><code>fleet@voltslot.in</code></td><td style="text-align:left;vertical-align:top"><code>Fleet@123</code></td><td style="text-align:left;vertical-align:top">FLEET_MANAGER</td><td style="text-align:left;vertical-align:top">Fleet SwiftLogix Deliveries, 12 LCV / three-wheelers, smart scheduler.</td></tr>
<tr><td style="text-align:right">4</td><td style="text-align:left;vertical-align:top"><code>demo@voltslot.in</code></td><td style="text-align:left;vertical-align:top"><code>User@123</code></td><td style="text-align:left;vertical-align:top">USER</td><td style="text-align:left;vertical-align:top">Aarav Mehta, Thane, Tata Nexon EV + Ather 450X; a recharge reminder is ACTIVE at the demo time.</td></tr>
<tr><td style="text-align:right">5</td><td style="text-align:left;vertical-align:top"><code>priya@voltslot.in</code></td><td style="text-align:left;vertical-align:top"><code>User@123</code></td><td style="text-align:left;vertical-align:top">USER</td><td style="text-align:left;vertical-align:top">Priya Nair, Tata Punch EV, weekend explorer, next charge due about 05-Oct-2026.</td></tr>
<tr><td style="text-align:right">6</td><td style="text-align:left;vertical-align:top"><code>rahul@voltslot.in</code></td><td style="text-align:left;vertical-align:top"><code>User@123</code></td><td style="text-align:left;vertical-align:top">USER</td><td style="text-align:left;vertical-align:top">Rahul Deshmukh, MG ZS EV, night charger, reminder overdue by about a day.</td></tr>
<tr><td style="text-align:right">7</td><td style="text-align:left;vertical-align:top"><code>sneha@voltslot.in</code></td><td style="text-align:left;vertical-align:top"><code>User@123</code></td><td style="text-align:left;vertical-align:top">USER</td><td style="text-align:left;vertical-align:top">Sneha Iyer, Ola S1 Pro (two-wheeler, LECCS connector).</td></tr>
</tbody>
</table>

Every other synthetic user also has the password `User@123`. The demo "now" is **Saturday 03-Oct-2026 09:30 IST** (the clock starts there each time the app starts and then ticks).

## Five-minute demo script

1. **Login as Aarav** (`demo@voltslot.in`): the sign-in page has one-click demo chips.
2. **Reminder popup**: a "time to charge your Nexon" card appears with a suggested quiet, cheaper slot and a "why" explanation (prediction from his charging history, confidence, due time).
3. **Smart pick**: Home -> choose Aarav's Nexon -> *Smart pick*. Show the ranked stations, the "Why this?" score bar and the "saves X min and Rs Y vs the nearest station" line; switch the preset to *Cheapest*.
4. **Book**: click *Book* on the top result -> estimate (energy, duration, off-peak price) -> 5-minute hold with countdown -> pay from wallet -> done (QR, invoice). Mention that a second user taking the same slot would get alternatives.
5. **Time machine**: log out, login as `admin@voltslot.in` -> Admin console -> advance the clock (for example +1 day) to show reminders, hold expiry and no-shows reacting; reset the clock afterwards.
6. **Insights** (admin): open Insights, change the date range, show the forecast with anomalies, customer segments, funnel and sentiment tabs. Optional: press *Refresh warehouse* in the Admin console.
7. Close with Swagger (`/swagger-ui.html`) or the Postman *Happy path* folder.

## Frontend development mode

```bash
cd frontend
npm install
npm run dev          # Vite on http://localhost:5173, proxies /api to http://localhost:8080
npm run build        # writes the production UI into ../backend/src/main/resources/static
npm run mock         # optional: mock API + built UI on http://localhost:8080 (no MySQL, no Java needed)
```

Run the real backend (Step 4) and `npm run dev` together for live UI editing; or stop the backend and run `npm run mock` for UI-only work. Details in `frontend/README_DEV.md`. Rebuild with `npm run build` and restart the backend after UI changes so the jar serves the new files.

## Running tests

```bash
cd backend
./mvnw test          # Windows: mvnw.cmd test
```

Runs 109 JUnit 5 test methods: unit tests with Mockito (booking, estimator, recommendation, prediction, fleet, trip planner, sentiment, JWT) and integration tests (`*IT`) on in-memory H2, so MySQL is not needed for tests. API testing by hand: import `docs/postman/VoltSlot.postman_collection.json` and `VoltSlot.local.postman_environment.json` into Postman, select the *VoltSlot Local* environment, run the **Happy path** folder.

## Troubleshooting

<table>
<thead><tr><th style="text-align:center"><b>Sr No</b></th><th style="text-align:center"><b>Problem</b></th><th style="text-align:center"><b>Cause</b></th><th style="text-align:center"><b>Fix</b></th></tr></thead>
<tbody>
<tr><td style="text-align:right">1</td><td style="text-align:left;vertical-align:top"><code>Port 8080 was already in use</code></td><td style="text-align:left;vertical-align:top">Another program (or the mock server) uses 8080.</td><td style="text-align:left;vertical-align:top">Stop it, or start with another port: <code>PORT=9090 ./mvnw spring-boot:run</code> (PowerShell: <code>$env:PORT="9090"</code>).</td></tr>
<tr><td style="text-align:right">2</td><td style="text-align:left;vertical-align:top"><code>Access denied for user 'root'@'localhost'</code></td><td style="text-align:left;vertical-align:top">Wrong MySQL password.</td><td style="text-align:left;vertical-align:top">Set <code>DB_USER</code> / <code>DB_PASSWORD</code> (Step 3) in the same terminal that starts the app.</td></tr>
<tr><td style="text-align:right">3</td><td style="text-align:left;vertical-align:top"><code>Public Key Retrieval is not allowed</code> or <code>Unable to load authentication plugin 'caching_sha2_password'</code></td><td style="text-align:left;vertical-align:top">MySQL 8 authentication with a custom <code>DB_URL</code>.</td><td style="text-align:left;vertical-align:top">Keep <code>allowPublicKeyRetrieval=true&amp;useSSL=false</code> in <code>DB_URL</code> (they are in the default). Or create a user: <code>CREATE USER 'chargeiq'@'localhost' IDENTIFIED BY 'pw'; GRANT ALL ON chargeiq.* TO 'chargeiq'@'localhost';</code>.</td></tr>
<tr><td style="text-align:right">4</td><td style="text-align:left;vertical-align:top"><code>The server time zone value ... is unrecognized</code>, or times shifted by 5 h 30 min</td><td style="text-align:left;vertical-align:top">Time zone missing from the JDBC URL.</td><td style="text-align:left;vertical-align:top">Use the default URL which contains <code>serverTimezone=Asia/Kolkata</code>. The app treats all times as naive IST.</td></tr>
<tr><td style="text-align:right">5</td><td style="text-align:left;vertical-align:top"><code>Unknown column ...</code> / <code>Table ... doesn't exist</code> / empty Insights</td><td style="text-align:left;vertical-align:top">Database imported from an older script, or only part of it.</td><td style="text-align:left;vertical-align:top">Drop the schema (<code>DROP DATABASE chargeiq;</code>) and re-import <code>db/chargeiq_full.sql</code>. After Option B check the ML tables and run <code>CALL sp_refresh_warehouse();</code>.</td></tr>
<tr><td style="text-align:right">6</td><td style="text-align:left;vertical-align:top"><code>Unknown collation: utf8mb4_0900_ai_ci</code></td><td style="text-align:left;vertical-align:top">Import on MariaDB or MySQL 5.7.</td><td style="text-align:left;vertical-align:top">Install MySQL 8.</td></tr>
<tr><td style="text-align:right">7</td><td style="text-align:left;vertical-align:top"><code>release version 17 not supported</code> / <code>invalid target release: 17</code></td><td style="text-align:left;vertical-align:top">Java older than 17.</td><td style="text-align:left;vertical-align:top">Install JDK 17+, then check <code>java -version</code> and <code>JAVA_HOME</code>.</td></tr>
<tr><td style="text-align:right">8</td><td style="text-align:left;vertical-align:top">Maven download fails (<code>PKIX path building failed</code>, <code>Connect timed out</code>, 407) behind a college proxy</td><td style="text-align:left;vertical-align:top">Proxy blocks <code>repo.maven.apache.org</code>.</td><td style="text-align:left;vertical-align:top">Create <code>%USERPROFILE%\.m2\settings.xml</code> (or <code>~/.m2/settings.xml</code>) with a <code>&lt;proxies&gt;&lt;proxy&gt;&lt;id&gt;college&lt;/id&gt;&lt;active&gt;true&lt;/active&gt;&lt;protocol&gt;http&lt;/protocol&gt;&lt;host&gt;PROXY_HOST&lt;/host&gt;&lt;port&gt;PROXY_PORT&lt;/port&gt;&lt;/proxy&gt;&lt;/proxies&gt;</code> block; for the first Maven download set <code>HTTPS_PROXY=http://PROXY_HOST:PROXY_PORT</code> (curl uses it) or download <code>apache-maven-3.9.9-bin.zip</code> manually and use your own <code>mvn spring-boot:run</code>. Try a mobile hotspot if the proxy stays blocked.</td></tr>
<tr><td style="text-align:right">9</td><td style="text-align:left;vertical-align:top">Workbench import error 1064 / 'Lost connection' / hangs</td><td style="text-align:left;vertical-align:top">Large script run through *Open SQL Script*, or old Workbench.</td><td style="text-align:left;vertical-align:top">Use **Server -&gt; Data Import -&gt; Import from Self-Contained File**, or the terminal command <code>mysql -u root -p &lt; db/chargeiq_full.sql</code>. Update Workbench to 8.0.x. If you see <code>max_allowed_packet</code>, run <code>SET GLOBAL max_allowed_packet=268435456;</code> and reconnect.</td></tr>
<tr><td style="text-align:right">10</td><td style="text-align:left;vertical-align:top">Login says <code>Invalid email or password</code></td><td style="text-align:left;vertical-align:top">Wrong demo password, or the database was not imported.</td><td style="text-align:left;vertical-align:top">Use the demo table above; check <code>SELECT COUNT(*) FROM users;</code> returns 656.</td></tr>
<tr><td style="text-align:right">11</td><td style="text-align:left;vertical-align:top"><code>mvnw: Permission denied</code> (macOS/Linux)</td><td style="text-align:left;vertical-align:top">The execute bit was lost when unzipping.</td><td style="text-align:left;vertical-align:top"><code>chmod +x backend/mvnw</code>, or run <code>sh mvnw spring-boot:run</code>.</td></tr>
<tr><td style="text-align:right">12</td><td style="text-align:left;vertical-align:top">Admin warehouse refresh returns empty counts</td><td style="text-align:left;vertical-align:top">Procedure missing (database built without <code>04_warehouse.sql</code>).</td><td style="text-align:left;vertical-align:top">Run <code>db/04_warehouse.sql</code>, then <code>CALL sp_refresh_warehouse();</code>.</td></tr>
</tbody>
</table>

## Regenerating the synthetic data and analytics

Requires MySQL with an empty `chargeiq` database created from `db/01_schema.sql` and `db/04_warehouse.sql`, user `root` / password `root` on `127.0.0.1:3306` (or edit `analytics/common.py`).

```bash
pip install pymysql pandas numpy scipy statsmodels scikit-learn textblob bcrypt matplotlib seaborn xlsxwriter nbformat nbconvert ipykernel
python analytics/run_all.py                    # whole pipeline, about 5 minutes (needs the mysqldump tool for the last step)
python analytics/run_all.py --skip-dump --skip-notebook --skip-excel     # faster
python analytics/verify_data.py                # 83 consistency checks only
```

Single steps: `generate_data.py` -> `clean_data.py` -> `load_to_mysql.py` -> `sentiment.py` -> `forecast.py` -> `segmentation.py` -> `recharge_predictions.py` -> `CALL sp_refresh_warehouse()` -> `export_clean.py` -> `visual_report.py`. The seed is fixed (42), so reruns give identical data. See `analytics/README.md`.

## Deploying a preview to Render (outline)

1. Create a hosted MySQL 8 database (Aiven for MySQL or Railway MySQL are suitable; TiDB Cloud is MySQL-compatible but, to our knowledge, has no stored procedures, so the Admin "Refresh warehouse" button would not work). Import the dump into it (`mysql -h HOST -P PORT -u USER -p < db/chargeiq_full.sql`; if the host rejects `DEFINER=root@localhost`, remove those clauses from a copy of the dump first).
2. Push the repository to GitHub. In Render choose **New -> Web Service**, runtime **Docker**, root directory `backend` (it contains the `Dockerfile`; the built UI is already inside `src/main/resources/static`).
3. Set the environment variables below. Render injects `PORT` itself and the Dockerfile uses it.

<table>
<thead><tr><th style="text-align:center"><b>Sr No</b></th><th style="text-align:center"><b>Variable</b></th><th style="text-align:center"><b>Value</b></th></tr></thead>
<tbody>
<tr><td style="text-align:right">1</td><td style="text-align:left;vertical-align:top"><code>DB_URL</code></td><td style="text-align:left;vertical-align:top"><code>jdbc:mysql://HOST:PORT/chargeiq?useSSL=true&amp;requireSSL=true&amp;serverTimezone=Asia/Kolkata&amp;characterEncoding=UTF-8</code> (hosted databases usually require SSL)</td></tr>
<tr><td style="text-align:right">2</td><td style="text-align:left;vertical-align:top"><code>DB_USER</code>, <code>DB_PASSWORD</code></td><td style="text-align:left;vertical-align:top">credentials of the hosted database</td></tr>
<tr><td style="text-align:right">3</td><td style="text-align:left;vertical-align:top"><code>JWT_SECRET</code></td><td style="text-align:left;vertical-align:top">a long random string (never use the default)</td></tr>
<tr><td style="text-align:right">4</td><td style="text-align:left;vertical-align:top"><code>CORS_ORIGINS</code></td><td style="text-align:left;vertical-align:top">your Render URL, for example <code>https://chargeiq.onrender.com</code></td></tr>
<tr><td style="text-align:right">5</td><td style="text-align:left;vertical-align:top"><code>CLOCK_MODE</code>, <code>CLOCK_ANCHOR</code></td><td style="text-align:left;vertical-align:top"><code>FIXED</code> and <code>2026-10-03T09:30:00</code> (default) so the demo data makes sense</td></tr>
<tr><td style="text-align:right">6</td><td style="text-align:left;vertical-align:top"><code>DEMO_MODE</code></td><td style="text-align:left;vertical-align:top"><code>true</code> for the demo trigger button</td></tr>
<tr><td style="text-align:right">7</td><td style="text-align:left;vertical-align:top"><code>SCHEDULER_ENABLED</code></td><td style="text-align:left;vertical-align:top"><code>true</code> (default)</td></tr>
<tr><td style="text-align:right">8</td><td style="text-align:left;vertical-align:top"><code>JAVA_OPTS</code></td><td style="text-align:left;vertical-align:top">optional, for example <code>-Xmx400m</code> on a small free instance</td></tr>
</tbody>
</table>

A free instance sleeps when idle, so the first request after a pause is slow. This section is a first outline and will be refined.

## Documentation index

<table>
<thead><tr><th style="text-align:center"><b>Sr No</b></th><th style="text-align:center"><b>Document</b></th><th style="text-align:center"><b>Purpose</b></th></tr></thead>
<tbody>
<tr><td style="text-align:right">1</td><td style="text-align:left;vertical-align:top"><code>docs/API_CONTRACT.md</code></td><td style="text-align:left;vertical-align:top">Every endpoint with auth, request and response examples.</td></tr>
<tr><td style="text-align:right">2</td><td style="text-align:left;vertical-align:top"><code>docs/postman/</code></td><td style="text-align:left;vertical-align:top">Postman collection (with tests and a Happy path flow) and local environment.</td></tr>
<tr><td style="text-align:right">3</td><td style="text-align:left;vertical-align:top"><code>docs/VIVA_NOTES.md</code></td><td style="text-align:left;vertical-align:top">Architecture, rubric mapping, algorithms with worked examples, 30 viva questions.</td></tr>
<tr><td style="text-align:right">4</td><td style="text-align:left;vertical-align:top"><code>docs/ER_DIAGRAM.md</code></td><td style="text-align:left;vertical-align:top">ER diagrams of the operational schema and the warehouse star schema.</td></tr>
<tr><td style="text-align:right">5</td><td style="text-align:left;vertical-align:top"><code>docs/PS4_MAPPING.md</code></td><td style="text-align:left;vertical-align:top">PS-IV syllabus points mapped to files, endpoints and screens.</td></tr>
<tr><td style="text-align:right">6</td><td style="text-align:left;vertical-align:top"><code>docs/PBL_FEATURE_LIST.md</code></td><td style="text-align:left;vertical-align:top">Problem, USP, user flow, team split, tech stack.</td></tr>
<tr><td style="text-align:right">7</td><td style="text-align:left;vertical-align:top"><code>analytics/README.md</code>, <code>data/DATA_REPORT.md</code>, <code>frontend/README_DEV.md</code></td><td style="text-align:left;vertical-align:top">Pipeline, data verification report, UI developer guide.</td></tr>
</tbody>
</table>

All data in this project is synthetic and generated for learning purposes; no real customer or charger data is used.
