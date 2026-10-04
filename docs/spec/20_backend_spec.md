# Backend specification – Spring Boot (IP / Java FSD project)

The backend is graded on the 12‑point IP rubric (concept, Spring Boot structure, CRUD, MySQL + Spring Data JPA, entity relationships (1‑1, 1‑N, N‑1, N‑M),
REST design + status codes, layered architecture (Controller/Service/Repository/Entity/DTO), validation + exception handling, JWT auth + role based access,
Postman/Swagger testing, clean code, viva explainability). **Stay on the syllabus**: Spring Boot, REST, Spring Data JPA/Hibernate, Spring Security + JWT, Swagger/OpenAPI, JUnit/Mockito.
No Redis/Kafka/WebSocket/microservices. `@Scheduled`, application events, validation, auditing, pagination are all fine (they are Spring Boot core).
Explainable, readable code with comments at the key places (the students must be able to explain it in a viva). No Lombok (plain getters/setters; DTOs may be Java `record`s).

## Build
* `/home/claude/chargeiq/backend`, Maven, Java release 17 (build with the installed JDK 21), Spring Boot **3.3.5**, package `com.chargeiq`.
* Dependencies: web, data-jpa, security, validation, mysql-connector-j, springdoc-openapi-starter-webmvc-ui **2.6.0**, jjwt **0.12.6** (api/impl/jackson), test starters + spring-security-test, **H2 (test scope)**.
* Include the Maven wrapper (`mvnw`, `mvnw.cmd`, `.mvn/wrapper/*`) so students need no Maven. Add `Dockerfile` (multi-stage JDK17 → JRE17, honours `PORT`) and `.gitignore`.
* `application.properties` (env‑overridable): `DB_URL` (default `jdbc:mysql://localhost:3306/chargeiq?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Kolkata&characterEncoding=UTF-8`),
  `DB_USER` (root), `DB_PASSWORD` (root), `JWT_SECRET` (long default for dev), `JWT_EXPIRY_HOURS` (12), `PORT` (8080), `spring.jpa.hibernate.ddl-auto=none` (comment: set to `validate` to verify mapping),
  `spring.jpa.open-in-view=false`, `app.clock.mode=FIXED`, `app.clock.anchor=2026-10-03T09:30:00`, `app.demo-mode=true`, `app.scheduler.*` intervals, springdoc at `/swagger-ui.html`, JSON dates ISO, time zone Asia/Kolkata (set JVM default in `main`).
  `application-test.properties` for H2 (MySQL mode, `ddl-auto=create-drop`).
* DB schema is **`db/01_schema.sql` (already written – the contract)**. Entities must match it exactly (column names via Spring's default snake_case naming). Use `EnumType.STRING` on VARCHAR columns, `BigDecimal` for DECIMAL, `Double` for DOUBLE,
  `Long` ids, `LocalDateTime`/`LocalDate`, `Boolean` for TINYINT(1). Avoid `@Lob`/TEXT. Verify once with `ddl-auto=validate` against MySQL.
  **Do not mutate the shared MySQL database `chargeiq`** (the data pipeline is loading it). For manual MySQL checks create your own database `chargeiq_dev` from `db/01_schema.sql` (sed the db name) and insert a few rows yourself.
* Frontend static files are served from `src/main/resources/static` (a placeholder `index.html` for now) with an SPA fallback controller forwarding every non‑`/api`, non‑file route to `/index.html`.

## Packages
`config, security, entity, repository, dto, service, controller, exception, scheduler, util, clock`. Controllers are thin; business rules live in services; repositories are Spring Data interfaces (derived queries, `@Query` JPQL and a few native queries,
pagination with `Pageable`, `@Lock(PESSIMISTIC_WRITE)` where needed). Analytics uses `NamedParameterJdbcTemplate` on the `dw_*` tables (explain why in a class comment). Use JPA auditing with a `DateTimeProvider` bound to the app clock.
Mappers: hand‑written static mapper classes (no MapStruct).

## App clock ("time machine")
`AppClock` bean: `now()` → `LocalDateTime` in IST. Mode `FIXED`: now = anchor + (real elapsed time since startup) + manual offset; mode `SYSTEM`: real time + manual offset. Every service/scheduler uses `AppClock` (never `LocalDateTime.now()` directly).
`GET /api/clock` public → `{now, mode, anchor, offsetSeconds}`. `POST /api/admin/clock/advance {hours?, minutes?, days?}` and `POST /api/admin/clock/reset` (ADMIN) – after advancing, immediately run the scheduler jobs once.

## Security
Stateless JWT (HS256, claims: `sub` email, `uid`, `role`; 12 h). `JwtAuthFilter` → `SecurityContext`. BCrypt. JSON 401/403 handlers. CORS for `http://localhost:5173`.
Public: `/api/auth/register`, `/api/auth/login`, `GET /api/stations/**`, `/api/reference/**`, `GET /api/clock`, `POST /api/recommendations`, `POST /api/trips/plan`, swagger/openapi, static + SPA routes.
`/api/analytics/**` ADMIN or OPERATOR (OPERATOR automatically restricted to its own operator_id, ignore client supplied operatorId). `/api/admin/**` ADMIN. `/api/operator/**` OPERATOR or ADMIN (OPERATOR only own stations → 403 otherwise).
`/api/fleet/**` FLEET_MANAGER or ADMIN. Everything else authenticated. Ownership checks in services (a user can only touch their own vehicles/bookings/wallet/notifications → 403/404).
Registration always creates role USER + wallet (balance ₹0). Blocked users cannot login (403 with message).

## Errors & validation
Uniform error body: `{timestamp, status, error, message, path, fieldErrors:[{field,message}]?, code?}`.
`@RestControllerAdvice`: validation (400), `ResourceNotFoundException` (404), `BadRequestException` (400), `ConflictException`/`SlotUnavailableException` (409, body adds `alternatives`), `InsufficientBalanceException` (402),
`AccessDeniedException` (403), auth (401), data‑integrity (409), generic (500, no stack trace). Bean Validation annotations on request records. Use proper status codes: 201 + `Location` on create, 204 on delete, etc.

## Core business rules
**EstimatorService** – exactly the formulas in `00_overview.md`. Exposed at `POST /api/bookings/estimate`.

**AvailabilityService** – for a station + date: grid per point of 30‑min slots `FREE | BOOKED | PAST | UNAVAILABLE` (UNAVAILABLE = point not ACTIVE or outside open_hour/close_hour); built from `booking_slots`.
`findEarliestSlot(point(s), earliestStart, slotsNeeded, horizon)` used by recommendation/fleet/reminders/alternatives.

**BookingService.createHold** (`@Transactional`): validate (vehicle belongs to user or fleet manager's fleet; point ACTIVE; connector compatible and acceptedKw>0; start on grid, ≥ now, ≤ now+14 days, inside station hours; no overlapping active booking for the *same vehicle*;
user has ≤ 5 active future bookings); **lock the charging point row (`PESSIMISTIC_WRITE`)**; check `booking_slots` for all needed slots; insert booking (status HOLD, `hold_expires_at = now+5 min`, `booking_code` like `VSL-7K3M9X`) and its `booking_slots`
(UNIQUE (point,slot) is the safety net → map `DataIntegrityViolationException` to `SlotUnavailableException`). On conflict return **409 with alternatives**: same‑station free slots (±3 h, any compatible point) and top‑3 other stations via the RecommendationService.
If `chargingPointId` is omitted the service auto‑assigns the best free compatible point (highest accepted kW, then lowest tariff).
`confirm(paymentMethod)`: HOLD must be unexpired → debit wallet (WALLET) or simulate UPI/CARD success → `payments` row (PAID, invoice `INV-2526-000123` style) → status CONFIRMED → notification BOOKING_CONFIRMED. Insufficient wallet → 402.
`cancel`: only HOLD/CONFIRMED; ≥ 60 min before start → full refund (`REFUNDED`), < 60 min → 50 % refund (`PART_REFUND`); delete slots; refund to wallet (WALLET payments) – for UPI/CARD record refund amount only; publish `SlotsReleasedEvent` → WaitlistService promotes first matching WAITING entry (creates a HOLD with source WAITLIST for that user, 10 min hold, notification WAITLIST_PROMOTED).
`checkIn`: CONFIRMED and now within [start−15 min, start+15 min]. `complete` (simulated end of charge): CHECKED_IN → computes energy via estimator (optional `socEnd`), creates `charging_sessions`, final `payments` amount adjustments (refund difference to wallet if cheaper), status COMPLETED, notification CHARGE_COMPLETE (with CO₂ avoided), then `RechargePredictionService.recompute(vehicle)`.
Scheduler (`@Scheduled`, uses AppClock): (1) HOLD past `hold_expires_at` → EXPIRED + free slots + release event; (2) CONFIRMED with now > start+15 min → NO_SHOW, keep slots, penalty 25 % retained, rest refunded, `users.no_show_count++`, notification; (3) CHECKED_IN with now ≥ end_time → auto `complete`;
(4) BOOKING_SOON notification 60 min before start (once); (5) waitlist entries whose desired_start < now → EXPIRED; (6) reminder evaluation every 5 min. Also run (6) on `ApplicationReadyEvent`.

**RecommendationService** (the PBL USP – must be explainable):
Inputs: location, optional vehicle (connectors + battery + max kW) or explicit connectorCodes, `socStart/socTarget` (defaults 20→80), `arrivalTime` (default now), preset or custom weights, radius (default 25 km), limit (default 8).
For every ACTIVE station inside the radius with ≥1 ACTIVE compatible point:
`distanceKm` (haversine) → `etaMinutes = ceil(distanceKm*1.35 / 24 * 60)` (road factor 1.35, 24 km/h Mumbai avg) → `arrival = max(requestedArrival, now+eta)`;
earliest free slot ≥ arrival on any compatible point for the slots needed (look ahead 12 h; none → skip station or mark unavailable and rank last); `waitMinutes = slotStart − arrival`; best point = the one giving the earliest start, tie → lower cost;
estimator for duration/cost/effective tariff at the slot's hour; `crowdingIndex` from `demand_forecast` for (station, dow, hour of slot start; default 0 if missing); reliability from `stations.reliability_score`.
Normalised components (0..1, higher = better): `distance = 1 − min(d/radius,1)`; `wait = 1 − min(wait/90,1)`; `crowding = 1 − crowdingIndex/100`; `price = 1 − (cost−minCost)/(maxCost−minCost+ε)` over candidates; `reliability = score/100`; `speed = min(acceptedKw/120,1)`.
Presets (weights): BALANCED `{distance .22, wait .22, crowding .20, price .14, reliability .12, speed .10}`; FASTEST `{distance .20, wait .25, crowding .05, price .05, reliability .05, speed .40}`;
CHEAPEST `{distance .15, wait .10, crowding .10, price .50, reliability .10, speed .05}`; LEAST_CROWDED `{distance .15, wait .20, crowding .45, price .05, reliability .10, speed .05}`. Custom weights are re‑normalised to sum 1.
`score = 100 * Σ weight_i * component_i`. Response carries per‑component `{score, weight, contribution}`, human readable `reasons` ("1.8 km away, ~8 min drive", "No wait: slot free at 19:30", "Predicted crowding LOW (22) at that hour", "₹14 cheaper than the nearest station"),
`tags` (Nearest / Fastest / Cheapest / Quietest / Best overall), and `nearestBaseline` + `savings` (minutes saved and rupees saved vs. the nearest compatible station) – this is the headline demo. Deterministic and unit tested.

**RechargePredictionService + ReminderService** (teacher‑requested BigBasket‑style “time to recharge” nudge): algorithm in `00_overview.md`. `recompute(vehicle)` after every completed session + at startup if missing (for vehicles with ≥3 sessions);
`evaluate()` creates one `RECHARGE_REMINDER` notification (status ACTIVE) per eligible vehicle (no duplicate ACTIVE/SNOOZED one). Notification `payload` JSON: `{vehicleId, stationId, pointId, slotStart, slotEnd, dueAt}`.
`suggestion` = best station for the vehicle (RecommendationService BALANCED, around user's home or preferred station, requested time = max(now+1h, next_due or preferred_hour that day)) – recomputed lazily when the reminder is read/booked so it is never stale.
Actions: snooze (hours; status SNOOZED + snoozed_until, re‑activated by the scheduler), dismiss (DISMISSED; do not recreate until the next completed session), book (creates HOLD with source REMINDER, notification marked DONE; the UI then confirms payment).
`POST /api/reminders/demo-trigger {vehicleId}` (only when `app.demo-mode=true`) moves `next_due_at` to now so the popup can be demonstrated. `GET /api/reminders/predictions` shows state `UPCOMING | DUE_SOON | OVERDUE | NO_DATA`, cadence history, confidence.

**WaitlistService**, **WalletService** (topup 100..50,000, transactions page), **NotificationService**, **ReviewService** (only users with a COMPLETED session at that station may review; sentiment via a small embedded lexicon + negation handling in `SentimentService`,
label POSITIVE ≥ 0.15 / NEGATIVE ≤ −0.05; after save recompute station `avg_rating, review_count, sentiment_score, reliability_score`).
**FleetService**: overview + greedy **fleet scheduler** (sort vehicles by lowest SoC/urgency, for each vehicle call recommendation with window [windowStart, windowEnd], keep an in‑memory tentative occupancy set so no two vehicles share a point‑slot, spread vehicles across stations when `maxConcurrentPerStation` is given); `apply` creates CONFIRMED bookings (source FLEET) paid from the manager's wallet.
**TripPlannerService**: straight‑line corridor planner (road factor 1.3, avg speed 45 km/h highway/ 28 km/h city blend) – usable range = `range_km * soc/100`, reserve 10 %; if destination reachable → no stop; else choose DC‑capable compatible stations within a 6 km corridor of the line between 35 % and 85 % of the reachable distance, scored by the RecommendationService (BALANCED) with arrival time; repeat until reachable; return legs, polyline (straight segments via stops) and notes ("approximate straight‑line corridor").
**OperatorService**: station CRUD (own operator), point CRUD, point status, day schedule (bookings per point for a date), walk‑in logging, small dashboard. **AdminService**: users page/search, role/status change, stats, warehouse refresh (`CALL sp_refresh_warehouse()`), clock, run reminders.
**AnalyticsService** (reads `dw_*` + analytics tables; all endpoints take `from`,`to`,`zone`,`connector`,`tier`,`operatorId`): see endpoint list. Anomalies = z‑score of daily sessions vs a 28‑day rolling mean/std (|z| ≥ 2.2); annotate holiday/rain cause when applicable. `insights` returns 6‑10 auto‑generated English insight sentences from rules over the same queries.

## REST API (all under `/api`; JSON camelCase; pagination → `{content,page,size,totalElements,totalPages}`)
**Auth/user**: `POST /auth/register {fullName,email,password,phone?,city?}` 201 · `POST /auth/login {email,password}` → `{token,tokenType,expiresAt,user}` · `GET /auth/me` · `PUT /users/me {fullName,phone,city,homeLat,homeLon,reminderEnabled,reminderLeadHours}` · `POST /auth/change-password`.
`UserDto {id,fullName,email,phone,role,city,operatorId,operatorName,fleetId,fleetName,reminderEnabled,reminderLeadHours,noShowCount,walletBalance,homeLat,homeLon}`.
**Clock**: `GET /clock`; admin advance/reset.
**Reference**: `GET /reference/connectors|vehicle-models|amenities|zones|pricing-bands` (`zones` → `[{zone,stations,latitude,longitude}]`).
**Vehicles**: `GET /vehicles`, `POST /vehicles {modelId,regNumber,nickname,avgDailyKm}`, `PUT /vehicles/{id}`, `DELETE /vehicles/{id}` (409 if future bookings) → `VehicleDto {id,modelId,make,model,variant,category,batteryKwh,acMaxKw,dcMaxKw,rangeKm,kmPerKwh,connectorCodes[],regNumber,nickname,avgDailyKm,fleetId}`. Fleet managers' vehicles get their fleetId.
**Stations (public GET)**:
* `GET /stations?lat&lon&radiusKm&connector&minKw&amenity&zone&q&openNow&sort=distance|rating|price|reliability&page&size` → page of `StationSummaryDto {id,name,address,zone,city,latitude,longitude,tier,operatorId,operatorName,distanceKm?,connectors:[{code,count,maxKw}],totalPoints,activePoints,minTariff,avgRating,reviewCount,reliabilityScore,sentimentLabel,openNow,openHour,closeHour,freeNowPoints,crowdingIndexNow,crowdingLevelNow}`
* `GET /stations/{id}` → `StationDetailDto` = summary + `amenities[{id,name,icon}]`, `points[{id,label,connectorCode,connectorName,currentType,powerKw,tariffPerKwh,status}]`, `ratingBreakdown{1..5}`, `sentiment{positivePct,neutralPct,negativePct}`, `uptimePct`.
* `GET /stations/{id}/availability?date&vehicleId?` → `{stationId,date,slotMinutes:30,openHour,closeHour,now,points:[{pointId,label,connectorCode,powerKw,tariffPerKwh,compatible,slots:[{start,state}]}],crowdingByHour:[24 ints]}`
* `GET /stations/{id}/forecast` → `{stationId,grid:[{dayOfWeek,hour,expectedSessions,crowdingIndex,level}],quietestNext24h:[{start,crowdingIndex}]}`
* `GET /stations/{id}/reviews?page&size`, `POST /stations/{id}/reviews {rating,comment,bookingId?}` (auth).
**Recommend**: `POST /recommendations {latitude,longitude,vehicleId?,connectorCodes?,arrivalTime?,socStart?,socTarget?,preset?,weights?{distance,wait,crowding,price,reliability,speed},radiusKm?,limit?}` →
`{generatedAt,preset,weights,energyKwhNeeded,items:[{rank,score,station:StationSummaryDto,point:{pointId,label,connectorCode,powerKw,tariffPerKwh},etaMinutes,arrivalTime,slotStart,slotEnd,slots,waitMinutes,chargeMinutes,estimatedCost,effectiveTariff,crowdingIndex,crowdingLevel,breakdown:{<component>:{score,weight,contribution}},reasons[],tags[]}],nearestBaseline:{...},savings:{minutesSaved,rupeesSaved,summary}}`.
**Bookings**: `POST /bookings/estimate {vehicleId,chargingPointId,startTime?,socStart,socTarget}` → `{energyKwh,acceptedKw,durationMinutes,slots,effectiveTariff,estimatedCost,co2AvoidedKg,kmAdded,bandName,multiplier}` ·
`POST /bookings {vehicleId,chargingPointId?|stationId?,startTime,socStart,socTarget,source?}` 201 HOLD / 409 `{...,alternatives:{sameStation:[{pointId,label,start}],otherStations:[RecommendedItem]}}` · `POST /bookings/{id}/confirm {paymentMethod}` · `POST /bookings/{id}/cancel {reason?}` · `POST /bookings/{id}/check-in` · `POST /bookings/{id}/complete {socEnd?}` ·
`GET /bookings?status&upcoming&page&size` · `GET /bookings/{id}` · `GET /bookings/{id}/invoice`.
`BookingDto {id,bookingCode,status,source,startTime,endTime,slots,station{id,name,zone,address,latitude,longitude},point{id,label,connectorCode,powerKw,tariffPerKwh},vehicle{id,nickname,regNumber,make,model},socStart,socTarget,estEnergyKwh,estCost,holdExpiresAt,checkedInAt,cancelledAt,cancelReason,createdAt,payment{amount,method,status,invoiceNo,refundedAmount}|null,session{startedAt,endedAt,energyKwh,socEnd,amount,co2AvoidedKg}|null,canCancel,canCheckIn,refundIfCancelled,qrPayload}`.
**Waitlist**: `POST /waitlist {vehicleId,stationId,desiredStart,slots}`, `GET /waitlist`, `DELETE /waitlist/{id}`.
**Wallet**: `GET /wallet` → `{balance,recent:[...]}`, `GET /wallet/transactions?page&size`, `POST /wallet/topup {amount,method}`.
**Notifications**: `GET /notifications?unreadOnly&page&size`, `GET /notifications/unread-count`, `POST /notifications/{id}/read`, `POST /notifications/read-all`.
**Reminders**: `GET /reminders/predictions`, `GET /reminders/active`, `POST /reminders/{notificationId}/snooze {hours}`, `/dismiss`, `/book` → BookingDto (HOLD), `POST /reminders/refresh`, `POST /reminders/demo-trigger {vehicleId}`.
 `ReminderDto {notificationId,vehicle{id,label,make,model},dueAt,hoursUntilDue,overdue,headline,message,confidence,medianIntervalDays,lastChargeAt,suggestion{stationId,stationName,zone,pointId,connectorCode,slotStart,slotEnd,crowdingLevel,crowdingIndex,estimatedCost,chargeMinutes,distanceKm,reason}}`.
**Fleet**: `GET /fleet/overview`, `POST /fleet/schedule`, `POST /fleet/schedule/apply`, vehicle CRUD via `/vehicles`.
**Trips**: `POST /trips/plan {originLat,originLon,destLat,destLon,vehicleId?,startSocPercent,departAt?,reserveSocPercent?}`.
**Operator**: `GET /operator/dashboard`, `GET|POST /operator/stations`, `PUT|DELETE /operator/stations/{id}`, `POST /operator/stations/{id}/points`, `PUT|DELETE /operator/points/{id}`, `PUT /operator/points/{id}/status`, `GET /operator/stations/{id}/schedule?date`, `POST /operator/walk-ins`.
**Admin**: `GET /admin/users`, `PUT /admin/users/{id}/role`, `PUT /admin/users/{id}/status`, `GET /admin/stats`, `POST /admin/warehouse/refresh`, `POST /admin/clock/advance|reset`, `POST /admin/reminders/run-now`.
**Analytics** (common filters `from,to,zone,connector,tier,operatorId`):
`/analytics/overview` → `{kpis,previous,deltaPct,sparkline}` (kpis: sessions,energyKwh,revenue,avgSessionKwh,avgDurationMin,utilizationPct,uniqueUsers,bookings,cancellationRatePct,noShowRatePct,co2AvoidedKg,avgLeadHours,peakHour) ·
`/analytics/trend?granularity=DAY|WEEK|MONTH` → `{series[{period,sessions,energyKwh,revenue,avgTariff}],forecast[{date,predicted,lower,upper}],anomalies[{date,value,expected,zScore,reason}]}` ·
`/analytics/heatmap?metric=sessions|revenue&stationId?` → `[{dayOfWeek,hour,value}]` · `/analytics/zones` · `/analytics/mix?by=connector|vehicleCategory|payment|source|tier|dayPart` · `/analytics/funnel` ·
`/analytics/segments` · `/analytics/stations?sort&limit` · `/analytics/sentiment` · `/analytics/weather-impact` · `/analytics/cohorts` · `/analytics/lead-time` · `/analytics/insights` · `/analytics/export/sessions.csv`.
(Shapes as in the earlier plan: arrays of flat objects with obvious camelCase names; document each in OpenAPI via `@Schema`/records and in `docs/API_CONTRACT.md` with one example JSON per endpoint.)

## Tests (JUnit 5 + Mockito + MockMvc + H2) – must pass with `./mvnw test` without MySQL
Unit: `EstimatorServiceTest`, `RecommendationServiceTest` (ranking, presets, savings vs nearest), `BookingServiceTest` (conflict → alternatives, refund policy 60‑min rule, expiry), `RechargePredictionServiceTest` (median interval, confidence, state), `SentimentServiceTest`, `JwtServiceTest`.
Integration (`@SpringBootTest` + MockMvc, profile `test`, fixture builder creating stations/points/users/vehicles): `AuthIT` (register/login/me, 401, 403 by role), `ValidationIT` (400 + fieldErrors), `StationIT`, `BookingFlowIT` (hold→confirm→check‑in→complete + wallet math),
`BookingConcurrencyIT` (20 parallel threads on one slot → exactly 1 HOLD created, 19 × 409), `ReminderFlowIT` (predictions → active reminder → snooze → book). Show Surefire summary in the final report.
Also deliver `docs/postman/VoltSlot.postman_collection.json` (+ environment; login request stores the token in a collection variable; folders per module; example bodies; test scripts asserting status codes) and `docs/openapi.json` (exported from the running app) and `docs/API_CONTRACT.md`.
Create `docs/VIVA_NOTES.md` (layers diagram, ER mapping table of 1‑1/1‑N/N‑1/N‑M examples, request lifecycle, security flow, concurrency explanation, likely viva Q&A).
