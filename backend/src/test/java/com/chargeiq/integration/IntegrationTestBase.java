package com.voltslot.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import com.chargeiq.clock.AppClock;
import com.chargeiq.entity.Booking;
import com.chargeiq.entity.BookingSlot;
import com.chargeiq.entity.ChargingPoint;
import com.chargeiq.entity.ChargingSession;
import com.chargeiq.entity.ConnectorType;
import com.chargeiq.entity.Operator;
import com.chargeiq.entity.Station;
import com.chargeiq.entity.User;
import com.chargeiq.entity.Vehicle;
import com.chargeiq.entity.VehicleModel;
import com.chargeiq.entity.enums.BookingSource;
import com.chargeiq.entity.enums.BookingStatus;
import com.chargeiq.entity.enums.CurrentType;
import com.chargeiq.entity.enums.Role;
import com.chargeiq.repository.BookingRepository;
import com.chargeiq.repository.BookingSlotRepository;
import com.chargeiq.repository.ChargingPointRepository;
import com.chargeiq.repository.ChargingSessionRepository;
import com.chargeiq.repository.ConnectorTypeRepository;
import com.chargeiq.repository.OperatorRepository;
import com.chargeiq.repository.StationRepository;
import com.chargeiq.repository.UserRepository;
import com.chargeiq.repository.VehicleModelRepository;
import com.chargeiq.repository.VehicleRepository;
import com.chargeiq.repository.WalletRepository;
import com.chargeiq.service.RechargePredictionService;
import com.chargeiq.support.TestData;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Shared base class of all integration tests (docs: "Tests" section of 20_backend_spec.md).
 *
 * <p><b>What it gives you</b>
 * <ul>
 *   <li>one Spring Boot context (profile {@code test}: H2 in MySQL mode, FIXED clock at 2026-10-03T09:30, schedulers off)
 *       that is shared by every IT class, plus a {@link MockMvc} wired through the real security filter chain;</li>
 *   <li>fixture helpers built on {@link TestData}: {@link #newWorld}, {@link #createUser}, {@link #createVehicle},
 *       {@link #insertBooking}, {@link #insertCompletedSession};</li>
 *   <li>HTTP helpers: {@link #login}, {@link #bearer}, {@link #get}, {@link #post}, {@link #put}, {@link #expect}.</li>
 * </ul>
 *
 * <p><b>Isolation rule</b>: tests are NOT {@code @Transactional} (the concurrency test needs real commits and MockMvc
 * runs the controller in the same thread but services commit on their own anyway). Instead every fixture uses a unique
 * e-mail / registration number / operator name, and every "world" (station + point) is created in its own geographic
 * region so that distance based features (station search, recommendations, reminders) never see the stations of other
 * tests. The only shared global state is the application clock, which is reset before and after every test.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public abstract class IntegrationTestBase {

    /** Plain-text password of every fixture user (letter + digit, 8+ chars, so it also satisfies the register rules). */
    protected static final String PASSWORD = "Passw0rd1";

    private static final AtomicInteger REGION_SEQ = new AtomicInteger();
    private static volatile String passwordHash;

    @Autowired protected MockMvc mvc;
    @Autowired protected ObjectMapper json;
    @Autowired protected PasswordEncoder encoder;
    @Autowired protected AppClock clock;
    @Autowired protected JdbcTemplate jdbc;

    @Autowired protected UserRepository users;
    @Autowired protected WalletRepository wallets;
    @Autowired protected OperatorRepository operators;
    @Autowired protected StationRepository stations;
    @Autowired protected ChargingPointRepository points;
    @Autowired protected ConnectorTypeRepository connectors;
    @Autowired protected VehicleModelRepository vehicleModels;
    @Autowired protected VehicleRepository vehicles;
    @Autowired protected BookingRepository bookings;
    @Autowired protected BookingSlotRepository bookingSlots;
    @Autowired protected ChargingSessionRepository sessions;
    @Autowired protected RechargePredictionService predictionService;

    // ------------------------------------------------------------------ clock hygiene

    @BeforeEach
    void resetClockBeforeTest() {
        clock.reset();
    }

    @AfterEach
    void resetClockAfterTest() {
        clock.reset();
    }

    // ------------------------------------------------------------------ fixtures

    /** Everything needed to book: one operator, one station, one 60 kW CCS2 point and a car that can use it. */
    protected record World(Operator operator, Station station, ChargingPoint point, ConnectorType ccs2,
                           VehicleModel model, double lat, double lon) { }

    /** Short unique token for e-mails, registration numbers and names. */
    protected static String uniq() {
        return UUID.randomUUID().toString().replace("-", "").substring(0, 10);
    }

    /** A fresh, isolated spot on the map (0.6 degrees = about 65 km between two regions). Returns {lat, lon}. */
    protected static double[] nextRegion() {
        int k = REGION_SEQ.getAndIncrement();
        return new double[] {8.0 + 0.6 * k, 70.0 + 0.6 * k};
    }

    /** Hash of {@link #PASSWORD}, computed once (BCrypt is deliberately slow). */
    protected String hash() {
        String h = passwordHash;
        if (h == null) {
            h = encoder.encode(PASSWORD);
            passwordHash = h;
        }
        return h;
    }

    /** Station (open 24 h, ACTIVE) with one CCS2 point of 60 kW at the given tariff, in a fresh region. */
    protected World newWorld(String tariff) {
        double[] r = nextRegion();
        return newWorld(r[0], r[1], tariff);
    }

    protected World newWorld(double lat, double lon, String tariff) {
        Operator op = TestData.operator(operators, "Op" + uniq());
        Station st = TestData.station(stations, op, "Zone" + uniq().substring(0, 4), lat, lon);
        ConnectorType ccs2 = TestData.connector(connectors, "CCS2", CurrentType.DC, 60);
        ChargingPoint p = TestData.point(points, st, "P1", ccs2, 60, tariff);
        // 40 kWh battery, 7.2 kW AC, 50 kW DC: on the 60 kW point it is limited to 50 kW (20 -> 80 % = 35 min = 2 slots)
        VehicleModel m = TestData.vehicleModel(vehicleModels, "ITMake", "ITCar" + uniq().substring(0, 4), 40.0, 7.2, 50.0,
                Set.of(ccs2));
        return new World(op, st, p, ccs2, m, lat, lon);
    }

    /** ACTIVE user (unique e-mail, password {@link #PASSWORD}) with a wallet holding {@code walletBalance}. */
    protected User createUser(Role role, String walletBalance) {
        return TestData.user(users, wallets, hash(), "it-" + uniq() + "@test.in", role, walletBalance);
    }

    protected Vehicle createVehicle(User owner, VehicleModel model) {
        return TestData.vehicle(vehicles, owner, model, "IT" + uniq());
    }

    /**
     * Inserts a booking row directly (bypassing the booking engine). With {@code withSlots} it also occupies the
     * 30-minute slots in {@code booking_slots}, exactly like a real booking would.
     */
    protected Booking insertBooking(User user, Vehicle vehicle, ChargingPoint point, LocalDateTime start, int slots,
                                    BookingStatus status, boolean withSlots) {
        Booking b = new Booking();
        b.setBookingCode("T" + uniq());
        b.setUser(user);
        b.setVehicle(vehicle);
        b.setChargingPoint(point);
        b.setStation(point.getStation());
        b.setStartTime(start);
        b.setEndTime(start.plusMinutes(30L * slots));
        b.setSlots(slots);
        b.setStatus(status);
        b.setSource(BookingSource.WEB);
        b.setSocStart(20);
        b.setSocTarget(80);
        b.setEstEnergyKwh(26.09);
        b.setEstCost(new BigDecimal("469.57"));
        b.setCreatedAt(TestData.ANCHOR.minusDays(1));
        Booking saved = bookings.save(b);
        if (withSlots) {
            for (int i = 0; i < slots; i++) {
                BookingSlot s = new BookingSlot();
                s.setChargingPoint(point);
                s.setSlotStart(start.plusMinutes(30L * i));
                s.setBooking(saved);
                bookingSlots.save(s);
            }
        }
        return saved;
    }

    /** A finished charge in the past: COMPLETED booking (2 slots) plus its 35-minute 20 -> 80 % charging session. */
    protected ChargingSession insertCompletedSession(User user, Vehicle vehicle, ChargingPoint point, LocalDateTime start) {
        Booking b = insertBooking(user, vehicle, point, start, 2, BookingStatus.COMPLETED, false);
        ChargingSession cs = new ChargingSession();
        cs.setBooking(b);
        cs.setStartedAt(start);
        cs.setEndedAt(start.plusMinutes(35));
        cs.setEnergyKwh(26.09);
        cs.setSocStart(20);
        cs.setSocEnd(80);
        cs.setAvgKw(44.7);
        cs.setTariff(new BigDecimal("18.00"));
        cs.setAmount(new BigDecimal("469.57"));
        cs.setCo2AvoidedKg(20.16);
        return sessions.save(cs);
    }

    // ------------------------------------------------------------------ time helpers

    /** The day after the anchor (2026-10-04): far enough ahead for a full refund, inside the 14 day horizon. */
    protected static LocalDate tomorrow() {
        return TestData.ANCHOR.toLocalDate().plusDays(1);
    }

    /** Admin moves the application clock forward through the real endpoint (this also runs the background jobs once). */
    protected void advanceClock(String adminToken, long minutes) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("minutes", (int) minutes);
        expect(post("/api/admin/clock/advance", adminToken, body), 200);
    }

    /** Advances the clock (admin endpoint) so that {@code clock.now()} is {@code minutesBefore} minutes before {@code target}. */
    protected void advanceClockTo(String adminToken, LocalDateTime target, long minutesBefore) throws Exception {
        long minutes = Duration.between(clock.now(), target.minusMinutes(minutesBefore)).toMinutes();
        if (minutes >= 1) {
            advanceClock(adminToken, minutes);
        }
    }

    // ------------------------------------------------------------------ HTTP helpers

    protected static String bearer(String token) {
        return "Bearer " + token;
    }

    /** POST /api/auth/login and return the JWT. */
    protected String login(String email, String password) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("email", email);
        body.put("password", password);
        JsonNode res = expect(post("/api/auth/login", null, body), 200);
        String token = res.get("token").asText();
        assertTrue(token != null && !token.isBlank(), "login must return a token");
        return token;
    }

    protected String login(User user) throws Exception {
        return login(user.getEmail(), PASSWORD);
    }

    protected ResultActions get(String url, String token) throws Exception {
        MockHttpServletRequestBuilder rb = MockMvcRequestBuilders.get(url);
        return mvc.perform(withToken(rb, token));
    }

    protected ResultActions get(String url) throws Exception {
        return get(url, null);
    }

    /** POST with an optional JSON body (a Map / record / String); {@code token} may be null for anonymous calls. */
    protected ResultActions post(String url, String token, Object body) throws Exception {
        MockHttpServletRequestBuilder rb = MockMvcRequestBuilders.post(url);
        rb = withToken(rb, token);
        if (body != null) {
            String content = body instanceof String ? (String) body : json.writeValueAsString(body);
            rb = rb.contentType(MediaType.APPLICATION_JSON).content(content);
        }
        return mvc.perform(rb);
    }

    protected ResultActions put(String url, String token, Object body) throws Exception {
        MockHttpServletRequestBuilder rb = MockMvcRequestBuilders.put(url);
        rb = withToken(rb, token);
        if (body != null) {
            String content = body instanceof String ? (String) body : json.writeValueAsString(body);
            rb = rb.contentType(MediaType.APPLICATION_JSON).content(content);
        }
        return mvc.perform(rb);
    }

    private static MockHttpServletRequestBuilder withToken(MockHttpServletRequestBuilder rb, String token) {
        return token == null ? rb : rb.header("Authorization", bearer(token));
    }

    /**
     * Asserts the HTTP status (the response body is part of the failure message, which makes a red test much easier to
     * read) and returns the parsed JSON body ({@code {}} for an empty body).
     */
    protected JsonNode expect(ResultActions actions, int expectedStatus) throws Exception {
        MvcResult res = actions.andReturn();
        String content = res.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertEquals(expectedStatus, res.getResponse().getStatus(), "unexpected HTTP status, body: " + content);
        return content == null || content.isBlank() ? json.readTree("{}") : json.readTree(content);
    }

    /** Body of a response whatever the status (used by the concurrency test). */
    protected static String bodyOf(MvcResult res) throws Exception {
        return res.getResponse().getContentAsString(StandardCharsets.UTF_8);
    }

    /** JSON number -> BigDecimal (money). Compare with {@link #assertMoney}, never with equals (scale differs). */
    protected static BigDecimal money(JsonNode n) {
        return new BigDecimal(n.asText());
    }

    protected static void assertMoney(String expected, BigDecimal actual, String what) {
        assertTrue(actual != null && new BigDecimal(expected).compareTo(actual) == 0,
                what + ": expected " + expected + " but was " + actual);
    }

    protected static void assertMoney(BigDecimal expected, BigDecimal actual, String what) {
        assertTrue(actual != null && expected.compareTo(actual) == 0,
                what + ": expected " + expected + " but was " + actual);
    }

    /** Balance of the logged-in user from GET /api/wallet. */
    protected BigDecimal walletBalance(String token) throws Exception {
        return money(expect(get("/api/wallet", token), 200).get("balance"));
    }

    /** Does the array of notifications (page content) contain a notification of this type? */
    protected boolean hasNotification(String token, String type) throws Exception {
        JsonNode page = expect(get("/api/notifications?size=50", token), 200);
        for (JsonNode n : page.get("content")) {
            if (type.equals(n.get("type").asText())) {
                return true;
            }
        }
        return false;
    }

    /** Small JSON object builder: {@code map("email", e, "password", p)} keeps the insertion order. */
    protected static Map<String, Object> map(Object... keyValues) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < keyValues.length; i += 2) {
            m.put((String) keyValues[i], keyValues[i + 1]);
        }
        return m;
    }

    /** ISO local date-time WITH seconds ("2026-10-04T10:00:00"), the format the API documents. */
    protected static String iso(LocalDateTime t) {
        return DateTimeFormatter.ISO_LOCAL_DATE_TIME.format(t.withNano(0));
    }

    /** Request body of POST /api/bookings. */
    protected static Map<String, Object> bookingBody(Vehicle v, ChargingPoint p, LocalDateTime start, int socStart,
                                                     int socTarget) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("vehicleId", v.getId());
        body.put("chargingPointId", p.getId());
        body.put("startTime", iso(start));
        body.put("socStart", socStart);
        body.put("socTarget", socTarget);
        return body;
    }
}
