# Service-layer contracts (binding for every implementer)

Package root `com.chargeiq`. Already written (do NOT rewrite, only append where stated): `entity/*`, `entity/enums/*`, `repository/*`, `dto/*`, `exception/*`,
`security/*` (`AuthUser` = principal), `config/*`, `clock/AppClock`, `util/{GeoUtil,TimeUtil,CodeGenerator}`.
Authoritative behaviour = `docs/spec/00_overview.md` + `docs/spec/20_backend_spec.md`. This file fixes the **Java signatures** so five people can write code in parallel
against each other without compiling together. If you need something that is not listed here, add it inside YOUR OWN classes only. Need an extra repository method?
Append it to the existing interface (use `Edit` with a unique anchor; never rewrite the file) and list it in your final report.

## Global rules
* No Lombok. Constructor injection only (single constructor, no `@Autowired` on fields). Spring Boot 3.3 / Jakarta (`jakarta.*`), Java 17 (records, switch expressions, `var`, text blocks OK).
* **Every service class is annotated `@Service` and `@Transactional`** (class level, `org.springframework.transaction.annotation.Transactional`); pure read methods may add `@Transactional(readOnly = true)`.
  Reason: `spring.jpa.open-in-view=false`, so lazy associations are only readable inside a transaction – map entities → DTOs **inside** the service, never in controllers.
* Time: always `AppClock.now()` / `appClock.today()`; never `LocalDateTime.now()`.
* Entities have no auditing: services set `createdAt`/`updatedAt` themselves from `AppClock`.
* Money: `BigDecimal` scale 2, `RoundingMode.HALF_UP`. Doubles for energy/kW/km.
* Authorisation is enforced in services via `AuthUser` (id, role, operatorId, fleetId): wrong owner → `ForbiddenException` (403); missing → `ResourceNotFoundException` (404).
* Controllers are thin: `@RestController`, `@RequestMapping("/api/...")`, springdoc `@Tag(name=..)` on the class and `@Operation(summary=..)` on every method,
  `@Valid @RequestBody`, `@AuthenticationPrincipal AuthUser actor`, `ResponseEntity<>` with explicit status (201 + `Location` for creates via `ResponseEntity.created(URI)`, 204 for deletes).
  Parameter binding: `@RequestParam` / `@PathVariable` with explicit names; dates use `@DateTimeFormat(iso = ISO.DATE)` / `ISO.DATE_TIME`.
* Every class gets a short Javadoc in plain English saying *what* and *why* (this is graded in a viva). Comment tricky logic.
* Paths of public controllers are already whitelisted in `SecurityConfig`; do not change `SecurityConfig` (tell the architect if a route needs a rule change).
* Collections in DTOs: never null (use `List.of()`).
* Crowding level helper lives in `ForecastService.level(double)` → `"LOW" | "MEDIUM" | "HIGH"` (<35, <65, else).

## Shared types (new classes)
```java
package com.chargeiq.event;
public record SlotsReleasedEvent(Long stationId, Long pointId, java.time.LocalDateTime from, java.time.LocalDateTime to) { }
// published by BookingService.cancel / expiry (via ApplicationEventPublisher); WaitlistService listens.
```

## Group A – locator & recommendation (owner: agent A)
```java
@Service public class EstimatorService {
    public record VehicleSpec(double batteryKwh, double acMaxKw, double dcMaxKw, double kmPerKwh, VehicleCategory category, Set<String> connectorCodes) {}
    public EstimatorService(PricingBandRepository pricingBands);                    // caches 24 bands (lazy), falls back to constants in 00_overview.md
    public static VehicleSpec specOf(VehicleModel m);                               // connectorCodes from m.getConnectors()
    public static VehicleSpec genericSpec(Collection<String> connectorCodes);       // battery 40, ac 7.4, dc 50, 6.0 km/kWh, CAR  (used when only connectors are given)
    public double acceptedKw(VehicleSpec v, ChargingPoint p);                       // 0 when connector not in v.connectorCodes()
    public boolean compatible(VehicleSpec v, ChargingPoint p);                      // acceptedKw > 0
    public EstimateResponse estimate(VehicleSpec v, ChargingPoint p, LocalDateTime start, int socStart, int socTarget); // exact formulas of 00_overview.md; start==null -> multiplier 1.0, band "NORMAL"
    public BigDecimal multiplier(int hourOfDay);
    public String bandName(int hourOfDay);
}

@Service public class ForecastService {
    public ForecastService(DemandForecastRepository repo, StationRepository stations, AppClock clock);
    public double crowdingIndex(Long stationId, LocalDateTime t);        // lookup by (stationId, dayOfWeek 1=Mon..7=Sun i.e. t.getDayOfWeek().getValue(), hour), 0 when missing; cached in memory, refresh() clears
    public double expectedSessions(Long stationId, LocalDateTime t);
    public static String level(double crowdingIndex);
    public List<Integer> crowdingByHour(Long stationId, LocalDate date);  // 24 ints
    public ForecastDto forecast(Long stationId);                          // grid 7x24 + quietestNext24h (top 3 lowest crowding hours of next 24h from clock.now(), hour-aligned start)
    public void refresh();
}

@Service public class AvailabilityService {
    public AvailabilityService(StationRepository stations, ChargingPointRepository points, BookingSlotRepository slots, VehicleRepository vehicles,
                               EstimatorService estimator, ForecastService forecast, AppClock clock);
    public AvailabilityDto availability(Long stationId, LocalDate date, Long vehicleId /*nullable*/);   // states FREE|BOOKED|PAST|UNAVAILABLE as in spec
    public Map<Long, Set<LocalDateTime>> occupiedSlots(Collection<Long> pointIds, LocalDateTime from, LocalDateTime to);  // from booking_slots, every pointId present as key
    public boolean withinOpeningHours(Station st, LocalDateTime slotStart, int slots);   // every slot start hour must be in [openHour, closeHour)
    public boolean isFree(Set<LocalDateTime> occupied, LocalDateTime start, int slots);
    /** first on-grid start >= earliest (ceilToSlot) within horizonHours where `slots` consecutive slots are free and inside opening hours; null if none. */
    public LocalDateTime earliestFreeStart(Station st, Set<LocalDateTime> occupied, LocalDateTime earliest, int slots, int horizonHours);
}

@Service public class StationService {
    public StationService(StationRepository stations, ChargingPointRepository points, BookingSlotRepository slots, ReviewRepository reviews,
                          ForecastService forecast, AppClock clock);
    public PageResponse<StationSummaryDto> search(Double lat, Double lon, Double radiusKm, String connector, Double minKw, String amenity, String zone,
                                                  String q, Boolean openNow, String sort, int page, int size);
    public StationDetailDto detail(Long id);
    public Station require(Long id);                                       // 404
    public List<StationSummaryDto> summaries(Collection<Station> stations, Map<Long, Double> distanceKmByStationId /*nullable*/);  // bulk-builds summaries (points loaded in one query, free-now from one slots query)
    public StationSummaryDto summary(Station s, Double distanceKm);
    public static PointDto toPointDto(ChargingPoint p);
}

@Service public class ReferenceService {   // connectors, vehicle-models (+connectorCodes), amenities, zones, pricing-bands
    public ReferenceService(ConnectorTypeRepository c, VehicleModelRepository m, AmenityRepository a, StationRepository s, PricingBandRepository b);
    public List<ConnectorDto> connectors(); public List<VehicleModelDto> vehicleModels(); public List<AmenityDto> amenities();
    public List<ZoneDto> zones(); public List<PricingBandDto> pricingBands();
}

@Service public class RecommendationService {
    public RecommendationService(StationRepository stations, ChargingPointRepository points, VehicleRepository vehicles, EstimatorService estimator,
                                 AvailabilityService availability, ForecastService forecast, StationService stationService, AppClock clock);
    /** Constraints used by the fleet scheduler / trip planner. extraOccupied holds keys made with slotKey(); notAfter limits the latest slot START (null = 12 h look-ahead from arrival). */
    public record Constraints(LocalDateTime notAfter, Set<String> extraOccupied, Set<Long> excludedStationIds, Collection<Long> onlyStationIds) {
        public static final Constraints NONE = new Constraints(null, Set.of(), Set.of(), null);
    }
    public static String slotKey(Long pointId, LocalDateTime slotStart);       // pointId + "|" + slotStart
    public RecommendationResponse recommend(RecommendationRequest req, AuthUser actorOrNull);                          // = recommend(req, actor, Constraints.NONE)
    public RecommendationResponse recommend(RecommendationRequest req, AuthUser actorOrNull, Constraints c);
}
```
Controllers (A): `StationController` (`/api/stations`: search, detail, availability, forecast – NOT reviews), `RecommendationController` (`POST /api/recommendations`), `ReferenceController` (`/api/reference/*`), `ClockController` (`GET /api/clock` → `AdminDtos.ClockDto`).
A also writes `EstimatorServiceTest` and `RecommendationServiceTest` (Mockito, no Spring context).

## Group B – booking engine (owner: agent B)
```java
@Service public class WalletService {
    public WalletService(WalletRepository wallets, WalletTransactionRepository txns, UserRepository users, AppClock clock);
    public WalletDto get(Long userId);                                      // balance + last 5
    public PageResponse<WalletTxnDto> transactions(Long userId, int page, int size);
    public WalletDto topup(Long userId, BigDecimal amount, String method);  // TOPUP txn, reference "TOPUP-<method>"
    public Wallet ensureWallet(User user);                                  // create with balance 0 if missing
    public BigDecimal debit(Long userId, BigDecimal amount, String reference);   // row lock (WalletRepository.lockByUserId); InsufficientBalanceException (402) if short; txn DEBIT (stored amount positive)
    public BigDecimal credit(Long userId, BigDecimal amount, WalletTxnType type, String reference); // REFUND | TOPUP ; returns new balance
}

@Service public class NotificationService {
    public NotificationService(NotificationRepository repo, UserRepository users, AppClock clock);
    public Notification create(User user, NotificationType type, String title, String message, String payloadJsonOrNull); // status ACTIVE, read=false, createdAt=now
    public PageResponse<NotificationDto> list(Long userId, boolean unreadOnly, int page, int size);
    public long unreadCount(Long userId);
    public NotificationDto markRead(Long userId, Long notificationId);      // 404/403
    public int markAllRead(Long userId);
    public static NotificationDto toDto(Notification n);
}

@Service public class BookingService {
    public BookingService(BookingRepository bookings, BookingSlotRepository slots, ChargingPointRepository points, ChargingSessionRepository sessions,
                          PaymentRepository payments, VehicleRepository vehicles, UserRepository users, StationRepository stations,
                          EstimatorService estimator, AvailabilityService availability, RecommendationService recommendation,
                          WalletService wallets, NotificationService notifications, RechargePredictionService predictions,
                          ApplicationEventPublisher events, AppClock clock);
    public EstimateResponse estimate(AuthUser actor, EstimateRequest req);
    public BookingDto createHold(AuthUser actor, CreateBookingRequest req);                         // rules in 20_backend_spec.md; 409 SlotUnavailableException WITH Alternatives; source default WEB; hold = 5 min (10 min for WAITLIST source)
    public BookingDto createHold(User owner, Vehicle vehicle, ChargingPoint pointOrNull, Station station, LocalDateTime start,
                                 int socStart, int socTarget, BookingSource source, int holdMinutes);  // internal entry used by waitlist/reminder/fleet/trip (same validations, no AuthUser)
    public BookingDto confirm(AuthUser actor, Long bookingId, PaymentMethod method);
    public BookingDto cancel(AuthUser actor, Long bookingId, String reason);
    public BookingDto checkIn(AuthUser actor, Long bookingId);
    public BookingDto complete(AuthUser actor, Long bookingId, Integer socEndOrNull);
    public BookingDto get(AuthUser actor, Long bookingId);
    public PageResponse<BookingDto> list(AuthUser actor, String statusOrNull, Boolean upcomingOrNull, int page, int size);
    public InvoiceDto invoice(AuthUser actor, Long bookingId);
    public BookingDto toDto(Booking b);                                    // public: reused by reminders, fleet, operator
    public BigDecimal refundIfCancelled(Booking b, LocalDateTime now);     // 100 % if >=60 min before start else 50 %, of the PAID amount (est. cost for HOLD = 0)
    // ---- maintenance jobs (called by JobScheduler and by AdminService "run now") ----
    public int expireHolds(); public int markNoShows(); public int autoCompleteSessions(); public int notifyUpcoming();
}

@Service public class WaitlistService {
    public WaitlistService(WaitlistRepository repo, VehicleRepository vehicles, StationRepository stations, UserRepository users, ChargingPointRepository points,
                           AvailabilityService availability, EstimatorService estimator, @Lazy BookingService bookings, NotificationService notifications, AppClock clock);
    public WaitlistDto ...  // use record WaitlistDto declared INSIDE WaitlistService? NO – put it in dto/WaitlistDtos.java (agent B creates it): WaitlistRequest{vehicleId,stationId,desiredStart,slots}, WaitlistDto{id,station{id,name},vehicleLabel,desiredStart,slots,status,promotedBookingId,createdAt}
    public WaitlistDto join(AuthUser actor, WaitlistRequest req); public List<WaitlistDto> mine(AuthUser actor); public void cancel(AuthUser actor, Long id);
    @TransactionalEventListener(phase = AFTER_COMMIT) @Transactional(propagation = REQUIRES_NEW) public void onSlotsReleased(SlotsReleasedEvent e);
    public int expireOld();
}

@Component public class JobScheduler {      // package com.chargeiq.scheduler – @Scheduled(fixedDelayString = "${app.scheduler.bookings-ms:30000}") expireHolds / noShows / autoComplete / notifyUpcoming / waitlist.expireOld,
                                            // @Scheduled(fixedDelayString = "${app.scheduler.reminders-ms:300000}") reminderService.evaluate() + predictions.recomputeMissing(); public void runAllNow() used by admin; @EventListener(ApplicationReadyEvent) runs reminders once.
    public JobScheduler(BookingService b, WaitlistService w, ReminderService r, RechargePredictionService p, @Value("${app.scheduler.enabled:true}") boolean enabled);
}
```
Controllers (B): `BookingController` (`/api/bookings`), `WalletController` (`/api/wallet`), `NotificationController` (`/api/notifications`), `WaitlistController` (`/api/waitlist`).
B also writes `BookingServiceTest` (Mockito or in-memory fakes; must cover conflict→alternatives, 60-min refund rule, hold expiry).

## Group C – users, vehicles, reminders, reviews (owner: agent C)
```java
@Service public class VehicleService {
    public VehicleService(VehicleRepository vehicles, VehicleModelRepository models, UserRepository users, BookingRepository bookings, FleetRepository fleets);
    public List<VehicleDto> list(AuthUser actor);                          // FLEET_MANAGER -> all vehicles of actor.fleetId, others -> own
    public VehicleDto create(AuthUser actor, VehicleRequest r);            // fleet manager's vehicle gets fleet; 409 duplicate regNumber
    public VehicleDto update(AuthUser actor, Long id, VehicleRequest r);
    public void delete(AuthUser actor, Long id);                           // 409 ConflictException when future HOLD/CONFIRMED/CHECKED_IN bookings
    public Vehicle requireAccessible(Long vehicleId, AuthUser actorOrNull);// owner, or FLEET_MANAGER of same fleet, or ADMIN; actor null -> just load (404)
    public static VehicleDto toDto(Vehicle v);   // in mapper/VehicleMapper too: `VehicleMapper.toDto(Vehicle)` (static) – VehicleService.toDto delegates
    public static String label(Vehicle v);       // nickname or "Make Model"
}

@Service public class AuthService {
    public AuthService(UserRepository users, WalletRepository wallets, WalletService walletService, PasswordEncoder encoder, JwtService jwt, AuthenticationManager? NO – verify with encoder directly, AppClock clock);
    public UserDto register(RegisterRequest r);                            // 409 duplicate e-mail; role USER; wallet 0
    public AuthResponse login(LoginRequest r);                             // 401 bad credentials ("Invalid email or password"), 403 blocked; sets lastLoginAt
    public UserDto me(AuthUser actor); public UserDto updateProfile(AuthUser actor, UpdateProfileRequest r); public void changePassword(AuthUser actor, ChangePasswordRequest r);
    public UserDto toDto(User u);                                           // includes wallet balance
}

@Service public class SentimentService {  // lexicon + negation, label thresholds in 20_backend_spec.md; score in [-1,1]
    public record SentimentResult(double score, SentimentLabel label) {}
    public SentimentResult analyze(String text);                           // null/blank -> (0, NEUTRAL)
}
@Service public class ReviewService {
    public ReviewService(ReviewRepository reviews, StationRepository stations, UserRepository users, BookingRepository bookings, ChargingSessionRepository sessions, SentimentService sentiment, AppClock clock);
    public PageResponse<ReviewDto> list(Long stationId, int page, int size);
    public ReviewDto create(AuthUser actor, Long stationId, ReviewRequest r);   // must have a COMPLETED session at the station (ChargingSessionRepository.countByStationAndUser) else 403; one review per bookingId (409); recompute station aggregates incl. reliability formula
}

@Service public class RechargePredictionService {
    public RechargePredictionService(ChargingSessionRepository sessions, RechargePredictionRepository repo, VehicleRepository vehicles, StationRepository stations, AppClock clock);
    public Optional<RechargePrediction> recompute(Vehicle v);              // algorithm 00_overview.md; upsert; resets nothing else
    public int recomputeMissing();                                         // vehicles with >=3 sessions and no prediction row
    public static String state(RechargePrediction p, LocalDateTime now, int leadHours); // UPCOMING | DUE_SOON | OVERDUE | NO_DATA
    public List<PredictionDto> predictionsFor(AuthUser actor);             // user's vehicles (fleet manager: fleet vehicles); suggestion may be null here
}
@Service public class ReminderService {
    public ReminderService(NotificationRepository notifications, RechargePredictionRepository predictions, RechargePredictionService predictionService, BookingRepository bookings,
                           UserRepository users, VehicleRepository vehicles, StationRepository stations, RecommendationService recommendation, @Lazy BookingService bookingService,
                           NotificationService notificationService, ObjectMapper json, @Value("${app.demo-mode:true}") boolean demoMode, AppClock clock);
    public int evaluate();                                                 // creates RECHARGE_REMINDER notifications + re-activates expired snoozes (see spec); returns created count
    public List<ReminderDto> active(AuthUser actor);                       // ACTIVE reminders of actor (suggestion computed lazily & fresh)
    public void snooze(AuthUser actor, Long notificationId, int hours); public void dismiss(AuthUser actor, Long notificationId);
    public BookingDto book(AuthUser actor, Long notificationId);           // HOLD with source REMINDER at the suggestion, notification -> DONE
    public int refresh(AuthUser actor);                                    // runs evaluate() for the actor's vehicles only; returns active count
    public void demoTrigger(AuthUser actor, Long vehicleId);               // 404 unless app.demo-mode; sets next_due_at = now (+ makes reminder eligible), then evaluate
}
```
Controllers (C): `AuthController` (`/api/auth/register|login|me|change-password`, `PUT /api/users/me` – map `/api` at class level and full paths on methods), `VehicleController` (`/api/vehicles`), `ReviewController` (`/api/stations/{id}/reviews` GET + POST), `ReminderController` (`/api/reminders/*`).
C also writes `SentimentServiceTest`, `RechargePredictionServiceTest`, `JwtServiceTest`.

## Group D – admin, analytics, infrastructure (owner: agent D)
```java
@Service public class AdminService {
    public AdminService(UserRepository users, StationRepository stations, BookingRepository bookings, OperatorRepository operators, FleetRepository fleets, NamedParameterJdbcTemplate/JdbcTemplate jdbc,
                        AppClock clock, JobScheduler jobs);
    public PageResponse<AdminUserDto> users(String q, String role, String status, int page, int size);
    public AdminUserDto changeRole(AuthUser actor, Long id, RoleRequest r);   // OPERATOR needs operatorId, FLEET_MANAGER needs fleetId; cannot demote yourself
    public AdminUserDto changeStatus(AuthUser actor, Long id, StatusRequest r);
    public AdminStatsDto stats(); public WarehouseRefreshDto refreshWarehouse();          // CALL sp_refresh_warehouse(); H2 test profile -> skip gracefully (rows empty)
    public ClockDto clock(); public ClockDto advanceClock(AdvanceClockRequest r); public ClockDto resetClock();   // advance then jobs.runAllNow()
    public int runRemindersNow();
}
@Service public class AnalyticsService { ... see agent D brief; NamedParameterJdbcTemplate over dw_* tables ... }
```
Controllers (D): `AdminController` (`/api/admin/**`), `AnalyticsController` (`/api/analytics/**`, operator restriction applied in the service via `AuthUser`).
D also owns: `application.properties`, `application-test.properties`, `.gitignore`, `Dockerfile`, `mvnw`, `mvnw.cmd`, `.mvn/wrapper/maven-wrapper.properties`, `src/main/resources/static/index.html` placeholder, property names `app.jwt.secret` (env JWT_SECRET) and `app.jwt.expiry-hours` (env JWT_EXPIRY_HOURS) which `JwtService` reads, `app.cors.origins`, test base `TestData` fixture helper (`src/test/java/com/chargeiq/support/TestData.java`).

## Group E – fleet, trips, operator (owner: agent E)
```java
@Service public class FleetService {
    public FleetService(FleetRepository fleets, VehicleRepository vehicles, BookingRepository bookings, ChargingSessionRepository sessions, RechargePredictionRepository predictions,
                        RecommendationService recommendation, BookingService bookingService, UserRepository users, StationRepository stations, ChargingPointRepository points, AppClock clock);
    public FleetOverviewDto overview(AuthUser actor);
    public ScheduleResponse schedule(AuthUser actor, ScheduleRequest r);   // greedy algorithm in 20_backend_spec.md; does NOT write to DB
    public ApplyResponse apply(AuthUser actor, ApplyRequest r);            // per item: createHold(source FLEET, hold 5) then confirm(WALLET); partial success reported in failures
}
@Service public class TripPlannerService {
    public TripPlannerService(VehicleService vehicleService, RecommendationService recommendation, StationRepository stations, ChargingPointRepository points, EstimatorService estimator, ForecastService forecast, StationService stationService, AppClock clock);
    public TripResponse plan(TripRequest r, AuthUser actorOrNull);
}
@Service public class OperatorService {
    public OperatorService(StationRepository stations, ChargingPointRepository points, ConnectorTypeRepository connectors, AmenityRepository amenities, OperatorRepository operators, BookingRepository bookings,
                           BookingSlotRepository slots, ChargingSessionRepository sessions, UserRepository users, VehicleRepository vehicles, StationService stationService, BookingService bookingService, ForecastService forecast, AppClock clock);
    public OperatorDashboardDto dashboard(AuthUser actor);
    public List<StationSummaryDto> myStations(AuthUser actor);             // ADMIN sees all
    public StationDetailDto createStation(AuthUser actor, StationRequest r); public StationDetailDto updateStation(AuthUser actor, Long id, StationRequest r); public void deleteStation(AuthUser actor, Long id); // delete = 409 if future bookings, else set INACTIVE (soft)
    public PointDto addPoint(AuthUser actor, Long stationId, PointRequest r); public PointDto updatePoint(AuthUser actor, Long pointId, PointRequest r); public void deletePoint(AuthUser actor, Long pointId); public PointDto setPointStatus(AuthUser actor, Long pointId, PointStatusRequest r);
    public StationScheduleDto schedule(AuthUser actor, Long stationId, LocalDate date);
    public BookingDto logWalkIn(AuthUser actor, WalkInRequest r);          // source WALK_IN, status COMPLETED immediately with session+payment rows (UPI), vehicle looked up by regNumber (404 if unknown)
}
```
Controllers (E): `FleetController` (`/api/fleet`), `TripController` (`POST /api/trips/plan`), `OperatorController` (`/api/operator`).
E also writes `TripPlannerServiceTest` and `FleetServiceTest` (Mockito, pure logic).

## DB conventions worth re-reading
* `demand_forecast.day_of_week` / `weather`, enum string lengths etc. – read `db/01_schema.sql` and `docs/spec/10_data_spec.md` before touching them.
* `payments.invoice_no` format `INV-2526-000123` (use payment id padded to 6 digits after insert + flush; or a counter from `payments` max id).
* `notifications.payload` JSON for reminders: `{"vehicleId":1,"stationId":2,"pointId":3,"slotStart":"2026-10-03T19:30:00","slotEnd":"2026-10-03T20:30:00","dueAt":"2026-10-03T09:30:00"}`.
* `qrPayload` of a booking: `"VSL|" + bookingCode + "|" + id`.
