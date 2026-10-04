# VoltSlot - PBL feature list

## 1. Problem

EV drivers in the Mumbai region today find chargers on a map, but a listed charger may be busy, incompatible, expensive or broken, and they only think about charging when the battery is already low. Operators cannot see when demand peaks, so some stations queue while others sit idle.

## 2. Solution and USP

VoltSlot is a smart charging-station locator and slot-booking system that **predicts, recommends, protects and reminds**:

<table>
<thead><tr><th style="text-align:center"><b>Sr No</b></th><th style="text-align:center"><b>Feature</b></th><th style="text-align:center"><b>What it does</b></th><th style="text-align:center"><b>Where to see it</b></th></tr></thead>
<tbody>
<tr><td style="text-align:right">1</td><td style="text-align:left;vertical-align:top">Demand-aware smart recommendation</td><td style="text-align:left;vertical-align:top">Ranks stations by six factors (distance, wait, predicted crowding, price, reliability, speed), explains the score and shows what you save compared with the nearest station.</td><td style="text-align:left;vertical-align:top">Home <code>/</code> -&gt; Smart pick; <code>POST /api/recommendations</code>; <code>RecommendationService</code></td></tr>
<tr><td style="text-align:right">2</td><td style="text-align:left;vertical-align:top">Predictive recharge reminders</td><td style="text-align:left;vertical-align:top">Learns each vehicle's charging rhythm (median gap between charges) and nudges you before you need to charge, with a ready slot suggestion (like a grocery re-order reminder).</td><td style="text-align:left;vertical-align:top">Popup after login, <code>/reminders</code>; <code>RechargePredictionService</code>, <code>ReminderService</code></td></tr>
<tr><td style="text-align:right">3</td><td style="text-align:left;vertical-align:top">Conflict-safe slot holds with alternatives</td><td style="text-align:left;vertical-align:top">A 5-minute hold owns the slot while you pay; two people can never book the same slot; if you lose the race you get alternative slots and stations at once.</td><td style="text-align:left;vertical-align:top">Booking drawer; <code>BookingService</code>, <code>booking_slots</code> UNIQUE key</td></tr>
<tr><td style="text-align:right">4</td><td style="text-align:left;vertical-align:top">Dynamic off-peak pricing</td><td style="text-align:left;vertical-align:top">Tariff x0.85 at night, x1.00 by day, x1.20 in the evening peak; the estimate and the recommendation use it.</td><td style="text-align:left;vertical-align:top">Estimate card; <code>EstimatorService</code>, <code>pricing_bands</code></td></tr>
<tr><td style="text-align:right">5</td><td style="text-align:left;vertical-align:top">Waitlist with auto-promotion</td><td style="text-align:left;vertical-align:top">Join the waiting list for a full slot; when someone cancels, the first in line gets a 10-minute hold automatically.</td><td style="text-align:left;vertical-align:top">Station page, My bookings; <code>WaitlistService</code></td></tr>
<tr><td style="text-align:right">6</td><td style="text-align:left;vertical-align:top">Fleet smart scheduler</td><td style="text-align:left;vertical-align:top">A fleet manager picks vehicles and a time window; the scheduler plans cheapest/least-crowded slots across stations, then books the plan in one click.</td><td style="text-align:left;vertical-align:top"><code>/fleet</code>; <code>FleetService</code></td></tr>
<tr><td style="text-align:right">7</td><td style="text-align:left;vertical-align:top">Trip planner</td><td style="text-align:left;vertical-align:top">Plans charging stops along a route for a vehicle and start charge, with timing and cost.</td><td style="text-align:left;vertical-align:top"><code>/trip</code>; <code>TripPlannerService</code></td></tr>
<tr><td style="text-align:right">8</td><td style="text-align:left;vertical-align:top">Time-machine demo clock</td><td style="text-align:left;vertical-align:top">Admin can move the application time forward to demonstrate reminders, hold expiry and no-shows live.</td><td style="text-align:left;vertical-align:top"><code>/admin</code>; <code>AppClock</code>, <code>POST /api/admin/clock/advance</code></td></tr>
<tr><td style="text-align:right">9</td><td style="text-align:left;vertical-align:top">Analytics (8 tabs)</td><td style="text-align:left;vertical-align:top">Overview, Demand &amp; Forecast, Stations &amp; Zones, Customers, Bookings &amp; Funnel, Reviews &amp; Sentiment, Weather &amp; Events, Smart Features: forecast, anomalies, K-Means segments, sentiment, cohorts.</td><td style="text-align:left;vertical-align:top"><code>/insights</code> (ADMIN, OPERATOR)</td></tr>
<tr><td style="text-align:right">10</td><td style="text-align:left;vertical-align:top">Role consoles</td><td style="text-align:left;vertical-align:top">Driver, operator (stations, points, schedule, walk-ins), fleet manager, admin (users, roles, warehouse).</td><td style="text-align:left;vertical-align:top"><code>/operator</code>, <code>/fleet</code>, <code>/admin</code></td></tr>
<tr><td style="text-align:right">11</td><td style="text-align:left;vertical-align:top">Wallet and invoices</td><td style="text-align:left;vertical-align:top">Prepaid wallet, simulated UPI/card, refund rules (100% / 50%), invoice per booking.</td><td style="text-align:left;vertical-align:top"><code>/wallet</code>, <code>/bookings</code></td></tr>
</tbody>
</table>

## 3. Core user flow: Locate -> Filter -> Predict -> Recommend -> Book

<table>
<thead><tr><th style="text-align:center"><b>Sr No</b></th><th style="text-align:center"><b>Step</b></th><th style="text-align:center"><b>What the user does</b></th><th style="text-align:center"><b>What the system does</b></th></tr></thead>
<tbody>
<tr><td style="text-align:right">1</td><td style="text-align:left;vertical-align:top">Locate</td><td style="text-align:left;vertical-align:top">Opens Home; map centres on their location or a zone.</td><td style="text-align:left;vertical-align:top"><code>GET /api/stations</code> returns stations with distance, connectors, free points now.</td></tr>
<tr><td style="text-align:right">2</td><td style="text-align:left;vertical-align:top">Filter</td><td style="text-align:left;vertical-align:top">Chooses connector, minimum kW, amenities, open now, radius or picks their vehicle.</td><td style="text-align:left;vertical-align:top">Same endpoint with filters; the vehicle limits results to compatible points.</td></tr>
<tr><td style="text-align:right">3</td><td style="text-align:left;vertical-align:top">Predict</td><td style="text-align:left;vertical-align:top">Looks at the crowding forecast of a station.</td><td style="text-align:left;vertical-align:top"><code>GET /api/stations/{id}/forecast</code> gives a 7x24 crowding grid and quietest hours.</td></tr>
<tr><td style="text-align:right">4</td><td style="text-align:left;vertical-align:top">Recommend</td><td style="text-align:left;vertical-align:top">Presses Smart pick and chooses a preset (balanced, fastest, cheapest, least crowded) or tunes the weights.</td><td style="text-align:left;vertical-align:top"><code>POST /api/recommendations</code> scores, ranks and explains; shows savings vs nearest.</td></tr>
<tr><td style="text-align:right">5</td><td style="text-align:left;vertical-align:top">Book</td><td style="text-align:left;vertical-align:top">Selects a slot, sees the estimate, pays within 5 minutes.</td><td style="text-align:left;vertical-align:top"><code>POST /api/bookings</code> (HOLD), <code>/confirm</code>; later check-in and complete; invoice and notification.</td></tr>
</tbody>
</table>

## 4. Roles

<table>
<thead><tr><th style="text-align:center"><b>Sr No</b></th><th style="text-align:center"><b>Role</b></th><th style="text-align:center"><b>Can do</b></th></tr></thead>
<tbody>
<tr><td style="text-align:right">1</td><td style="text-align:left;vertical-align:top">Guest</td><td style="text-align:left;vertical-align:top">Search stations, see forecasts and reviews, get recommendations, plan trips.</td></tr>
<tr><td style="text-align:right">2</td><td style="text-align:left;vertical-align:top">USER (driver)</td><td style="text-align:left;vertical-align:top">Everything a guest can, plus vehicles, bookings, waitlist, wallet, reminders, reviews, notifications.</td></tr>
<tr><td style="text-align:right">3</td><td style="text-align:left;vertical-align:top">OPERATOR</td><td style="text-align:left;vertical-align:top">Manage own stations/points, daily schedule, walk-in logging, Insights limited to own operator.</td></tr>
<tr><td style="text-align:right">4</td><td style="text-align:left;vertical-align:top">FLEET_MANAGER</td><td style="text-align:left;vertical-align:top">Fleet overview and smart scheduler for the fleet's vehicles.</td></tr>
<tr><td style="text-align:right">5</td><td style="text-align:left;vertical-align:top">ADMIN</td><td style="text-align:left;vertical-align:top">Users and roles, warehouse refresh, demo clock, all Insights, plus operator and fleet views.</td></tr>
</tbody>
</table>

## 5. Team of two

<table>
<thead><tr><th style="text-align:center"><b>Sr No</b></th><th style="text-align:center"><b>Area</b></th><th style="text-align:center"><b>Member A</b></th><th style="text-align:center"><b>Member B</b></th></tr></thead>
<tbody>
<tr><td style="text-align:right">1</td><td style="text-align:left;vertical-align:top">Backend</td><td style="text-align:left;vertical-align:top">Spring Boot services, REST controllers, JPA entities and repositories, booking engine and locking, wallet and refunds</td><td style="text-align:left;vertical-align:top"></td></tr>
<tr><td style="text-align:right">2</td><td style="text-align:left;vertical-align:top">Security and quality</td><td style="text-align:left;vertical-align:top">JWT, roles, validation, exception handling, JUnit/Mockito tests, Postman and Swagger</td><td style="text-align:left;vertical-align:top"></td></tr>
<tr><td style="text-align:right">3</td><td style="text-align:left;vertical-align:top">Database</td><td style="text-align:left;vertical-align:top"></td><td style="text-align:left;vertical-align:top">MySQL schema design, indexes, constraints, warehouse star schema, BI queries</td></tr>
<tr><td style="text-align:right">4</td><td style="text-align:left;vertical-align:top">Analytics (PS-IV)</td><td style="text-align:left;vertical-align:top"></td><td style="text-align:left;vertical-align:top">Synthetic data generator, Pandas cleaning, forecast, K-Means, sentiment, charts, notebook</td></tr>
<tr><td style="text-align:right">5</td><td style="text-align:left;vertical-align:top">Frontend</td><td style="text-align:left;vertical-align:top"></td><td style="text-align:left;vertical-align:top">React UI: locator, booking drawer, reminders, consoles, Insights dashboard</td></tr>
<tr><td style="text-align:right">6</td><td style="text-align:left;vertical-align:top">Shared</td><td style="text-align:left;vertical-align:top">README, viva preparation, demo script, final integration testing</td><td style="text-align:left;vertical-align:top">README, viva preparation, demo script, final integration testing</td></tr>
</tbody>
</table>

(Update the names and adjust the split to what each of you actually did. The Q&A in `docs/VIVA_NOTES.md` uses the same Member A / Member B split.)

## 6. Tech stack as built

<table>
<thead><tr><th style="text-align:center"><b>Sr No</b></th><th style="text-align:center"><b>Layer</b></th><th style="text-align:center"><b>Technology</b></th></tr></thead>
<tbody>
<tr><td style="text-align:right">1</td><td style="text-align:left;vertical-align:top">Backend</td><td style="text-align:left;vertical-align:top">Java 17, Spring Boot 3.3.5 (web, data-jpa, security, validation), Hibernate, Maven wrapper</td></tr>
<tr><td style="text-align:right">2</td><td style="text-align:left;vertical-align:top">Security</td><td style="text-align:left;vertical-align:top">Spring Security, JWT (jjwt 0.12.6, HS256), BCrypt</td></tr>
<tr><td style="text-align:right">3</td><td style="text-align:left;vertical-align:top">API docs / testing</td><td style="text-align:left;vertical-align:top">springdoc-openapi 2.6.0 (Swagger UI), Postman collection, JUnit 5, Mockito, H2 (tests only)</td></tr>
<tr><td style="text-align:right">4</td><td style="text-align:left;vertical-align:top">Database</td><td style="text-align:left;vertical-align:top">MySQL 8 (OLTP schema + star-schema warehouse, one stored procedure, 6 views)</td></tr>
<tr><td style="text-align:right">5</td><td style="text-align:left;vertical-align:top">Analytics</td><td style="text-align:left;vertical-align:top">Python 3, pandas, numpy, scipy, statsmodels, scikit-learn, TextBlob, matplotlib, seaborn, xlsxwriter, Jupyter notebook</td></tr>
<tr><td style="text-align:right">6</td><td style="text-align:left;vertical-align:top">Frontend</td><td style="text-align:left;vertical-align:top">React 18, Vite 5, react-router 6, Recharts, Leaflet / react-leaflet, hand-written CSS (dark theme), a Node mock API for UI-only development</td></tr>
<tr><td style="text-align:right">7</td><td style="text-align:left;vertical-align:top">Packaging</td><td style="text-align:left;vertical-align:top">The React build is copied into <code>backend/src/main/resources/static</code>, so one Spring Boot jar serves UI and API; <code>backend/Dockerfile</code> for hosting</td></tr>
</tbody>
</table>

## 7. Data and scale (synthetic)

32 stations and 103 charging points of 8 operators, 656 users, 701 vehicles, 9,542 bookings, 7,789 charging sessions, 1,718 reviews, 54,422 funnel events, history 01-Oct-2025 to 03-Oct-2026, reference "now" 03-Oct-2026 09:30 IST. Details: `data/DATA_REPORT.md`.

## 8. Limitations (say them before the examiner does)

- Payments, maps routing and weather are simulated or straight-line; the trip planner uses a straight-line corridor.
- Data is synthetic; no real charger hardware (check-in and completion are simulated).
- Analytics queries target MySQL 8 and are not tested on H2.
