package com.chargeiq.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import com.chargeiq.clock.AppClock;
import com.chargeiq.dto.RecommendationDtos.PointRef;
import com.chargeiq.dto.RecommendationDtos.RecommendationResponse;
import com.chargeiq.dto.RecommendationDtos.RecommendedItem;
import com.chargeiq.dto.StationDtos.StationSummaryDto;
import com.chargeiq.dto.TripDtos.TripRequest;
import com.chargeiq.dto.TripDtos.TripResponse;
import com.chargeiq.entity.ChargingPoint;
import com.chargeiq.entity.ConnectorType;
import com.chargeiq.entity.Operator;
import com.chargeiq.entity.Station;
import com.chargeiq.entity.enums.CurrentType;
import com.chargeiq.entity.enums.Preset;
import com.chargeiq.entity.enums.StationStatus;
import com.chargeiq.entity.enums.StationTier;
import com.chargeiq.repository.ChargingPointRepository;
import com.chargeiq.repository.StationRepository;
import com.chargeiq.service.RecommendationService.Constraints;

/** Pure-logic tests of the trip planner (Mockito, no Spring context, no database). */
class TripPlannerServiceTest {

    private static final LocalDateTime DEPART = LocalDateTime.of(2026, 10, 3, 10, 0);
    // Mumbai -> Pune: about 120 km straight, 156 km by the 1.3 road factor.
    private static final double MUM_LAT = 19.0760, MUM_LON = 72.8777, PUNE_LAT = 18.5204, PUNE_LON = 73.8567;

    private VehicleService vehicleService;
    private RecommendationService recommendation;
    private StationRepository stations;
    private ChargingPointRepository points;
    private EstimatorService estimator;
    private TripPlannerService service;

    @BeforeEach
    void setUp() {
        vehicleService = mock(VehicleService.class);
        recommendation = mock(RecommendationService.class);
        stations = mock(StationRepository.class);
        points = mock(ChargingPointRepository.class);
        estimator = mock(EstimatorService.class);
        service = new TripPlannerService(vehicleService, recommendation, stations, points, estimator,
                mock(ForecastService.class), mock(StationService.class), mock(AppClock.class));
        when(estimator.compatible(any(), any())).thenReturn(true);
    }

    private TripRequest request(double dLat, double dLon, int soc, Integer reserve) {
        return new TripRequest(MUM_LAT, MUM_LON, dLat, dLon, null, soc, DEPART, reserve);
    }

    @Test
    void shortTripNeedsNoChargingStop() {
        // Thane is ~19 km away, an 80 % generic car can drive that easily.
        TripResponse r = service.plan(request(19.2183, 72.9781, 80, null), null);

        assertTrue(r.feasible());
        assertFalse(r.needsCharging());
        assertEquals(1, r.legs().size());
        assertEquals("DRIVE", r.legs().get(0).type());
        assertEquals(2, r.polyline().size());
        assertNotNull(r.arriveAt());
        assertTrue(r.notes().stream().anyMatch(n -> n.toLowerCase().contains("straight-line corridor")));
        verify(recommendation, never()).recommend(any(), any(), any());
    }

    @Test
    void longTripInsertsOneChargingStopInsideTheCorridor() {
        Station mid = station(5L, 18.798, 73.367);   // roughly half way along the line
        ChargingPoint dc = dcPoint(50L, mid);
        when(stations.findByStatus(StationStatus.ACTIVE)).thenReturn(List.of(mid));
        when(points.findByStationIdInOrderByIdAsc(any())).thenReturn(List.of(dc));
        when(recommendation.recommend(any(), any(), any())).thenReturn(response(item(mid, dc)));

        TripResponse r = service.plan(request(PUNE_LAT, PUNE_LON, 60, null), null);

        assertTrue(r.needsCharging());
        assertTrue(r.feasible());
        assertEquals(3, r.legs().size());
        assertEquals("DRIVE", r.legs().get(0).type());
        assertEquals("CHARGE", r.legs().get(1).type());
        assertEquals("DRIVE", r.legs().get(2).type());
        assertEquals(Long.valueOf(50L), r.legs().get(1).pointId());
        assertEquals(3, r.polyline().size());
        assertNotNull(r.arriveAt());
        assertTrue(r.arriveAt().isAfter(DEPART));
        // The ranking must have been restricted to the corridor candidates.
        ArgumentCaptor<Constraints> cap = ArgumentCaptor.forClass(Constraints.class);
        verify(recommendation).recommend(any(), any(), cap.capture());
        assertTrue(cap.getValue().onlyStationIds().contains(5L));
        // Battery at the end must not be below the 10 % reserve.
        assertTrue(r.arrivalSocPercent() >= 10);
    }

    @Test
    void stationOutsideTheSixKmCorridorIsIgnored() {
        Station far = station(6L, 19.30, 73.60);     // ~35 km away from the line
        when(stations.findByStatus(StationStatus.ACTIVE)).thenReturn(List.of(far));
        when(points.findByStationIdInOrderByIdAsc(any())).thenReturn(List.of(dcPoint(60L, far)));

        TripResponse r = service.plan(request(PUNE_LAT, PUNE_LON, 60, null), null);

        assertFalse(r.feasible());
        verify(recommendation, never()).recommend(any(), any(), any());
    }

    @Test
    void noStationMeansNotFeasibleWithExplanation() {
        when(stations.findByStatus(StationStatus.ACTIVE)).thenReturn(List.of());

        TripResponse r = service.plan(request(PUNE_LAT, PUNE_LON, 60, null), null);

        assertFalse(r.feasible());
        assertTrue(r.needsCharging());
        assertNull(r.arriveAt());
        assertTrue(r.notes().stream().anyMatch(n -> n.contains("No compatible DC")));
    }

    @Test
    void startingAtOrBelowReserveIsNotFeasible() {
        TripResponse r = service.plan(request(PUNE_LAT, PUNE_LON, 10, null), null);

        assertFalse(r.feasible());
        assertTrue(r.legs().isEmpty());
        assertTrue(r.notes().stream().anyMatch(n -> n.contains("reserve")));
    }

    @Test
    void driveTimeBlendsCityAndHighwaySpeed() {
        // 20 km at 28 km/h = 42.86 min, +45 km at 45 km/h = 60 min  ->  103 min (ceil)
        assertEquals(103, TripPlannerService.driveMinutes(65));
        // purely city part
        assertEquals(43, TripPlannerService.driveMinutes(20));
    }

    // ------------------------------------------------------------------ fixtures

    private static Station station(Long id, double lat, double lon) {
        Station s = new Station();
        s.setId(id);
        s.setName("Station " + id);
        s.setZone("Highway");
        s.setLatitude(lat);
        s.setLongitude(lon);
        s.setStatus(StationStatus.ACTIVE);
        s.setOperator(new Operator());
        return s;
    }

    private static ChargingPoint dcPoint(Long id, Station s) {
        ConnectorType ct = new ConnectorType();
        ct.setId(1L);
        ct.setCode("CCS2");
        ct.setCurrentType(CurrentType.DC);
        ct.setTypicalKw(60.0);
        ChargingPoint p = new ChargingPoint();
        p.setId(id);
        p.setStation(s);
        p.setLabel("DC-" + id);
        p.setConnectorType(ct);
        p.setPowerKw(60.0);
        p.setTariffPerKwh(new BigDecimal("18.00"));
        return p;
    }

    private static RecommendedItem item(Station s, ChargingPoint p) {
        StationSummaryDto dto = new StationSummaryDto(s.getId(), s.getName(), "addr", s.getZone(), "Pune",
                s.getLatitude(), s.getLongitude(), StationTier.STANDARD, 1L, "Op", null, List.of(), 1, 1,
                new BigDecimal("18.00"), 4.0, 10, 80.0, "POSITIVE", true, 0, 24, 1, 20.0, "LOW");
        PointRef ref = new PointRef(p.getId(), p.getLabel(), "CCS2", 60.0, p.getTariffPerKwh());
        LocalDateTime start = DEPART.plusMinutes(120);
        return new RecommendedItem(1, 80.0, dto, ref, 5, DEPART.plusMinutes(110), start, start.plusMinutes(30), 1, 10, 30,
                new BigDecimal("150.00"), new BigDecimal("18.00"), 20.0, "LOW", Map.of(), List.of("test"), List.of());
    }

    private static RecommendationResponse response(RecommendedItem... items) {
        return new RecommendationResponse(DEPART, Preset.BALANCED, null, 10.0, List.of(items), null, null);
    }

    @SuppressWarnings("unused")
    private static Set<Long> ids(Long... v) {
        return Set.of(v);
    }
}
