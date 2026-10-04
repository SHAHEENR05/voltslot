package com.chargeiq.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import com.chargeiq.clock.AppClock;
import com.chargeiq.dto.BookingDtos.BookingDto;
import com.chargeiq.dto.FleetDtos.ApplyFailure;
import com.chargeiq.dto.FleetDtos.ApplyItem;
import com.chargeiq.dto.FleetDtos.ApplyRequest;
import com.chargeiq.dto.FleetDtos.ApplyResponse;
import com.chargeiq.dto.FleetDtos.FleetOverviewDto;
import com.chargeiq.dto.FleetDtos.FleetVehicleRow;
import com.chargeiq.dto.FleetDtos.ScheduleItem;
import com.chargeiq.dto.FleetDtos.ScheduleRequest;
import com.chargeiq.dto.FleetDtos.ScheduleResponse;
import com.chargeiq.dto.FleetDtos.Unassigned;
import com.chargeiq.dto.RecommendationDtos.RecommendationRequest;
import com.chargeiq.dto.RecommendationDtos.RecommendationResponse;
import com.chargeiq.dto.RecommendationDtos.RecommendedItem;
import com.chargeiq.entity.Booking;
import com.chargeiq.entity.ChargingPoint;
import com.chargeiq.entity.ChargingSession;
import com.chargeiq.entity.Fleet;
import com.chargeiq.entity.RechargePrediction;
import com.chargeiq.entity.Station;
import com.chargeiq.entity.User;
import com.chargeiq.entity.Vehicle;
import com.chargeiq.entity.enums.BookingSource;
import com.chargeiq.entity.enums.BookingStatus;
import com.chargeiq.entity.enums.PaymentMethod;
import com.chargeiq.entity.enums.Preset;
import com.chargeiq.exception.BadRequestException;
import com.chargeiq.exception.ForbiddenException;
import com.chargeiq.exception.ResourceNotFoundException;
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

/**
 * Fleet manager console: a 30-day overview of the fleet and the smart <b>fleet charging scheduler</b>.
 *
 * <p><b>Scheduler idea (greedy, easy to explain in a viva):</b>
 * <ol>
 *   <li>Sort the selected vehicles by urgency - the vehicle whose next charge is predicted earliest goes first
 *       (all vehicles share the assumed start SoC, so the recharge prediction is the tie-breaker).</li>
 *   <li>For every vehicle ask the {@link RecommendationService} for the best station/point/slot inside the
 *       time window, but hand it a {@link Constraints} object that carries what earlier vehicles already
 *       took (tentative slot keys) and which stations are already "full" (maxPerStation).</li>
 *   <li>Take the first result that finishes inside the window, remember its slots, continue with the next vehicle.</li>
 * </ol>
 * The plan is only a proposal - {@link #schedule} never writes to the database. {@link #apply} turns each plan
 * item into a real booking (hold + wallet payment), one independent transaction per item, so one failure
 * (e.g. low wallet balance) does not undo the bookings that already succeeded.</p>
 */
@Service
@Transactional
public class FleetService {

    private static final int DEFAULT_SOC_START = 20;
    private static final int DEFAULT_SOC_TARGET = 80;
    /** Fallback origin (Mumbai) when neither the request nor the manager's home location is known. */
    private static final double DEFAULT_LAT = 19.0760;
    private static final double DEFAULT_LON = 72.8777;
    private static final DateTimeFormatter DUE_FMT = DateTimeFormatter.ofPattern("dd MMM HH:mm");

    private final FleetRepository fleets;
    private final VehicleRepository vehicles;
    private final BookingRepository bookings;
    private final ChargingSessionRepository sessions;
    private final RechargePredictionRepository predictions;
    private final RecommendationService recommendation;
    private final BookingService bookingService;
    private final UserRepository users;
    private final StationRepository stations;
    private final ChargingPointRepository points;
    private final AppClock clock;
    /** Runs every apply() item in its own (new) transaction. */
    private final TransactionTemplate perItemTx;

    public FleetService(FleetRepository fleets, VehicleRepository vehicles, BookingRepository bookings,
                        ChargingSessionRepository sessions, RechargePredictionRepository predictions,
                        RecommendationService recommendation, BookingService bookingService, UserRepository users,
                        StationRepository stations, ChargingPointRepository points, AppClock clock,
                        PlatformTransactionManager txManager) {
        this.fleets = fleets;
        this.vehicles = vehicles;
        this.bookings = bookings;
        this.sessions = sessions;
        this.predictions = predictions;
        this.recommendation = recommendation;
        this.bookingService = bookingService;
        this.users = users;
        this.stations = stations;
        this.points = points;
        this.clock = clock;
        this.perItemTx = new TransactionTemplate(txManager);
        this.perItemTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    // ------------------------------------------------------------------ overview

    /** One row per fleet vehicle plus 30-day totals (sessions, energy, spend). */
    @Transactional(readOnly = true)
    public FleetOverviewDto overview(AuthUser actor) {
        Long fleetId = fleetIdOf(actor);
        Fleet fleet = fleets.findById(fleetId).orElseThrow(() -> new ResourceNotFoundException("Fleet", fleetId));
        LocalDateTime now = clock.now();
        LocalDateTime since = now.minusDays(30);
        int leadHours = users.findById(actor.getId()).map(User::getReminderLeadHours).orElse(24);

        List<Vehicle> fleetVehicles = vehicles.findByFleetIdOrderByIdAsc(fleetId);
        // findFleetBookings is ordered by start time, so putIfAbsent keeps the NEXT booking of each vehicle.
        List<Booking> upcoming = bookings.findFleetBookings(fleetId, BookingStatus.LIVE, now);
        Map<Long, Booking> nextByVehicle = new HashMap<>();
        for (Booking b : upcoming) {
            nextByVehicle.putIfAbsent(b.getVehicle().getId(), b);
        }

        int sessionCount = 0;
        double energy = 0;
        BigDecimal spend = BigDecimal.ZERO;
        List<FleetVehicleRow> rows = new ArrayList<>();
        for (Vehicle v : fleetVehicles) {
            List<ChargingSession> history = sessions.findByVehicleOrdered(v.getId());
            LocalDateTime lastCharge = null;
            for (ChargingSession s : history) {
                lastCharge = s.getEndedAt();
                if (!s.getStartedAt().isBefore(since)) {
                    sessionCount++;
                    energy += s.getEnergyKwh();
                    spend = spend.add(s.getAmount());
                }
            }
            RechargePrediction pred = predictions.findByVehicleId(v.getId()).orElse(null);
            if (lastCharge == null && pred != null) {
                lastCharge = pred.getLastChargeAt();
            }
            Booking next = nextByVehicle.get(v.getId());
            rows.add(new FleetVehicleRow(VehicleService.toDto(v), lastCharge,
                    pred == null ? null : pred.getNextDueAt(), predictionState(pred, now, leadHours),
                    next == null ? null : next.getBookingCode(),
                    next == null ? null : next.getStartTime(),
                    next == null ? null : next.getStation().getName()));
        }
        return new FleetOverviewDto(fleet.getId(), fleet.getName(), fleetVehicles.size(), upcoming.size(), sessionCount,
                Math.round(energy * 10.0) / 10.0, spend.setScale(2, RoundingMode.HALF_UP), rows);
    }

    // ------------------------------------------------------------------ scheduler

    /** Greedy fleet scheduler. Read-only: returns a proposed plan, nothing is booked. */
    @Transactional(readOnly = true)
    public ScheduleResponse schedule(AuthUser actor, ScheduleRequest r) {
        if (!r.windowEnd().isAfter(r.windowStart())) {
            throw new BadRequestException("windowEnd must be after windowStart");
        }
        int socStart = r.socStart() == null ? DEFAULT_SOC_START : r.socStart();
        int socTarget = r.socTarget() == null ? DEFAULT_SOC_TARGET : r.socTarget();
        if (socTarget <= socStart) {
            throw new BadRequestException("socTarget must be higher than socStart");
        }
        Preset preset = r.preset() == null ? Preset.BALANCED : r.preset();
        final Integer maxPerStation = (r.maxPerStation() != null && r.maxPerStation() > 0) ? r.maxPerStation() : null;
        double[] origin = originOf(actor, r);

        // Load + authorise the vehicles, remember when each is predicted to be due.
        List<Vehicle> selected = new ArrayList<>();
        Map<Long, LocalDateTime> dueAt = new HashMap<>();
        for (Long id : r.vehicleIds().stream().distinct().collect(Collectors.toList())) {
            Vehicle v = requireFleetVehicle(actor, id);
            selected.add(v);
            predictions.findByVehicleId(v.getId()).ifPresent(p -> dueAt.put(v.getId(), p.getNextDueAt()));
        }
        // STEP 1 - urgency order: earliest predicted due first; no prediction = least urgent.
        selected.sort(Comparator.comparing((Vehicle v) -> dueAt.getOrDefault(v.getId(), LocalDateTime.MAX))
                .thenComparing(Vehicle::getId));

        Set<String> tentative = new HashSet<>();            // "pointId|slotStart" keys already planned
        Map<Long, Integer> perStation = new HashMap<>();    // stationId -> vehicles planned there
        List<ScheduleItem> plan = new ArrayList<>();
        List<Unassigned> unassigned = new ArrayList<>();

        for (int i = 0; i < selected.size(); i++) {
            Vehicle v = selected.get(i);
            String label = label(v);
            // Stations that already hold maxPerStation vehicles are excluded for this vehicle ("spread the fleet").
            Set<Long> excluded = new HashSet<>();
            if (maxPerStation != null) {
                for (Map.Entry<Long, Integer> e : perStation.entrySet()) {
                    if (e.getValue() >= maxPerStation) {
                        excluded.add(e.getKey());
                    }
                }
            }
            // notAfter limits the latest slot START. The exact "must finish before windowEnd" test is done below
            // on the real slotEnd of every candidate (duration depends on the point chosen).
            Constraints constraints = new Constraints(r.windowEnd().minusMinutes(30), new HashSet<>(tentative), excluded, null);
            RecommendationRequest req = new RecommendationRequest(origin[0], origin[1], v.getId(), null, r.windowStart(),
                    socStart, socTarget, preset, null, null, 10);
            RecommendationResponse resp;
            try {
                resp = recommendation.recommend(req, actor, constraints);
            } catch (RuntimeException ex) {
                unassigned.add(new Unassigned(v.getId(), label, "Could not be planned: " + ex.getMessage()));
                continue;
            }
            List<RecommendedItem> items = resp == null || resp.items() == null ? List.of() : resp.items();
            RecommendedItem chosen = null;
            for (RecommendedItem it : items) {
                if (!it.slotEnd().isAfter(r.windowEnd())) {
                    chosen = it;
                    break;
                }
            }
            if (chosen == null) {
                String why = items.isEmpty()
                        ? "No compatible station with a free slot inside the window"
                        : "Every free slot would finish after the window ends";
                if (!excluded.isEmpty()) {
                    why += " (stations already at the per-station limit were skipped)";
                }
                unassigned.add(new Unassigned(v.getId(), label, why));
                continue;
            }
            // STEP 2 - reserve every 30-minute slot of the chosen point so later vehicles cannot take it.
            for (LocalDateTime t = chosen.slotStart(); t.isBefore(chosen.slotEnd()); t = t.plusMinutes(30)) {
                tentative.add(RecommendationService.slotKey(chosen.point().pointId(), t));
            }
            perStation.merge(chosen.station().id(), 1, Integer::sum);
            plan.add(new ScheduleItem(v.getId(), label, chosen.station().id(), chosen.station().name(),
                    chosen.point().pointId(), chosen.point().label(), chosen.point().connectorCode(),
                    chosen.slotStart(), chosen.slotEnd(), socStart, socTarget, chosen.estimatedCost(),
                    chosen.waitMinutes(), reasonFor(i, selected.size(), dueAt.get(v.getId()), chosen)));
        }

        BigDecimal total = BigDecimal.ZERO;
        double waitSum = 0;
        Set<Long> stationIds = new HashSet<>();
        for (ScheduleItem it : plan) {
            total = total.add(it.estimatedCost());
            waitSum += it.waitMinutes();
            stationIds.add(it.stationId());
        }
        double avgWait = plan.isEmpty() ? 0 : Math.round(waitSum / plan.size() * 10.0) / 10.0;
        return new ScheduleResponse(plan, unassigned, total.setScale(2, RoundingMode.HALF_UP), avgWait, stationIds.size());
    }

    // ------------------------------------------------------------------ apply

    /**
     * Books every item of an accepted plan. Each item runs in its own REQUIRES_NEW transaction
     * (hold + confirm together): if the wallet is short or the slot was taken meanwhile, only that item is
     * rolled back and reported in {@code failures}. The method itself runs without an outer transaction.
     */
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public ApplyResponse apply(AuthUser actor, ApplyRequest r) {
        List<BookingDto> created = new ArrayList<>();
        List<ApplyFailure> failures = new ArrayList<>();
        for (ApplyItem item : r.items()) {
            try {
                BookingDto booking = perItemTx.execute(status -> applyOne(actor, item));
                created.add(booking);
            } catch (RuntimeException ex) {
                failures.add(new ApplyFailure(item.vehicleId(), ex.getMessage() == null ? ex.getClass().getSimpleName() : ex.getMessage()));
            }
        }
        return new ApplyResponse(created, failures);
    }

    /** Hold (source FLEET, 5 min) then pay from the manager's wallet - inside one transaction. */
    private BookingDto applyOne(AuthUser actor, ApplyItem item) {
        User manager = users.findById(actor.getId()).orElseThrow(() -> new ResourceNotFoundException("User", actor.getId()));
        Vehicle vehicle = requireFleetVehicle(actor, item.vehicleId());
        ChargingPoint point = points.findById(item.pointId())
                .orElseThrow(() -> new ResourceNotFoundException("Charging point", item.pointId()));
        Station station = point.getStation();
        BookingDto hold = bookingService.createHold(manager, vehicle, point, station, item.slotStart(),
                item.socStart(), item.socTarget(), BookingSource.FLEET, 5);
        return bookingService.confirm(actor, hold.id(), PaymentMethod.WALLET);
    }

    // ------------------------------------------------------------------ helpers

    private Long fleetIdOf(AuthUser actor) {
        if (actor.getFleetId() == null) {
            throw new BadRequestException("This account is not attached to a fleet");
        }
        return actor.getFleetId();
    }

    /** Fleet managers may only use their own fleet's vehicles; ADMIN may use any. */
    private Vehicle requireFleetVehicle(AuthUser actor, Long id) {
        Vehicle v = vehicles.findById(id).orElseThrow(() -> new ResourceNotFoundException("Vehicle", id));
        if (actor.isAdmin()) {
            return v;
        }
        Long vehicleFleet = v.getFleet() == null ? null : v.getFleet().getId();
        if (vehicleFleet == null || !vehicleFleet.equals(actor.getFleetId())) {
            throw new ForbiddenException("Vehicle " + id + " does not belong to your fleet");
        }
        return v;
    }

    private double[] originOf(AuthUser actor, ScheduleRequest r) {
        if (r.startLat() != null && r.startLon() != null) {
            return new double[]{r.startLat(), r.startLon()};
        }
        User u = users.findById(actor.getId()).orElse(null);
        if (u != null && u.getHomeLat() != null && u.getHomeLon() != null) {
            return new double[]{u.getHomeLat(), u.getHomeLon()};
        }
        return new double[]{DEFAULT_LAT, DEFAULT_LON};
    }

    private static String label(Vehicle v) {
        if (v.getNickname() != null && !v.getNickname().isBlank()) {
            return v.getNickname();
        }
        return v.getModel().getMake() + " " + v.getModel().getModel();
    }

    private static String reasonFor(int index, int total, LocalDateTime due, RecommendedItem item) {
        StringBuilder sb = new StringBuilder("Priority ").append(index + 1).append(" of ").append(total);
        if (due != null) {
            sb.append(" (next charge predicted ").append(DUE_FMT.format(due)).append(')');
        }
        List<String> reasons = item.reasons() == null ? List.of() : item.reasons();
        for (int k = 0; k < Math.min(2, reasons.size()); k++) {
            sb.append("; ").append(reasons.get(k));
        }
        return sb.toString();
    }

    private static String predictionState(RechargePrediction p, LocalDateTime now, int leadHours) {
        if (p == null) {
            return "NO_DATA";
        }
        if (now.isAfter(p.getNextDueAt())) {
            return "OVERDUE";
        }
        if (!now.isBefore(p.getNextDueAt().minusHours(leadHours))) {
            return "DUE_SOON";
        }
        return "UPCOMING";
    }
}
