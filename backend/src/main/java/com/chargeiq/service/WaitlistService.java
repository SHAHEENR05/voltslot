package com.chargeiq.service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import com.chargeiq.clock.AppClock;
import com.chargeiq.dto.BookingDtos.BookingDto;
import com.chargeiq.dto.BookingDtos.EstimateResponse;
import com.chargeiq.dto.WaitlistDtos.WaitlistDto;
import com.chargeiq.dto.WaitlistDtos.WaitlistRequest;
import com.chargeiq.dto.WaitlistDtos.WaitlistStationRef;
import com.chargeiq.entity.ChargingPoint;
import com.chargeiq.entity.Station;
import com.chargeiq.entity.User;
import com.chargeiq.entity.Vehicle;
import com.chargeiq.entity.WaitlistEntry;
import com.chargeiq.entity.enums.BookingSource;
import com.chargeiq.entity.enums.NotificationType;
import com.chargeiq.entity.enums.PointStatus;
import com.chargeiq.entity.enums.Role;
import com.chargeiq.entity.enums.StationStatus;
import com.chargeiq.entity.enums.WaitlistStatus;
import com.chargeiq.event.SlotsReleasedEvent;
import com.chargeiq.exception.BadRequestException;
import com.chargeiq.exception.ConflictException;
import com.chargeiq.exception.ForbiddenException;
import com.chargeiq.exception.ResourceNotFoundException;
import com.chargeiq.exception.SlotUnavailableException;
import com.chargeiq.repository.ChargingPointRepository;
import com.chargeiq.repository.StationRepository;
import com.chargeiq.repository.UserRepository;
import com.chargeiq.repository.VehicleRepository;
import com.chargeiq.repository.WaitlistRepository;
import com.chargeiq.security.AuthUser;
import com.chargeiq.service.EstimatorService.VehicleSpec;
import com.chargeiq.util.TimeUtil;

/**
 * Waiting list: "tell me when a slot at this station frees up".
 * <p>
 * When {@code BookingService} cancels a booking or lets a hold expire it publishes a {@link SlotsReleasedEvent}.
 * This service listens <b>after the cancelling transaction has committed</b> (so the slots are really free) and
 * promotes the first matching WAITING entry (first come, first served): it creates a HOLD with source WAITLIST
 * (10 minutes to pay) and sends a WAITLIST_PROMOTED notification.
 */
@Service
@Transactional
public class WaitlistService {

    private static final int HORIZON_DAYS = 14;
    /** The waitlist stores no charge levels, so a promoted hold assumes a typical 20% -> 80% session. */
    private static final int DEFAULT_SOC_START = 20;
    private static final int DEFAULT_SOC_TARGET = 80;

    private final WaitlistRepository repo;
    private final VehicleRepository vehicles;
    private final StationRepository stations;
    private final UserRepository users;
    private final ChargingPointRepository points;
    private final AvailabilityService availability;
    private final EstimatorService estimator;
    private final BookingService bookings;
    private final NotificationService notifications;
    private final AppClock clock;

    /** {@code @Lazy}: BookingService publishes events that this service consumes, so we break the bean cycle with a proxy. */
    public WaitlistService(WaitlistRepository repo, VehicleRepository vehicles, StationRepository stations,
                           UserRepository users, ChargingPointRepository points, AvailabilityService availability,
                           EstimatorService estimator, @Lazy BookingService bookings, NotificationService notifications,
                           AppClock clock) {
        this.repo = repo;
        this.vehicles = vehicles;
        this.stations = stations;
        this.users = users;
        this.points = points;
        this.availability = availability;
        this.estimator = estimator;
        this.bookings = bookings;
        this.notifications = notifications;
        this.clock = clock;
    }

    /** Puts the user on the waiting list for a time window at a station. */
    public WaitlistDto join(AuthUser actor, WaitlistRequest req) {
        Vehicle vehicle = vehicles.findById(req.vehicleId())
                .orElseThrow(() -> new ResourceNotFoundException("Vehicle", req.vehicleId()));
        if (!canUseVehicle(actor, vehicle)) {
            throw new ForbiddenException("This vehicle does not belong to you");
        }
        Station station = stations.findById(req.stationId())
                .orElseThrow(() -> new ResourceNotFoundException("Station", req.stationId()));
        if (station.getStatus() != StationStatus.ACTIVE) {
            throw new BadRequestException("This station is not active");
        }
        LocalDateTime now = clock.now();
        LocalDateTime start = req.desiredStart();
        if (!TimeUtil.onGrid(start)) {
            throw new BadRequestException("Desired start must be on a 30-minute boundary (:00 or :30)");
        }
        if (start.isBefore(TimeUtil.floorToSlot(now)) || start.isAfter(now.plusDays(HORIZON_DAYS))) {
            throw new BadRequestException("Desired start must be in the future and within " + HORIZON_DAYS + " days");
        }
        boolean duplicate = repo.findByUserIdOrderByCreatedAtDesc(actor.getId()).stream()
                .anyMatch(e -> e.getStatus() == WaitlistStatus.WAITING
                        && e.getVehicle().getId().equals(vehicle.getId())
                        && e.getStation().getId().equals(station.getId())
                        && e.getDesiredStart().equals(start));
        if (duplicate) {
            throw new ConflictException("You are already on the waiting list for this time");
        }
        User user = users.findById(actor.getId())
                .orElseThrow(() -> new ResourceNotFoundException("User", actor.getId()));

        WaitlistEntry e = new WaitlistEntry();
        e.setUser(user);
        e.setVehicle(vehicle);
        e.setStation(station);
        e.setDesiredStart(start);
        e.setSlots(req.slots());
        e.setStatus(WaitlistStatus.WAITING);
        e.setCreatedAt(now);
        return toDto(repo.save(e));
    }

    /** The caller's waiting-list entries, newest first. */
    @Transactional(readOnly = true)
    public List<WaitlistDto> mine(AuthUser actor) {
        return repo.findByUserIdOrderByCreatedAtDesc(actor.getId()).stream().map(WaitlistService::toDto).toList();
    }

    /** Leaves the waiting list (the row is kept with status CANCELLED so the history stays complete). */
    public void cancel(AuthUser actor, Long id) {
        WaitlistEntry e = repo.findById(id).orElseThrow(() -> new ResourceNotFoundException("Waitlist entry", id));
        if (!e.getUser().getId().equals(actor.getId()) && actor.getRole() != Role.ADMIN) {
            throw new ForbiddenException("This waiting-list entry belongs to another user");
        }
        if (e.getStatus() != WaitlistStatus.WAITING) {
            throw new ConflictException("Only a WAITING entry can be cancelled (current status: " + e.getStatus() + ")");
        }
        e.setStatus(WaitlistStatus.CANCELLED);
        repo.save(e);
    }

    /**
     * Reacts to freed slots. AFTER_COMMIT: the cancellation is already visible in the database.
     * REQUIRES_NEW: the original transaction is finished, so this work needs a transaction of its own.
     * Only the first entry that really fits is promoted.
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onSlotsReleased(SlotsReleasedEvent e) {
        LocalDateTime now = clock.now();
        List<WaitlistEntry> waiting = repo.findByStationIdAndStatusOrderByCreatedAtAsc(e.stationId(), WaitlistStatus.WAITING);
        for (WaitlistEntry w : waiting) {
            LocalDateTime wantStart = w.getDesiredStart();
            LocalDateTime wantEnd = wantStart.plusMinutes((long) w.getSlots() * TimeUtil.SLOT_MINUTES);
            boolean overlaps = wantStart.isBefore(e.to()) && wantEnd.isAfter(e.from());
            if (!overlaps || wantStart.isBefore(TimeUtil.floorToSlot(now))) {
                continue;
            }
            Optional<ChargingPoint> point = findFreePoint(w);
            if (point.isEmpty()) {
                continue;   // vehicle incompatible, or the window is still not completely free
            }
            try {
                BookingDto hold = bookings.createHold(w.getUser(), w.getVehicle(), point.get(), w.getStation(),
                        wantStart, DEFAULT_SOC_START, DEFAULT_SOC_TARGET, BookingSource.WAITLIST, 10);
                w.setStatus(WaitlistStatus.PROMOTED);
                w.setPromotedBookingId(hold.id());
                repo.save(w);
                notifications.create(w.getUser(), NotificationType.WAITLIST_PROMOTED, "A slot is available for you!",
                        "A slot opened at " + w.getStation().getName() + " at " + wantStart.toLocalTime()
                                + ". It is held for you for 10 minutes - confirm and pay to keep it.",
                        "{\"bookingId\":" + hold.id() + "}");
                return;   // one released window promotes one person
            } catch (SlotUnavailableException | BadRequestException | ConflictException ex) {
                // e.g. somebody booked it in the meantime, or the user hit a booking limit: try the next entry
            }
        }
    }

    /** WAITING entries whose desired start has passed can no longer be served: mark them EXPIRED. */
    public int expireOld() {
        List<WaitlistEntry> old = repo.findByStatusAndDesiredStartBefore(WaitlistStatus.WAITING, clock.now());
        for (WaitlistEntry w : old) {
            w.setStatus(WaitlistStatus.EXPIRED);
            repo.save(w);
        }
        return old.size();
    }

    // ------------------------------------------------------------------ helpers

    /** An ACTIVE compatible point of the station whose whole desired window is free (best accepted kW first). */
    private Optional<ChargingPoint> findFreePoint(WaitlistEntry w) {
        Station station = w.getStation();
        VehicleSpec spec = EstimatorService.specOf(w.getVehicle().getModel());
        List<ChargingPoint> compatible = points.findByStationIdOrderByIdAsc(station.getId()).stream()
                .filter(p -> p.getStatus() == PointStatus.ACTIVE && estimator.compatible(spec, p))
                .sorted((a, b) -> Double.compare(estimator.acceptedKw(spec, b), estimator.acceptedKw(spec, a)))
                .toList();
        if (compatible.isEmpty()) {
            return Optional.empty();
        }
        LocalDateTime start = w.getDesiredStart();
        List<Long> ids = compatible.stream().map(ChargingPoint::getId).toList();
        for (ChargingPoint p : compatible) {
            EstimateResponse est = estimator.estimate(spec, p, start, DEFAULT_SOC_START, DEFAULT_SOC_TARGET);
            int n = Math.max(est.slots(), w.getSlots());
            Map<Long, Set<LocalDateTime>> occ = availability.occupiedSlots(ids, start,
                    start.plusMinutes((long) n * TimeUtil.SLOT_MINUTES));
            if (availability.withinOpeningHours(station, start, est.slots())
                    && availability.isFree(occ.getOrDefault(p.getId(), Set.of()), start, est.slots())) {
                return Optional.of(p);
            }
        }
        return Optional.empty();
    }

    private static boolean canUseVehicle(AuthUser actor, Vehicle v) {
        if (actor.getRole() == Role.ADMIN || v.getUser().getId().equals(actor.getId())) {
            return true;
        }
        return actor.getRole() == Role.FLEET_MANAGER && actor.getFleetId() != null && v.getFleet() != null
                && actor.getFleetId().equals(v.getFleet().getId());
    }

    private static String vehicleLabel(Vehicle v) {
        if (v.getNickname() != null && !v.getNickname().isBlank()) {
            return v.getNickname();
        }
        return v.getModel().getMake() + " " + v.getModel().getModel();
    }

    private static WaitlistDto toDto(WaitlistEntry e) {
        return new WaitlistDto(e.getId(), new WaitlistStationRef(e.getStation().getId(), e.getStation().getName()),
                vehicleLabel(e.getVehicle()), e.getDesiredStart(), e.getSlots(), e.getStatus(),
                e.getPromotedBookingId(), e.getCreatedAt());
    }
}
