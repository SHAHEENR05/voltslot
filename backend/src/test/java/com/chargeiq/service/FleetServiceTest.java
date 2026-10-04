package com.chargeiq.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.transaction.PlatformTransactionManager;

import com.chargeiq.clock.AppClock;
import com.chargeiq.dto.BookingDtos.BookingDto;
import com.chargeiq.dto.FleetDtos.ApplyItem;
import com.chargeiq.dto.FleetDtos.ApplyRequest;
import com.chargeiq.dto.FleetDtos.ApplyResponse;
import com.chargeiq.dto.FleetDtos.ScheduleRequest;
import com.chargeiq.dto.FleetDtos.ScheduleResponse;
import com.chargeiq.dto.RecommendationDtos.PointRef;
import com.chargeiq.dto.RecommendationDtos.RecommendationRequest;
import com.chargeiq.dto.RecommendationDtos.RecommendationResponse;
import com.chargeiq.dto.RecommendationDtos.RecommendedItem;
import com.chargeiq.dto.StationDtos.StationSummaryDto;
import com.chargeiq.entity.ChargingPoint;
import com.chargeiq.entity.Fleet;
import com.chargeiq.entity.RechargePrediction;
import com.chargeiq.entity.Station;
import com.chargeiq.entity.User;
import com.chargeiq.entity.Vehicle;
import com.chargeiq.entity.VehicleModel;
import com.chargeiq.entity.enums.BookingSource;
import com.chargeiq.entity.enums.PaymentMethod;
import com.chargeiq.entity.enums.Preset;
import com.chargeiq.entity.enums.Role;
import com.chargeiq.entity.enums.StationTier;
import com.chargeiq.entity.enums.UserStatus;
import com.chargeiq.exception.ConflictException;
import com.chargeiq.repository.BookingRepository;
import com.chargeiq.repository.ChargingPointRepository;
import com.chargeiq.repository.ChargingSessionRepository;
import com.chargeiq.repository.FleetRepository;
import com.chargeiq.repository.RechargePredictionRepository;
import com.chargeiq.repository.StationRepository;
import com.chargeiq.repository.UserRepository;
import com.chargeiq.repository.VehicleRepository;
import com.chargeiq.security.AuthUser;
import com.chargeiq.service.RecommendationService.Constraints;

/** Pure-logic tests of the greedy fleet scheduler and the per-item apply (Mockito, no Spring context). */
class FleetServiceTest {

    private static final LocalDateTime W_START = LocalDateTime.of(2026, 10, 3, 22, 0);
    private static final LocalDateTime W_END = LocalDateTime.of(2026, 10, 4, 6, 0);

    private VehicleRepository vehicles;
    private RechargePredictionRepository predictions;
    private RecommendationService recommendation;
    private BookingService bookingService;
    private UserRepository users;
    private ChargingPointRepository points;
    private FleetService service;
    private AuthUser manager;
    private Fleet fleet;

    @BeforeEach
    void setUp() {
        vehicles = mock(VehicleRepository.class);
        predictions = mock(RechargePredictionRepository.class);
        recommendation = mock(RecommendationService.class);
        bookingService = mock(BookingService.class);
        users = mock(UserRepository.class);
        points = mock(ChargingPointRepository.class);
        service = new FleetService(mock(FleetRepository.class), vehicles, mock(BookingRepository.class),
                mock(ChargingSessionRepository.class), predictions, recommendation, bookingService, users,
                mock(StationRepository.class), points, mock(AppClock.class), mock(PlatformTransactionManager.class));
        manager = new AuthUser(900L, "fleet@voltslot.in", "Fleet Manager", "x", Role.FLEET_MANAGER, UserStatus.ACTIVE, null, 7L);
        fleet = new Fleet();
        fleet.setId(7L);
        when(users.findById(900L)).thenReturn(Optional.of(new User()));
    }

    @Test
    void mostUrgentVehicleIsPlannedFirstAndItsSlotsBlockTheNext() {
        Vehicle late = vehicle(1L);
        Vehicle urgent = vehicle(2L);
        when(vehicles.findById(1L)).thenReturn(Optional.of(late));
        when(vehicles.findById(2L)).thenReturn(Optional.of(urgent));
        when(predictions.findByVehicleId(1L)).thenReturn(Optional.of(prediction(W_START.plusDays(3))));
        when(predictions.findByVehicleId(2L)).thenReturn(Optional.of(prediction(W_START.minusDays(1))));
        // Both calls get the same answer (point 10, 23:00-24:00); we only inspect what the service passes in.
        when(recommendation.recommend(any(), any(), any())).thenReturn(
                response(item(1L, 10L, W_START.plusHours(1), W_START.plusHours(2))));

        ScheduleResponse r = service.schedule(manager, new ScheduleRequest(List.of(1L, 2L), W_START, W_END,
                19.07, 72.87, 20, 80, Preset.BALANCED, null));

        ArgumentCaptor<RecommendationRequest> reqs = ArgumentCaptor.forClass(RecommendationRequest.class);
        ArgumentCaptor<Constraints> cons = ArgumentCaptor.forClass(Constraints.class);
        verify(recommendation, org.mockito.Mockito.times(2)).recommend(reqs.capture(), any(), cons.capture());
        assertEquals(Long.valueOf(2L), reqs.getAllValues().get(0).vehicleId(), "urgent vehicle first");
        assertEquals(Long.valueOf(1L), reqs.getAllValues().get(1).vehicleId());
        assertEquals(W_START, reqs.getAllValues().get(0).arrivalTime(), "arrival = window start");
        assertTrue(cons.getAllValues().get(0).extraOccupied().isEmpty());
        // Second call must see BOTH 30-minute slots of the first vehicle's booking as occupied.
        assertTrue(cons.getAllValues().get(1).extraOccupied()
                .contains(RecommendationService.slotKey(10L, W_START.plusHours(1))));
        assertTrue(cons.getAllValues().get(1).extraOccupied()
                .contains(RecommendationService.slotKey(10L, W_START.plusHours(1).plusMinutes(30))));
        assertEquals(W_END.minusMinutes(30), cons.getAllValues().get(0).notAfter());
        assertEquals(2, r.plan().size());
        assertEquals(Long.valueOf(2L), r.plan().get(0).vehicleId());
        assertEquals(1, r.stationsUsed());
        assertEquals(0, new BigDecimal("200.00").compareTo(r.totalCost()));
    }

    @Test
    void stationsAtTheLimitAreExcludedForLaterVehicles() {
        when(vehicles.findById(1L)).thenReturn(Optional.of(vehicle(1L)));
        when(vehicles.findById(2L)).thenReturn(Optional.of(vehicle(2L)));
        when(recommendation.recommend(any(), any(), any())).thenReturn(
                response(item(1L, 10L, W_START.plusHours(1), W_START.plusHours(2))));

        service.schedule(manager, new ScheduleRequest(List.of(1L, 2L), W_START, W_END, null, null, null, null, null, 1));

        ArgumentCaptor<Constraints> cons = ArgumentCaptor.forClass(Constraints.class);
        verify(recommendation, org.mockito.Mockito.times(2)).recommend(any(), any(), cons.capture());
        assertTrue(cons.getAllValues().get(0).excludedStationIds().isEmpty());
        assertTrue(cons.getAllValues().get(1).excludedStationIds().contains(1L), "station 1 already holds 1 vehicle");
    }

    @Test
    void vehicleWithOnlyTooLateSlotsIsReportedUnassigned() {
        when(vehicles.findById(1L)).thenReturn(Optional.of(vehicle(1L)));
        // finishes at 06:30, window ends 06:00
        when(recommendation.recommend(any(), any(), any())).thenReturn(
                response(item(1L, 10L, W_END.minusMinutes(30), W_END.plusMinutes(30))));

        ScheduleResponse r = service.schedule(manager, new ScheduleRequest(List.of(1L), W_START, W_END, null, null, null, null, null, null));

        assertTrue(r.plan().isEmpty());
        assertEquals(1, r.unassigned().size());
        assertTrue(r.unassigned().get(0).reason().contains("after the window"));
        assertEquals(0.0, r.avgWaitMinutes());
    }

    @Test
    void emptyRecommendationGivesUnassignedWithReason() {
        when(vehicles.findById(1L)).thenReturn(Optional.of(vehicle(1L)));
        when(recommendation.recommend(any(), any(), any())).thenReturn(response());

        ScheduleResponse r = service.schedule(manager, new ScheduleRequest(List.of(1L), W_START, W_END, null, null, null, null, null, null));

        assertEquals(1, r.unassigned().size());
        assertTrue(r.unassigned().get(0).reason().startsWith("No compatible station"));
    }

    @Test
    void applyReportsPartialFailuresInsteadOfAborting() {
        Vehicle v1 = vehicle(1L);
        Vehicle v2 = vehicle(2L);
        when(vehicles.findById(1L)).thenReturn(Optional.of(v1));
        when(vehicles.findById(2L)).thenReturn(Optional.of(v2));
        Station st = station(1L);
        ChargingPoint p = new ChargingPoint();
        p.setId(10L);
        p.setStation(st);
        when(points.findById(10L)).thenReturn(Optional.of(p));

        BookingDto hold = mock(BookingDto.class);
        when(hold.id()).thenReturn(55L);
        BookingDto confirmed = mock(BookingDto.class);
        when(bookingService.createHold(any(User.class), eq(v1), any(ChargingPoint.class), any(Station.class), any(LocalDateTime.class),
                anyInt(), anyInt(), eq(BookingSource.FLEET), eq(5))).thenReturn(hold);
        when(bookingService.createHold(any(User.class), eq(v2), any(ChargingPoint.class), any(Station.class), any(LocalDateTime.class),
                anyInt(), anyInt(), eq(BookingSource.FLEET), eq(5))).thenThrow(new ConflictException("Slot just taken"));
        when(bookingService.confirm(manager, 55L, PaymentMethod.WALLET)).thenReturn(confirmed);

        ApplyResponse r = service.apply(manager, new ApplyRequest(List.of(
                new ApplyItem(1L, 10L, W_START, 20, 80),
                new ApplyItem(2L, 10L, W_START, 20, 80))));

        assertEquals(1, r.created().size());
        assertEquals(1, r.failures().size());
        assertEquals(Long.valueOf(2L), r.failures().get(0).vehicleId());
        assertEquals("Slot just taken", r.failures().get(0).reason());
    }

    @Test
    void vehicleOfAnotherFleetIsForbidden() {
        Vehicle foreign = vehicle(3L);
        Fleet other = new Fleet();
        other.setId(99L);
        foreign.setFleet(other);
        when(vehicles.findById(3L)).thenReturn(Optional.of(foreign));

        assertThrows(com.chargeiq.exception.ForbiddenException.class, () -> service.schedule(manager,
                new ScheduleRequest(List.of(3L), W_START, W_END, null, null, null, null, null, null)));
    }

    // ------------------------------------------------------------------ fixtures

    private Vehicle vehicle(Long id) {
        VehicleModel m = new VehicleModel();
        m.setMake("Tata");
        m.setModel("Ace EV");
        Vehicle v = new Vehicle();
        v.setId(id);
        v.setFleet(fleet);
        v.setModel(m);
        v.setNickname("Van " + id);
        return v;
    }

    private RechargePrediction prediction(LocalDateTime nextDue) {
        RechargePrediction p = new RechargePrediction();
        p.setNextDueAt(nextDue);
        return p;
    }

    private static Station station(Long id) {
        Station s = new Station();
        s.setId(id);
        s.setName("Station " + id);
        return s;
    }

    private static RecommendedItem item(Long stationId, Long pointId, LocalDateTime start, LocalDateTime end) {
        StationSummaryDto dto = new StationSummaryDto(stationId, "Station " + stationId, "addr", "Thane", "Thane",
                19.2, 72.9, StationTier.STANDARD, 1L, "Op", 1.0, List.of(), 2, 2, new BigDecimal("14.00"), 4.0, 5,
                80.0, "POSITIVE", true, 0, 24, 2, 20.0, "LOW");
        PointRef ref = new PointRef(pointId, "P" + pointId, "CCS2", 60.0, new BigDecimal("14.00"));
        return new RecommendedItem(1, 90.0, dto, ref, 10, W_START, start, end, 2, 0, 60,
                new BigDecimal("100.00"), new BigDecimal("14.00"), 20.0, "LOW", Map.of(), List.of("No wait"), List.of());
    }

    private static RecommendationResponse response(RecommendedItem... items) {
        return new RecommendationResponse(W_START, Preset.BALANCED, null, 20.0, List.of(items), null, null);
    }
}
