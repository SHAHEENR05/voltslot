package com.chargeiq.service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.chargeiq.clock.AppClock;
import com.chargeiq.dto.StationDtos.AvailabilityDto;
import com.chargeiq.dto.StationDtos.PointAvailabilityDto;
import com.chargeiq.dto.StationDtos.SlotDto;
import com.chargeiq.entity.ChargingPoint;
import com.chargeiq.entity.Station;
import com.chargeiq.entity.Vehicle;
import com.chargeiq.entity.enums.PointStatus;
import com.chargeiq.exception.ResourceNotFoundException;
import com.chargeiq.repository.BookingSlotRepository;
import com.chargeiq.repository.ChargingPointRepository;
import com.chargeiq.repository.StationRepository;
import com.chargeiq.repository.VehicleRepository;
import com.chargeiq.util.TimeUtil;

/**
 * Answers "which 30-minute slots are free?".
 * <p>
 * The source of truth is the {@code booking_slots} table: one row per (charging point, slot start) that is taken
 * by a booking that is not CANCELLED/EXPIRED. Everything here is derived from it:
 * <ul>
 *   <li>{@link #availability} builds the per-point day grid shown in the booking screen
 *       (FREE / BOOKED / PAST / UNAVAILABLE);</li>
 *   <li>{@link #earliestFreeStart} finds the first start time with N consecutive free slots - used by the
 *       recommendation engine, fleet scheduler, reminders and the "alternatives" returned on a booking conflict.</li>
 * </ul>
 */
@Service
@Transactional
public class AvailabilityService {

    private static final int SLOT_MINUTES = TimeUtil.SLOT_MINUTES;

    private final StationRepository stations;
    private final ChargingPointRepository points;
    private final BookingSlotRepository slots;
    private final VehicleRepository vehicles;
    private final EstimatorService estimator;
    private final ForecastService forecast;
    private final AppClock clock;

    public AvailabilityService(StationRepository stations, ChargingPointRepository points, BookingSlotRepository slots,
                               VehicleRepository vehicles, EstimatorService estimator, ForecastService forecast,
                               AppClock clock) {
        this.stations = stations;
        this.points = points;
        this.slots = slots;
        this.vehicles = vehicles;
        this.estimator = estimator;
        this.forecast = forecast;
        this.clock = clock;
    }

    /**
     * Day grid for a station.
     *
     * @param date      day to show (null = today by the app clock)
     * @param vehicleId optional; when given, each point is flagged {@code compatible} for that vehicle
     *                  (without a vehicle every point is reported as compatible)
     */
    @Transactional(readOnly = true)
    public AvailabilityDto availability(Long stationId, LocalDate date, Long vehicleId) {
        Station st = stations.findById(stationId).orElseThrow(() -> new ResourceNotFoundException("Station", stationId));
        LocalDate day = date == null ? clock.today() : date;
        LocalDateTime now = clock.now();

        EstimatorService.VehicleSpec spec = null;
        if (vehicleId != null) {
            Vehicle v = vehicles.findById(vehicleId).orElseThrow(() -> new ResourceNotFoundException("Vehicle", vehicleId));
            spec = EstimatorService.specOf(v.getModel());
        }

        List<ChargingPoint> pts = points.findByStationIdOrderByIdAsc(stationId);
        List<Long> ids = new ArrayList<>();
        for (ChargingPoint p : pts) {
            ids.add(p.getId());
        }
        LocalDateTime dayStart = day.atStartOfDay();
        Map<Long, Set<LocalDateTime>> occupied = occupiedSlots(ids, dayStart, dayStart.plusDays(1));

        List<PointAvailabilityDto> out = new ArrayList<>();
        for (ChargingPoint p : pts) {
            Set<LocalDateTime> taken = occupied.get(p.getId());
            boolean pointActive = p.getStatus() == PointStatus.ACTIVE;
            List<SlotDto> row = new ArrayList<>(48);
            for (int i = 0; i < 48; i++) {
                LocalDateTime start = dayStart.plusMinutes((long) i * SLOT_MINUTES);
                int hour = start.getHour();
                String state;
                if (!pointActive || hour < st.getOpenHour() || hour >= st.getCloseHour()) {
                    state = "UNAVAILABLE";
                } else if (start.isBefore(now)) {
                    state = "PAST";
                } else if (taken != null && taken.contains(start)) {
                    state = "BOOKED";
                } else {
                    state = "FREE";
                }
                row.add(new SlotDto(start, state));
            }
            boolean compatible = spec == null || estimator.compatible(spec, p);
            out.add(new PointAvailabilityDto(p.getId(), p.getLabel(), p.getConnectorType().getCode(), p.getPowerKw(),
                    p.getTariffPerKwh(), compatible, row));
        }
        return new AvailabilityDto(stationId, day, SLOT_MINUTES, st.getOpenHour(), st.getCloseHour(), now, out,
                forecast.crowdingByHour(stationId, day));
    }

    /**
     * Taken slot starts per point in {@code [from, to)} - one query for all points. Every requested point id is
     * present as a key (possibly with an empty set).
     */
    @Transactional(readOnly = true)
    public Map<Long, Set<LocalDateTime>> occupiedSlots(Collection<Long> pointIds, LocalDateTime from, LocalDateTime to) {
        Map<Long, Set<LocalDateTime>> map = new HashMap<>();
        if (pointIds == null || pointIds.isEmpty()) {
            return map;
        }
        for (Long id : pointIds) {
            map.put(id, new HashSet<>());
        }
        // row = [pointId, slotStart]
        for (Object[] row : slots.findOccupied(pointIds, from, to)) {
            Long pid = ((Number) row[0]).longValue();
            Set<LocalDateTime> set = map.get(pid);
            if (set != null) {
                set.add((LocalDateTime) row[1]);
            }
        }
        return map;
    }

    /** True when every one of the {@code slots} slots starting at {@code slotStart} begins in an open hour [openHour, closeHour). */
    public boolean withinOpeningHours(Station st, LocalDateTime slotStart, int slots) {
        for (int i = 0; i < slots; i++) {
            int hour = slotStart.plusMinutes((long) i * SLOT_MINUTES).getHour();
            if (hour < st.getOpenHour() || hour >= st.getCloseHour()) {
                return false;
            }
        }
        return true;
    }

    /** True when none of the {@code slots} consecutive slots from {@code start} is in the occupied set. */
    public boolean isFree(Set<LocalDateTime> occupied, LocalDateTime start, int slots) {
        for (int i = 0; i < slots; i++) {
            if (occupied.contains(start.plusMinutes((long) i * SLOT_MINUTES))) {
                return false;
            }
        }
        return true;
    }

    /**
     * First on-grid start time {@code >= earliest} (rounded up to :00/:30) and {@code <= earliest + horizonHours}
     * for which {@code slots} consecutive slots are free and inside opening hours; {@code null} when none exists.
     * It scans slot by slot, which is at most ~25 iterations for the usual 12 h horizon.
     */
    public LocalDateTime earliestFreeStart(Station st, Set<LocalDateTime> occupied, LocalDateTime earliest, int slots,
                                           int horizonHours) {
        LocalDateTime limit = earliest.plusHours(horizonHours);
        LocalDateTime cur = TimeUtil.ceilToSlot(earliest);
        while (!cur.isAfter(limit)) {
            if (withinOpeningHours(st, cur, slots) && isFree(occupied, cur, slots)) {
                return cur;
            }
            cur = cur.plusMinutes(SLOT_MINUTES);
        }
        return null;
    }
}
