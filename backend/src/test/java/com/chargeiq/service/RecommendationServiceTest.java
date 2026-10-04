package com.chargeiq.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.chargeiq.clock.AppClock;
import com.chargeiq.dto.RecommendationDtos.ComponentScore;
import com.chargeiq.dto.RecommendationDtos.RecommendationRequest;
import com.chargeiq.dto.RecommendationDtos.RecommendationResponse;
import com.chargeiq.dto.RecommendationDtos.RecommendedItem;
import com.chargeiq.dto.RecommendationDtos.WeightsDto;
import com.chargeiq.entity.ChargingPoint;
import com.chargeiq.entity.ConnectorType;
import com.chargeiq.entity.Operator;
import com.chargeiq.entity.Station;
import com.chargeiq.entity.Vehicle;
import com.chargeiq.entity.VehicleModel;
import com.chargeiq.entity.enums.CurrentType;
import com.chargeiq.entity.enums.Preset;
import com.chargeiq.entity.enums.StationStatus;
import com.chargeiq.entity.enums.VehicleCategory;
import com.chargeiq.exception.BadRequestException;
import com.chargeiq.repository.BookingSlotRepository;
import com.chargeiq.repository.ChargingPointRepository;
import com.chargeiq.repository.PricingBandRepository;
import com.chargeiq.repository.ReviewRepository;
import com.chargeiq.repository.StationRepository;
import com.chargeiq.repository.VehicleRepository;

/**
 * Unit tests of the recommendation engine with Mockito (no Spring, no database).
 * <p>
 * Fixture (NOW = Sat 2026-10-03 09:30, user at 19.0760 N, 72.8777 E, 100 kW-capable CCS2 car, 20% -> 80%):
 * <pre>
 *   id  km   charger        Rs/kWh crowd reliab  special
 *   1   1.0  CCS2  25 kW    20     50    70     nearest compatible; its point is booked 10:00-11:00 (wait 86 min)
 *   2   6.0  CCS2 120 kW    26     60    80     fastest
 *   3   5.0  CCS2  30 kW    12     70    75     cheapest
 *   4   8.0  CCS2  30 kW    22     10    85     quietest
 *   5   0.5  CHADEMO        -      -     -      incompatible with the car -> must be skipped
 *   6   2.0  CCS2  50 kW    -      -     -      no free slot for the next 27 h -> must be skipped
 * </pre>
 * The expected winners were pre-computed by hand (see the comments in each test).
 */
class RecommendationServiceTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 10, 3, 9, 30);
    private static final double LAT = 19.0760;
    private static final double LON = 72.8777;
    private static final double KM_PER_DEG_LAT = 111.195;

    private AppClock clock;
    private StationRepository stationRepo;
    private ChargingPointRepository pointRepo;
    private BookingSlotRepository slotRepo;
    private VehicleRepository vehicleRepo;
    private ForecastService forecast;
    private RecommendationService service;

    private final List<Station> allStations = new ArrayList<>();
    private final List<ChargingPoint> allPoints = new ArrayList<>();
    private final List<Object[]> occupiedRows = new ArrayList<>();
    private final Map<Long, Double> crowding = new HashMap<>();

    @BeforeEach
    void setUp() {
        clock = mock(AppClock.class);
        when(clock.now()).thenReturn(NOW);
        when(clock.today()).thenReturn(NOW.toLocalDate());

        stationRepo = mock(StationRepository.class);
        pointRepo = mock(ChargingPointRepository.class);
        slotRepo = mock(BookingSlotRepository.class);
        vehicleRepo = mock(VehicleRepository.class);
        forecast = mock(ForecastService.class);
        ReviewRepository reviewRepo = mock(ReviewRepository.class);
        PricingBandRepository bandRepo = mock(PricingBandRepository.class);   // empty -> default bands

        buildFixture();

        when(stationRepo.findInBox(eq(StationStatus.ACTIVE), anyDouble(), anyDouble(), anyDouble(), anyDouble()))
                .thenReturn(allStations);
        when(pointRepo.findByStationIdInOrderByIdAsc(anyCollection())).thenAnswer(inv -> {
            Collection<Long> ids = inv.getArgument(0);
            return allPoints.stream().filter(p -> ids.contains(p.getStation().getId())).collect(Collectors.toList());
        });
        when(slotRepo.findOccupied(anyCollection(), any(LocalDateTime.class), any(LocalDateTime.class)))
                .thenAnswer(inv -> occupiedRows);
        when(forecast.crowdingIndex(anyLong(), any(LocalDateTime.class))).thenAnswer(inv -> {
            Long id = inv.getArgument(0);
            return crowding.getOrDefault(id, 0.0);
        });

        EstimatorService estimator = new EstimatorService(bandRepo);
        AvailabilityService availability = new AvailabilityService(stationRepo, pointRepo, slotRepo, vehicleRepo, estimator, forecast, clock);
        StationService stationService = new StationService(stationRepo, pointRepo, slotRepo, reviewRepo, forecast, clock);
        service = new RecommendationService(stationRepo, pointRepo, vehicleRepo, estimator, availability, forecast, stationService, clock);
    }

    // ------------------------------------------------------------------ fixture

    private void buildFixture() {
        Operator op = new Operator();
        op.setId(1L);
        op.setName("VoltGrid");

        ConnectorType ccs = connector(1L, "CCS2", CurrentType.DC);
        ConnectorType type2 = connector(2L, "TYPE2", CurrentType.AC);
        ConnectorType chademo = connector(3L, "CHADEMO", CurrentType.DC);

        VehicleModel model = new VehicleModel();
        model.setId(1L);
        model.setMake("Test");
        model.setModel("Car");
        model.setCategory(VehicleCategory.CAR);
        model.setBatteryKwh(40.0);
        model.setAcMaxKw(7.4);
        model.setDcMaxKw(100.0);
        model.setRangeKm(300);
        model.setKmPerKwh(6.0);
        model.setConnectors(Set.of(ccs, type2));
        Vehicle vehicle = new Vehicle();
        vehicle.setId(7L);
        vehicle.setModel(model);
        when(vehicleRepo.findById(7L)).thenReturn(Optional.of(vehicle));

        addStation(op, 1L, "Near Slow", 1.0, 70, 50, ccs, 25, "20.00");
        addStation(op, 2L, "Fast Hub", 6.0, 80, 60, ccs, 120, "26.00");
        addStation(op, 3L, "Budget Bay", 5.0, 75, 70, ccs, 30, "12.00");
        addStation(op, 4L, "Quiet Corner", 8.0, 85, 10, ccs, 30, "22.00");
        addStation(op, 5L, "CHAdeMO Only", 0.5, 90, 10, chademo, 50, "10.00");
        addStation(op, 6L, "Always Full", 2.0, 90, 10, ccs, 50, "10.00");

        // station 1's only point is booked 10:00 and 10:30 -> a 3-slot session can only start at 11:00
        occupiedRows.add(new Object[]{11L, LocalDateTime.of(2026, 10, 3, 10, 0)});
        occupiedRows.add(new Object[]{11L, LocalDateTime.of(2026, 10, 3, 10, 30)});
        // station 6's point is booked for every half hour until tomorrow noon
        for (LocalDateTime t = NOW; t.isBefore(LocalDateTime.of(2026, 10, 4, 12, 0)); t = t.plusMinutes(30)) {
            occupiedRows.add(new Object[]{61L, t});
        }
    }

    private static ConnectorType connector(Long id, String code, CurrentType type) {
        ConnectorType c = new ConnectorType();
        c.setId(id);
        c.setCode(code);
        c.setDisplayName(code);
        c.setCurrentType(type);
        c.setTypicalKw(50.0);
        return c;
    }

    private void addStation(Operator op, long id, String name, double km, double reliability, double crowd,
                            ConnectorType connector, double kw, String tariff) {
        Station s = new Station();
        s.setId(id);
        s.setOperator(op);
        s.setName(name);
        s.setAddress(name + " Road");
        s.setZone("Test Zone");
        s.setCity("Mumbai");
        s.setLatitude(LAT + km / KM_PER_DEG_LAT);   // due north of the user
        s.setLongitude(LON);
        s.setReliabilityScore(reliability);
        s.setAvgRating(4.0);
        s.setReviewCount(10);
        allStations.add(s);

        ChargingPoint p = new ChargingPoint();
        p.setId(id * 10 + 1);
        p.setStation(s);
        p.setLabel("P" + id);
        p.setConnectorType(connector);
        p.setPowerKw(kw);
        p.setTariffPerKwh(new BigDecimal(tariff));
        allPoints.add(p);

        crowding.put(id, crowd);
    }

    private RecommendationRequest request(Preset preset, WeightsDto weights) {
        return new RecommendationRequest(LAT, LON, 7L, null, null, 20, 80, preset, weights, 25.0, 8);
    }

    private static List<Long> ids(RecommendationResponse r) {
        return r.items().stream().map(i -> i.station().id()).collect(Collectors.toList());
    }

    private static RecommendedItem item(RecommendationResponse r, long stationId) {
        return r.items().stream().filter(i -> i.station().id() == stationId).findFirst().orElseThrow();
    }

    // ------------------------------------------------------------------ tests

    @Test
    void balancedPresetRanksByWeightedScore() {
        RecommendationResponse r = service.recommend(request(Preset.BALANCED, null), null);
        // hand calculation: Quiet Corner 71.2 > Budget Bay 67.9 > Fast Hub 62.5 > Near Slow 48.6
        assertEquals(List.of(4L, 3L, 2L, 1L), ids(r));
        assertEquals(Preset.BALANCED, r.preset());
        for (int i = 0; i < r.items().size(); i++) {
            assertEquals(i + 1, r.items().get(i).rank());
            if (i > 0) {
                assertTrue(r.items().get(i - 1).score() >= r.items().get(i).score());
            }
        }
        assertEquals(71.17, r.items().get(0).score(), 0.1);
    }

    @Test
    void eachPresetChangesTheWinnerSensibly() {
        // FASTEST: speed (40 %) + short wait -> the 120 kW hub
        RecommendationResponse fastest = service.recommend(request(Preset.FASTEST, null), null);
        assertEquals(2L, fastest.items().get(0).station().id());
        // CHEAPEST: price (50 %) -> Rs 12/kWh station
        RecommendationResponse cheapest = service.recommend(request(Preset.CHEAPEST, null), null);
        assertEquals(3L, cheapest.items().get(0).station().id());
        // LEAST_CROWDED: crowding (45 %) -> crowding index 10
        RecommendationResponse quiet = service.recommend(request(Preset.LEAST_CROWDED, null), null);
        assertEquals(4L, quiet.items().get(0).station().id());
        // the engine reacts to the preset: three different presets -> three different winners
        assertEquals(3, Set.of(fastest.items().get(0).station().id(), cheapest.items().get(0).station().id(),
                quiet.items().get(0).station().id()).size());
        // and the weights reported back are the preset's
        assertEquals(0.40, fastest.weights().speed(), 1e-9);
        assertEquals(0.50, cheapest.weights().price(), 1e-9);
        assertEquals(0.45, quiet.weights().crowding(), 1e-9);
        // sanity: the nearest station is never the winner of these three, although it is 1 km away
        assertNotNull(fastest.nearestBaseline());
        assertEquals(1L, fastest.nearestBaseline().stationId());
    }

    @Test
    void customWeightsAreRenormalisedToOne() {
        RecommendationResponse r = service.recommend(request(null, new WeightsDto(2.0, 1.0, 1.0, 3.0, 2.0, 1.0)), null);
        WeightsDto w = r.weights();
        assertEquals(1.0, w.distance() + w.waiting() + w.crowding() + w.price() + w.reliability() + w.speed(), 1e-3);
        assertEquals(0.2, w.distance(), 1e-9);
        assertEquals(0.3, w.price(), 1e-9);
        assertNull(r.preset());   // custom weights -> no preset label
        double[] n = RecommendationService.resolveWeights(Preset.BALANCED, new WeightsDto(5.0, 5.0, 0.0, 0.0, 0.0, 0.0));
        assertEquals(0.5, n[0], 1e-9);
        assertEquals(0.5, n[1], 1e-9);
        assertEquals(0.0, n[2], 1e-9);
    }

    @Test
    void distanceOnlyWeightsPickTheNearestStation() {
        RecommendationResponse r = service.recommend(request(null, new WeightsDto(1.0, 0.0, 0.0, 0.0, 0.0, 0.0)), null);
        assertEquals(1L, r.items().get(0).station().id());
        // the nearest station is the winner -> nothing saved, and the summary says so
        assertEquals(0, r.savings().minutesSaved());
        assertEquals(0, r.savings().rupeesSaved().signum());
        assertTrue(r.savings().summary().toLowerCase().contains("nearest"));
    }

    @Test
    void savingsAreMeasuredAgainstTheNearestCompatibleStation() {
        RecommendationResponse balanced = service.recommend(request(Preset.BALANCED, null), null);
        // nearest compatible = station 1 (station 5 is closer but incompatible, station 6 is closer but fully booked)
        assertEquals(1L, balanced.nearestBaseline().stationId());
        assertEquals(1.0, balanced.nearestBaseline().distanceKm(), 0.05);
        assertEquals(4, balanced.nearestBaseline().etaMinutes());
        assertEquals(86, balanced.nearestBaseline().waitMinutes());
        // baseline starts charging at 11:00 (90 min after 09:30); the winner (station 4) at 10:00 (30 min) -> 60 min saved
        assertEquals(60, balanced.savings().minutesSaved());
        // winner costs more than the baseline -> no rupee saving is claimed
        assertEquals(0, balanced.savings().rupeesSaved().signum());
        assertTrue(balanced.savings().summary().contains("60"));

        RecommendationResponse cheapest = service.recommend(request(Preset.CHEAPEST, null), null);
        // 26.087 kWh * (20 - 12) Rs = Rs 208.70 cheaper than the baseline
        assertEquals(60, cheapest.savings().minutesSaved());
        assertEquals(208.70, cheapest.savings().rupeesSaved().doubleValue(), 0.02);
        assertTrue(cheapest.savings().summary().contains("208") || cheapest.savings().summary().contains("209"));
        // reasons mention the saving on the winner's card
        assertTrue(cheapest.items().get(0).reasons().stream().anyMatch(s -> s.contains("cheaper than the nearest station")));
    }

    @Test
    void incompatibleStationsAreSkipped() {
        RecommendationResponse r = service.recommend(request(Preset.BALANCED, null), null);
        // station 5 (CHAdeMO only) is the closest of all but the car cannot plug in
        assertFalse(ids(r).contains(5L));
        assertTrue(r.nearestBaseline().stationId() != 5L);   // the baseline is the nearest COMPATIBLE station
        // with explicit connector codes (no vehicle) a CHADEMO-only user sees only station 5
        RecommendationRequest chademoOnly = new RecommendationRequest(LAT, LON, null, List.of("CHADEMO"), null, 20, 80,
                Preset.BALANCED, null, 25.0, 8);
        RecommendationResponse c = service.recommend(chademoOnly, null);
        assertEquals(List.of(5L), ids(c));
    }

    @Test
    void stationsWithoutAFreeSlotInTheHorizonAreSkipped() {
        RecommendationResponse r = service.recommend(request(Preset.BALANCED, null), null);
        assertFalse(ids(r).contains(6L));   // always full, although 2 km away and compatible
        assertEquals(4, r.items().size());
    }

    @Test
    void breakdownContributionsSumToTheScore() {
        for (Preset preset : Preset.values()) {
            RecommendationResponse r = service.recommend(request(preset, null), null);
            for (RecommendedItem it : r.items()) {
                assertEquals(RecommendationService.COMPONENTS.size(), it.breakdown().size());
                double contributions = 0;
                double weights = 0;
                for (String key : RecommendationService.COMPONENTS) {
                    ComponentScore cs = it.breakdown().get(key);
                    assertNotNull(cs, key);
                    assertTrue(cs.score() >= 0.0 && cs.score() <= 1.0, key + " component out of range");
                    contributions += cs.contribution();
                    weights += cs.weight();
                }
                assertEquals(it.score(), contributions, 0.011);
                assertEquals(1.0, weights, 1e-3);
                assertTrue(it.score() >= 0.0 && it.score() <= 100.0);
            }
        }
    }

    @Test
    void reasonsAndTagsExplainTheRanking() {
        RecommendationResponse r = service.recommend(request(Preset.BALANCED, null), null);
        for (RecommendedItem it : r.items()) {
            assertFalse(it.reasons().isEmpty());
            assertTrue(it.reasons().get(0).contains("km away"));
            assertTrue(it.reasons().stream().anyMatch(s -> s.contains("Predicted crowding")));
        }
        RecommendedItem quiet = item(r, 4L);
        assertTrue(quiet.reasons().stream().anyMatch(s -> s.contains("LOW (10)")));
        assertTrue(item(r, 1L).reasons().stream().anyMatch(s -> s.contains("86 min")));

        assertTrue(item(r, 4L).tags().contains("Best overall"));
        assertTrue(item(r, 4L).tags().contains("Quietest"));
        assertTrue(item(r, 1L).tags().contains("Nearest"));
        assertTrue(item(r, 2L).tags().contains("Fastest"));
        assertTrue(item(r, 3L).tags().contains("Cheapest"));
        assertEquals("Best overall", r.items().get(0).tags().get(0));
    }

    @Test
    void itemCarriesSlotCostAndPointDetails() {
        RecommendationResponse r = service.recommend(request(Preset.BALANCED, null), null);
        RecommendedItem hub = item(r, 2L);
        assertEquals(21, hub.etaMinutes());                                    // ceil(6 km * 1.35 / 24 * 60)
        assertEquals(NOW.plusMinutes(21), hub.arrivalTime());
        assertEquals(LocalDateTime.of(2026, 10, 3, 10, 0), hub.slotStart());   // first grid slot after 09:51
        assertEquals(9, hub.waitMinutes());
        assertEquals(1, hub.slots());                                          // 100 kW: 16 min + 3 handshake
        assertEquals(hub.slotStart().plusMinutes(30), hub.slotEnd());
        assertEquals(19, hub.chargeMinutes());
        assertEquals(new BigDecimal("678.26"), hub.estimatedCost());           // 26.087 kWh * Rs 26 (NORMAL band)
        assertEquals(21L, hub.point().pointId());
        assertEquals("CCS2", hub.point().connectorCode());
        assertEquals("MEDIUM", hub.crowdingLevel());
        assertEquals(60.0, hub.crowdingIndex(), 1e-9);
        // station card is filled by StationService
        assertEquals("Fast Hub", hub.station().name());
        assertEquals("VoltGrid", hub.station().operatorName());
        assertNotNull(hub.station().distanceKm());
    }

    @Test
    void resultIsDeterministic() {
        RecommendationResponse a = service.recommend(request(Preset.BALANCED, null), null);
        RecommendationResponse b = service.recommend(request(Preset.BALANCED, null), null);
        assertEquals(ids(a), ids(b));
        for (int i = 0; i < a.items().size(); i++) {
            assertEquals(a.items().get(i).score(), b.items().get(i).score(), 0.0);
            assertEquals(a.items().get(i).slotStart(), b.items().get(i).slotStart());
        }
    }

    @Test
    void constraintsExcludeStationsAndReserveSlots() {
        // exclude the quiet station
        RecommendationService.Constraints excl = new RecommendationService.Constraints(null, Set.of(), Set.of(4L), null);
        RecommendationResponse r = service.recommend(request(Preset.BALANCED, null), null, excl);
        assertFalse(ids(r).contains(4L));
        assertEquals(3L, r.items().get(0).station().id());

        // a tentative reservation of the hub's 10:00 slot pushes its start to 10:30
        Set<String> extra = Set.of(RecommendationService.slotKey(21L, LocalDateTime.of(2026, 10, 3, 10, 0)));
        RecommendationService.Constraints reserve = new RecommendationService.Constraints(null, extra, Set.of(), null);
        RecommendationResponse r2 = service.recommend(request(Preset.BALANCED, null), null, reserve);
        assertEquals(LocalDateTime.of(2026, 10, 3, 10, 30), item(r2, 2L).slotStart());

        // restrict to some stations only
        RecommendationService.Constraints only = new RecommendationService.Constraints(null, Set.of(), Set.of(), List.of(2L, 3L));
        assertEquals(Set.of(2L, 3L), Set.copyOf(ids(service.recommend(request(Preset.BALANCED, null), null, only))));

        // latest allowed start 10:00 -> the nearest station (earliest start 11:00) drops out
        RecommendationService.Constraints deadline = new RecommendationService.Constraints(
                LocalDateTime.of(2026, 10, 3, 10, 0), Set.of(), Set.of(), null);
        assertFalse(ids(service.recommend(request(Preset.BALANCED, null), null, deadline)).contains(1L));
    }

    @Test
    void limitRadiusAndEmptyResult() {
        RecommendationRequest one = new RecommendationRequest(LAT, LON, 7L, null, null, 20, 80, Preset.BALANCED, null, 25.0, 2);
        assertEquals(2, service.recommend(one, null).items().size());

        // radius 3 km: only station 1 (1 km) is both in range and bookable (5 is incompatible, 6 is full)
        RecommendationRequest small = new RecommendationRequest(LAT, LON, 7L, null, null, 20, 80, Preset.BALANCED, null, 3.0, 8);
        assertEquals(List.of(1L), ids(service.recommend(small, null)));

        // radius 0.2 km: nothing in range
        RecommendationRequest tiny = new RecommendationRequest(LAT, LON, 7L, null, null, 20, 80, Preset.BALANCED, null, 0.2, 8);
        RecommendationResponse empty = service.recommend(tiny, null);
        assertTrue(empty.items().isEmpty());
        assertNull(empty.nearestBaseline());
        assertNotNull(empty.savings());
    }

    @Test
    void invalidSocRangeIsRejected() {
        RecommendationRequest bad = new RecommendationRequest(LAT, LON, 7L, null, null, 80, 60, Preset.BALANCED, null, 25.0, 8);
        assertThrows(BadRequestException.class, () -> service.recommend(bad, null));
    }

    @Test
    void energyNeededIsReported() {
        RecommendationResponse r = service.recommend(request(Preset.BALANCED, null), null);
        assertEquals(26.09, r.energyKwhNeeded(), 0.005);   // 0.6 * 40 / 0.92
        assertEquals(NOW, r.generatedAt());
    }
}
