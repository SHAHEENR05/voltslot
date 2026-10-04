package com.chargeiq.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.chargeiq.clock.AppClock;
import com.chargeiq.entity.Booking;
import com.chargeiq.entity.ChargingSession;
import com.chargeiq.entity.RechargePrediction;
import com.chargeiq.entity.Station;
import com.chargeiq.entity.User;
import com.chargeiq.entity.Vehicle;
import com.chargeiq.repository.ChargingSessionRepository;
import com.chargeiq.repository.RechargePredictionRepository;
import com.chargeiq.repository.StationRepository;
import com.chargeiq.repository.VehicleRepository;

/** Mockito unit tests for the recharge-time prediction algorithm (median interval, confidence, modes, state). */
class RechargePredictionServiceTest {
    private ChargingSessionRepository sessions;
    private RechargePredictionRepository repo;
    private StationRepository stations;
    private RechargePredictionService service;
    private Vehicle vehicle;
    private Station hub;
    private Station other;

    @BeforeEach
    void setUp() {
        sessions = mock(ChargingSessionRepository.class);
        repo = mock(RechargePredictionRepository.class);
        stations = mock(StationRepository.class);
        VehicleRepository vehicles = mock(VehicleRepository.class);
        AppClock clock = new AppClock("FIXED", "2026-10-03T09:30:00");
        service = new RechargePredictionService(sessions, repo, vehicles, stations, clock);

        User u = new User();
        u.setId(1L);
        vehicle = new Vehicle();
        vehicle.setId(10L);
        vehicle.setUser(u);

        hub = new Station();
        hub.setId(100L);
        other = new Station();
        other.setId(200L);
        when(stations.findById(100L)).thenReturn(Optional.of(hub));
        when(stations.findById(200L)).thenReturn(Optional.of(other));
        when(repo.findByVehicleId(10L)).thenReturn(Optional.empty());
        when(repo.save(any(RechargePrediction.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    private ChargingSession session(LocalDateTime start, double kwh, Station station) {
        Booking b = new Booking();
        b.setStation(station);
        b.setVehicle(vehicle);
        ChargingSession s = new ChargingSession();
        s.setBooking(b);
        s.setStartedAt(start);
        s.setEndedAt(start.plusHours(1));
        s.setEnergyKwh(kwh);
        return s;
    }

    /** Sessions starting at 19:00 with the given day gaps between them. */
    private List<ChargingSession> sessionsWithGaps(double... gapDays) {
        List<ChargingSession> list = new ArrayList<>();
        LocalDateTime t = LocalDateTime.of(2026, 8, 1, 19, 0);
        list.add(session(t, 20, hub));
        for (double g : gapDays) {
            t = t.plusMinutes(Math.round(g * 24 * 60));
            list.add(session(t, 20, hub));
        }
        return list;
    }

    @Test
    void fewerThanThreeSessionsGivesNoPrediction() {
        when(sessions.findByVehicleOrdered(10L)).thenReturn(sessionsWithGaps(6)); // 2 sessions
        assertTrue(service.recompute(vehicle).isEmpty());
        verify(repo, never()).save(any());
    }

    @Test
    void medianOfIntervalsAndNextDue() {
        // gaps 5, 6, 7, 6, 30 -> median 6 (the 30-day holiday does not distort it)
        List<ChargingSession> list = sessionsWithGaps(5, 6, 7, 6, 30);
        when(sessions.findByVehicleOrdered(10L)).thenReturn(list);

        RechargePrediction p = service.recompute(vehicle).orElseThrow();
        assertEquals(6.0, p.getMedianIntervalDays(), 1e-6);
        ChargingSession last = list.get(list.size() - 1);
        assertEquals(last.getEndedAt(), p.getLastChargeAt());
        assertEquals(last.getEndedAt().plusDays(6), p.getNextDueAt());
        assertEquals(6, p.getSessionsUsed());
    }

    @Test
    void onlyLastSixIntervalsAreUsed() {
        // 8 gaps: first two (50 days) must be ignored, last six are all 4 days
        when(sessions.findByVehicleOrdered(10L)).thenReturn(sessionsWithGaps(50, 50, 4, 4, 4, 4, 4, 4));
        RechargePrediction p = service.recompute(vehicle).orElseThrow();
        assertEquals(4.0, p.getMedianIntervalDays(), 1e-6);
    }

    @Test
    void evenNumberOfIntervalsUsesMeanOfMiddleTwo() {
        assertEquals(5.5, RechargePredictionService.median(List.of(5.0, 6.0, 4.0, 7.0)), 1e-9);
        assertEquals(6.0, RechargePredictionService.median(List.of(9.0, 6.0, 1.0)), 1e-9);
    }

    @Test
    void confidenceIsHighForRegularAndLowForErraticDrivers() {
        double regular = RechargePredictionService.confidence(List.of(6.0, 6.0, 6.0, 6.0, 6.0, 6.0), 7);
        assertEquals(0.95, regular, 1e-9); // cv = 0 -> clamped at 0.95, full history factor

        double erratic = RechargePredictionService.confidence(List.of(1.0, 20.0, 2.0, 25.0, 1.0, 30.0), 7);
        assertEquals(0.2, erratic, 1e-9); // cv > 0.8 -> clamped at the 0.2 floor
    }

    @Test
    void confidenceIsScaledDownForShortHistory() {
        // 3 sessions -> factor 3/6 = 0.5; perfectly regular -> 0.95 * 0.5
        double c = RechargePredictionService.confidence(List.of(5.0, 5.0), 3);
        assertEquals(0.475, c, 1e-9);
    }

    @Test
    void preferredHourAndStationAreModesOfRecentSessions() {
        List<ChargingSession> list = new ArrayList<>();
        LocalDateTime t = LocalDateTime.of(2026, 8, 1, 18, 0);
        for (int i = 0; i < 6; i++) {
            // 4 x hub at 19:00, 2 x other at 08:00
            boolean evening = i != 1 && i != 3;
            list.add(session(evening ? t.withHour(19) : t.withHour(8), 10 + i * 2, evening ? hub : other));
            t = t.plusDays(5);
        }
        when(sessions.findByVehicleOrdered(10L)).thenReturn(list);

        RechargePrediction p = service.recompute(vehicle).orElseThrow();
        assertEquals(19, p.getPreferredHour());
        assertEquals(100L, p.getPreferredStation().getId());
        assertEquals(15.0, p.getAvgEnergyKwh(), 0.01); // mean of 10,12,14,16,18,20
    }

    @Test
    void averageEnergyUsesLastTenSessionsOnly() {
        List<ChargingSession> list = new ArrayList<>();
        LocalDateTime t = LocalDateTime.of(2026, 1, 1, 19, 0);
        for (int i = 0; i < 12; i++) {
            list.add(session(t, i < 2 ? 100 : 10, hub)); // first two are outliers and must be ignored
            t = t.plusDays(3);
        }
        when(sessions.findByVehicleOrdered(10L)).thenReturn(list);
        RechargePrediction p = service.recompute(vehicle).orElseThrow();
        assertEquals(10.0, p.getAvgEnergyKwh(), 1e-9);
    }

    @Test
    void existingPredictionRowIsUpdatedNotDuplicated() {
        RechargePrediction existing = new RechargePrediction();
        existing.setId(55L);
        when(repo.findByVehicleId(10L)).thenReturn(Optional.of(existing));
        when(sessions.findByVehicleOrdered(10L)).thenReturn(sessionsWithGaps(5, 5));
        RechargePrediction p = service.recompute(vehicle).orElseThrow();
        assertEquals(55L, p.getId());
    }

    @Test
    void stateMachine() {
        RechargePrediction p = new RechargePrediction();
        LocalDateTime due = LocalDateTime.of(2026, 10, 10, 12, 0);
        p.setNextDueAt(due);

        assertEquals("NO_DATA", RechargePredictionService.state(null, due, 24));
        assertEquals("UPCOMING", RechargePredictionService.state(p, due.minusHours(25), 24));
        assertEquals("DUE_SOON", RechargePredictionService.state(p, due.minusHours(24), 24));
        assertEquals("DUE_SOON", RechargePredictionService.state(p, due, 24));
        assertEquals("OVERDUE", RechargePredictionService.state(p, due.plusMinutes(1), 24));
        assertFalse("UPCOMING".equals(RechargePredictionService.state(p, due.minusHours(2), 24)));
    }
}
