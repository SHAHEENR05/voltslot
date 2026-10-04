package com.chargeiq.support;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

import com.chargeiq.entity.ChargingPoint;
import com.chargeiq.entity.ConnectorType;
import com.chargeiq.entity.Operator;
import com.chargeiq.entity.Station;
import com.chargeiq.entity.User;
import com.chargeiq.entity.Vehicle;
import com.chargeiq.entity.VehicleModel;
import com.chargeiq.entity.Wallet;
import com.chargeiq.entity.enums.CurrentType;
import com.chargeiq.entity.enums.PointStatus;
import com.chargeiq.entity.enums.Role;
import com.chargeiq.entity.enums.StationStatus;
import com.chargeiq.entity.enums.StationTier;
import com.chargeiq.entity.enums.UserStatus;
import com.chargeiq.entity.enums.VehicleCategory;
import com.chargeiq.repository.ChargingPointRepository;
import com.chargeiq.repository.ConnectorTypeRepository;
import com.chargeiq.repository.OperatorRepository;
import com.chargeiq.repository.StationRepository;
import com.chargeiq.repository.UserRepository;
import com.chargeiq.repository.VehicleModelRepository;
import com.chargeiq.repository.VehicleRepository;
import com.chargeiq.repository.WalletRepository;

/**
 * Fixture builder for integration tests (plain static helpers, deliberately NOT a Spring bean).
 *
 * <p>Each method receives the repository it needs, builds an entity with sensible defaults, saves it and returns
 * the persisted instance. Typical use inside a {@code @SpringBootTest} (profile "test", H2):
 * <pre>
 *   Operator op   = TestData.operator(operators, "VoltGrid");
 *   Station st    = TestData.station(stations, op, "Powai", 19.1176, 72.9060);
 *   ConnectorType ccs = TestData.connector(connectors, "CCS2", CurrentType.DC, 60);
 *   ChargingPoint cp  = TestData.point(points, st, "P1", ccs, 60, "18.00");
 *   VehicleModel nexon = TestData.vehicleModel(models, "Tata", "Nexon EV", 40.5, 7.2, 50, Set.of(ccs));
 *   User u        = TestData.user(users, wallets, passwordHash, "aarav@test.in", Role.USER, "100.00");
 *   Vehicle v     = TestData.vehicle(vehicles, u, nexon, "MH01AB1234");
 * </pre>
 * Timestamps default to the demo anchor (2026-10-03 09:30) so fixtures look "recent" for the FIXED test clock.
 * Unique columns (emails, registration numbers, operator names) are the caller's responsibility.
 */
public final class TestData {

    /** Same value as {@code app.clock.anchor} in application-test.properties. */
    public static final LocalDateTime ANCHOR = LocalDateTime.of(2026, 10, 3, 9, 30);

    private TestData() { }

    public static Operator operator(OperatorRepository repo, String name) {
        Operator o = new Operator();
        o.setName(name);
        o.setBrandColor("#22d3ee");
        o.setContactEmail(name.toLowerCase().replace(' ', '.') + "@example.com");
        o.setCreatedAt(ANCHOR);
        return repo.save(o);
    }

    /** ACTIVE STANDARD station open 24 hours, 97 % uptime, no reviews yet. */
    public static Station station(StationRepository repo, Operator operator, String zone, double lat, double lon) {
        Station s = new Station();
        s.setOperator(operator);
        s.setName(operator.getName() + " " + zone + " Station");
        s.setAddress("1 Test Road, " + zone);
        s.setZone(zone);
        s.setCity("Mumbai");
        s.setLatitude(lat);
        s.setLongitude(lon);
        s.setTier(StationTier.STANDARD);
        s.setOpenHour(0);
        s.setCloseHour(24);
        s.setStatus(StationStatus.ACTIVE);
        s.setUptimePct(97.0);
        s.setAvgRating(0.0);
        s.setReviewCount(0);
        s.setSentimentScore(0.0);
        s.setReliabilityScore(0.0);
        s.setCreatedAt(ANCHOR);
        s.setAmenities(new HashSet<>());
        return repo.save(s);
    }

    /** Returns the existing connector type with this code or creates it. */
    public static ConnectorType connector(ConnectorTypeRepository repo, String code, CurrentType current, double typicalKw) {
        return repo.findByCode(code).orElseGet(() -> {
            ConnectorType c = new ConnectorType();
            c.setCode(code);
            c.setDisplayName(code);
            c.setCurrentType(current);
            c.setTypicalKw(typicalKw);
            return repo.save(c);
        });
    }

    /** ACTIVE charging point; tariff is a decimal string such as "18.00". */
    public static ChargingPoint point(ChargingPointRepository repo, Station station, String label,
                                      ConnectorType connector, double powerKw, String tariffPerKwh) {
        ChargingPoint p = new ChargingPoint();
        p.setStation(station);
        p.setLabel(label);
        p.setConnectorType(connector);
        p.setPowerKw(powerKw);
        p.setTariffPerKwh(new BigDecimal(tariffPerKwh));
        p.setStatus(PointStatus.ACTIVE);
        p.setCreatedAt(ANCHOR);
        return repo.save(p);
    }

    /** CAR model with the given connectors (set dcMaxKw = 0 for AC-only cars, acMaxKw = 0 for 2-wheelers). */
    public static VehicleModel vehicleModel(VehicleModelRepository repo, String make, String model, double batteryKwh,
                                            double acMaxKw, double dcMaxKw, Set<ConnectorType> connectors) {
        VehicleModel m = new VehicleModel();
        m.setMake(make);
        m.setModel(model);
        m.setVariant(null);
        m.setCategory(VehicleCategory.CAR);
        m.setBatteryKwh(batteryKwh);
        m.setAcMaxKw(acMaxKw);
        m.setDcMaxKw(dcMaxKw);
        m.setRangeKm(300);
        m.setKmPerKwh(7.0);
        m.setConnectors(new HashSet<>(connectors));
        return repo.save(m);
    }

    /** ACTIVE user plus its wallet with the given opening balance (string such as "500.00"). */
    public static User user(UserRepository users, WalletRepository wallets, String passwordHash, String email,
                            Role role, String walletBalance) {
        User u = new User();
        u.setFullName("Test " + email.substring(0, email.indexOf('@')));
        u.setEmail(email);
        u.setPasswordHash(passwordHash);
        u.setRole(role);
        u.setStatus(UserStatus.ACTIVE);
        u.setCity("Mumbai");
        u.setReminderEnabled(true);
        u.setReminderLeadHours(24);
        u.setNoShowCount(0);
        u.setCreatedAt(ANCHOR.minusDays(30));
        User saved = users.save(u);
        Wallet w = new Wallet();
        w.setUser(saved);
        w.setBalance(new BigDecimal(walletBalance));
        w.setUpdatedAt(ANCHOR);
        wallets.save(w);
        return saved;
    }

    /** Same as {@link #user} but bound to an operator (role should be OPERATOR). */
    public static User operatorUser(UserRepository users, WalletRepository wallets, String passwordHash, String email,
                                    Operator operator) {
        User u = user(users, wallets, passwordHash, email, Role.OPERATOR, "0.00");
        u.setOperator(operator);
        return users.save(u);
    }

    public static Vehicle vehicle(VehicleRepository repo, User owner, VehicleModel model, String regNumber) {
        Vehicle v = new Vehicle();
        v.setUser(owner);
        v.setModel(model);
        v.setRegNumber(regNumber);
        v.setNickname("Test EV");
        v.setAvgDailyKm(40);
        v.setCreatedAt(ANCHOR);
        return repo.save(v);
    }
}
