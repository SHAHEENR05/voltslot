package com.chargeiq.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.NoTransactionException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;

import com.chargeiq.clock.AppClock;
import com.chargeiq.dto.BookingDtos.Alternatives;
import com.chargeiq.dto.BookingDtos.BookingDto;
import com.chargeiq.dto.BookingDtos.BookingPointRef;
import com.chargeiq.dto.BookingDtos.CreateBookingRequest;
import com.chargeiq.dto.BookingDtos.EstimateRequest;
import com.chargeiq.dto.BookingDtos.EstimateResponse;
import com.chargeiq.dto.BookingDtos.InvoiceDto;
import com.chargeiq.dto.BookingDtos.PaymentDto;
import com.chargeiq.dto.BookingDtos.SessionDto;
import com.chargeiq.dto.BookingDtos.SlotOption;
import com.chargeiq.dto.BookingDtos.StationRef;
import com.chargeiq.dto.BookingDtos.VehicleRef;
import com.chargeiq.dto.CommonDtos.PageResponse;
import com.chargeiq.dto.RecommendationDtos.RecommendationRequest;
import com.chargeiq.dto.RecommendationDtos.RecommendationResponse;
import com.chargeiq.dto.RecommendationDtos.RecommendedItem;
import com.chargeiq.entity.Booking;
import com.chargeiq.entity.BookingSlot;
import com.chargeiq.entity.ChargingPoint;
import com.chargeiq.entity.ChargingSession;
import com.chargeiq.entity.Payment;
import com.chargeiq.entity.Station;
import com.chargeiq.entity.User;
import com.chargeiq.entity.Vehicle;
import com.chargeiq.entity.enums.BookingSource;
import com.chargeiq.entity.enums.BookingStatus;
import com.chargeiq.entity.enums.NotificationType;
import com.chargeiq.entity.enums.PaymentMethod;
import com.chargeiq.entity.enums.PaymentStatus;
import com.chargeiq.entity.enums.PointStatus;
import com.chargeiq.entity.enums.Role;
import com.chargeiq.entity.enums.StationStatus;
import com.chargeiq.entity.enums.WalletTxnType;
import com.chargeiq.event.SlotsReleasedEvent;
import com.chargeiq.exception.BadRequestException;
import com.chargeiq.exception.ConflictException;
import com.chargeiq.exception.ForbiddenException;
import com.chargeiq.exception.ResourceNotFoundException;
import com.chargeiq.exception.SlotUnavailableException;
import com.chargeiq.repository.BookingRepository;
import com.chargeiq.repository.BookingSlotRepository;
import com.chargeiq.repository.ChargingPointRepository;
import com.chargeiq.repository.ChargingSessionRepository;
import com.chargeiq.repository.PaymentRepository;
import com.chargeiq.repository.StationRepository;
import com.chargeiq.repository.UserRepository;
import com.chargeiq.repository.VehicleRepository;
import com.chargeiq.security.AuthUser;
import com.chargeiq.service.EstimatorService.VehicleSpec;
import com.chargeiq.util.CodeGenerator;
import com.chargeiq.util.TimeUtil;

/**
 * The booking engine: the heart of VoltSlot.
 *
 * <h3>Life-cycle</h3>
 * {@code HOLD} (5 min) &rarr; {@code CONFIRMED} (paid) &rarr; {@code CHECKED_IN} &rarr; {@code COMPLETED};
 * or {@code CANCELLED}, {@code EXPIRED} (hold not paid in time) and {@code NO_SHOW}.
 *
 * <h3>Why double bookings cannot happen (explain this in the viva)</h3>
 * <ol>
 *   <li><b>Pessimistic lock</b> - before looking at the free slots we lock the charging-point row with
 *       {@code SELECT ... FOR UPDATE} ({@link ChargingPointRepository#lockByIds}). Two users who want the same
 *       point are therefore processed one after the other.</li>
 *   <li><b>Slot table</b> - every booking owns one row per 30-minute slot in {@code booking_slots}.</li>
 *   <li><b>Unique constraint as a safety net</b> - {@code UNIQUE(charging_point_id, slot_start)} makes the database
 *       itself refuse a second booking of the same slot. MySQL's REPEATABLE READ may show us a slightly old
 *       snapshot of {@code booking_slots} after we got the lock, so the insert can still collide; we translate
 *       the resulting {@link DataIntegrityViolationException} into the same HTTP 409 answer.</li>
 * </ol>
 *
 * <h3>Refund policy</h3>
 * Cancel at least 60 minutes before the start: 100 % refund. Later: 50 %. A no-show keeps 25 % as penalty and
 * refunds the remaining 75 %.
 */
@Service
@Transactional
public class BookingService {

    /** Minutes a freshly created HOLD stays valid (the user must pay within this time). */
    static final int HOLD_MINUTES = 5;
    static final int WAITLIST_HOLD_MINUTES = 10;
    static final int MAX_ACTIVE_FUTURE_BOOKINGS = 5;
    static final int HORIZON_DAYS = 14;
    /** Cancelling at least this many minutes before the start gives a full refund. */
    static final int FULL_REFUND_MINUTES = 60;
    static final BigDecimal LATE_CANCEL_REFUND_RATE = new BigDecimal("0.50");
    static final BigDecimal NO_SHOW_PENALTY_RATE = new BigDecimal("0.25");
    /** Check-in is possible from 15 minutes before to 15 minutes after the start. */
    static final int CHECK_IN_WINDOW_MINUTES = 15;
    private static final int ALTERNATIVE_WINDOW_HOURS = 3;
    private static final int MAX_SAME_STATION_ALTERNATIVES = 6;
    private static final int MAX_OTHER_STATION_ALTERNATIVES = 3;

    private final BookingRepository bookings;
    private final BookingSlotRepository slots;
    private final ChargingPointRepository points;
    private final ChargingSessionRepository sessions;
    private final PaymentRepository payments;
    private final VehicleRepository vehicles;
    private final UserRepository users;
    private final StationRepository stations;
    private final EstimatorService estimator;
    private final AvailabilityService availability;
    private final RecommendationService recommendation;
    private final WalletService wallets;
    private final NotificationService notifications;
    private final RechargePredictionService predictions;
    private final ApplicationEventPublisher events;
    private final AppClock clock;

    public BookingService(BookingRepository bookings, BookingSlotRepository slots, ChargingPointRepository points,
                          ChargingSessionRepository sessions, PaymentRepository payments, VehicleRepository vehicles,
                          UserRepository users, StationRepository stations, EstimatorService estimator,
                          AvailabilityService availability, RecommendationService recommendation,
                          WalletService wallets, NotificationService notifications,
                          RechargePredictionService predictions, ApplicationEventPublisher events, AppClock clock) {
        this.bookings = bookings;
        this.slots = slots;
        this.points = points;
        this.sessions = sessions;
        this.payments = payments;
        this.vehicles = vehicles;
        this.users = users;
        this.stations = stations;
        this.estimator = estimator;
        this.availability = availability;
        this.recommendation = recommendation;
        this.wallets = wallets;
        this.notifications = notifications;
        this.predictions = predictions;
        this.events = events;
        this.clock = clock;
    }

    // =====================================================================================
    //  Estimate
    // =====================================================================================

    /** Pure calculation (energy, duration, slots, cost, CO2) for a vehicle on a point - nothing is stored. */
    @Transactional(readOnly = true)
    public EstimateResponse estimate(AuthUser actor, EstimateRequest req) {
        Vehicle vehicle = requireVehicle(actor, req.vehicleId());
        ChargingPoint point = points.findById(req.chargingPointId())
                .orElseThrow(() -> new ResourceNotFoundException("Charging point", req.chargingPointId()));
        if (req.socTarget() <= req.socStart()) {
            throw new BadRequestException("Target charge must be higher than the current charge");
        }
        VehicleSpec spec = EstimatorService.specOf(vehicle.getModel());
        if (!estimator.compatible(spec, point)) {
            throw new BadRequestException("This vehicle cannot charge on connector " + point.getConnectorType().getCode());
        }
        return estimator.estimate(spec, point, req.startTime(), req.socStart(), req.socTarget());
    }

    // =====================================================================================
    //  Create HOLD
    // =====================================================================================

    /**
     * REST entry point: resolves vehicle / point / station from the request and the logged-in user, then
     * delegates to the internal overload that holds all the rules.
     * <p>
     * {@code noRollbackFor}: the business rejections below are thrown <i>before</i> anything is written, so they
     * must not mark a calling transaction (waitlist, fleet scheduler) as rollback-only.
     */
    @Transactional(noRollbackFor = {BadRequestException.class, ConflictException.class, SlotUnavailableException.class})
    public BookingDto createHold(AuthUser actor, CreateBookingRequest req) {
        Vehicle vehicle = requireVehicle(actor, req.vehicleId());
        User owner = users.findById(actor.getId())
                .orElseThrow(() -> new ResourceNotFoundException("User", actor.getId()));

        ChargingPoint point = null;
        Station station;
        if (req.chargingPointId() != null) {
            point = points.findById(req.chargingPointId())
                    .orElseThrow(() -> new ResourceNotFoundException("Charging point", req.chargingPointId()));
            station = point.getStation();
            if (req.stationId() != null && !req.stationId().equals(station.getId())) {
                throw new BadRequestException("The charging point does not belong to the given station");
            }
        } else if (req.stationId() != null) {
            station = stations.findById(req.stationId())
                    .orElseThrow(() -> new ResourceNotFoundException("Station", req.stationId()));
        } else {
            throw new BadRequestException("Either chargingPointId or stationId is required");
        }
        BookingSource source = req.source() == null ? BookingSource.WEB : req.source();
        int holdMinutes = source == BookingSource.WAITLIST ? WAITLIST_HOLD_MINUTES : HOLD_MINUTES;
        return createHold(owner, vehicle, point, station, req.startTime(), req.socStart(), req.socTarget(), source,
                holdMinutes);
    }

    /**
     * Internal entry used by the waitlist, reminders, fleet scheduler and trip planner (no {@link AuthUser}).
     * Applies all validations, locks the candidate points, checks the slots and stores booking + slots.
     *
     * @param pointOrNull a concrete point, or {@code null} to auto-assign the best free compatible point
     *                    (highest accepted kW first, then lowest tariff)
     * @throws SlotUnavailableException (409) when the slots are taken; carries {@link Alternatives}
     */
    @Transactional(noRollbackFor = {BadRequestException.class, ConflictException.class, SlotUnavailableException.class})
    public BookingDto createHold(User owner, Vehicle vehicle, ChargingPoint pointOrNull, Station station,
                                 LocalDateTime start, int socStart, int socTarget, BookingSource source,
                                 int holdMinutes) {
        LocalDateTime now = clock.now();

        // ---- 1. cheap validations (no database writes, no locks) ----
        if (station.getStatus() != StationStatus.ACTIVE) {
            throw new BadRequestException("This station is not active");
        }
        if (!TimeUtil.onGrid(start)) {
            throw new BadRequestException("Start time must be on a 30-minute boundary (:00 or :30)");
        }
        // the slot that contains "now" is still bookable, anything earlier is the past
        if (start.isBefore(TimeUtil.floorToSlot(now))) {
            throw new BadRequestException("Start time is in the past");
        }
        if (start.isAfter(now.plusDays(HORIZON_DAYS))) {
            throw new BadRequestException("Bookings can be made at most " + HORIZON_DAYS + " days ahead");
        }
        if (socTarget <= socStart) {
            throw new BadRequestException("Target charge must be higher than the current charge");
        }

        VehicleSpec spec = EstimatorService.specOf(vehicle.getModel());
        List<ChargingPoint> candidates = candidatePoints(station, pointOrNull, spec);

        // duration (slots) depends on the point's power, so estimate for every candidate
        Map<Long, EstimateResponse> estimates = new LinkedHashMap<>();
        for (ChargingPoint p : candidates) {
            estimates.put(p.getId(), estimator.estimate(spec, p, start, socStart, socTarget));
        }
        EstimateResponse first = estimates.get(candidates.get(0).getId());

        boolean insideHours = candidates.stream()
                .anyMatch(p -> availability.withinOpeningHours(station, start, estimates.get(p.getId()).slots()));
        if (!insideHours) {
            throw new BadRequestException("The session does not fit into the opening hours of " + station.getName()
                    + " (" + station.getOpenHour() + ":00 - " + station.getCloseHour() + ":00)");
        }

        // the same vehicle cannot be in two places at once
        LocalDateTime firstEnd = start.plusMinutes((long) first.slots() * TimeUtil.SLOT_MINUTES);
        if (bookings.countVehicleOverlaps(vehicle.getId(), BookingStatus.LIVE, start, firstEnd) > 0) {
            throw new ConflictException("This vehicle already has a booking that overlaps this time");
        }
        // fleet managers book for many vehicles, so the limit applies to private users only
        if (owner.getRole() != Role.FLEET_MANAGER && bookings.countByUserIdAndStatusInAndStartTimeGreaterThan(
                owner.getId(), BookingStatus.LIVE, now) >= MAX_ACTIVE_FUTURE_BOOKINGS) {
            throw new BadRequestException("You already have " + MAX_ACTIVE_FUTURE_BOOKINGS
                    + " active upcoming bookings. Complete or cancel one first.");
        }

        // ---- 2. LOCK the candidate points (ascending id => no dead-locks) ----
        List<Long> ids = candidates.stream().map(ChargingPoint::getId).toList();
        points.lockByIds(ids);

        // ---- 3. look at booking_slots while holding the lock ----
        int maxSlots = estimates.values().stream().mapToInt(EstimateResponse::slots).max().orElse(first.slots());
        LocalDateTime windowEnd = start.plusMinutes((long) maxSlots * TimeUtil.SLOT_MINUTES);
        Map<Long, Set<LocalDateTime>> occupied = availability.occupiedSlots(ids, start, windowEnd);

        ChargingPoint chosen = null;
        for (ChargingPoint p : candidates) {                       // candidates are already in preference order
            int n = estimates.get(p.getId()).slots();
            Set<LocalDateTime> taken = occupied.getOrDefault(p.getId(), Set.of());
            if (availability.withinOpeningHours(station, start, n) && availability.isFree(taken, start, n)) {
                chosen = p;
                break;
            }
        }
        if (chosen == null) {
            throw new SlotUnavailableException("This slot is no longer available",
                    buildAlternatives(owner, vehicle, spec, station, start, socStart, socTarget));
        }

        // ---- 4. insert booking + one row per slot ----
        EstimateResponse est = estimates.get(chosen.getId());
        int n = est.slots();
        Booking b = new Booking();
        b.setBookingCode(newBookingCode());
        b.setUser(owner);
        b.setVehicle(vehicle);
        b.setChargingPoint(chosen);
        b.setStation(station);
        b.setStartTime(start);
        b.setEndTime(start.plusMinutes((long) n * TimeUtil.SLOT_MINUTES));
        b.setSlots(n);
        b.setStatus(BookingStatus.HOLD);
        b.setSource(source == null ? BookingSource.WEB : source);
        b.setSocStart(socStart);
        b.setSocTarget(socTarget);
        b.setEstEnergyKwh(est.energyKwh());
        b.setEstCost(est.estimatedCost());
        b.setCreatedAt(now);
        b.setHoldExpiresAt(now.plusMinutes(holdMinutes));

        try {
            b = bookings.save(b);
            List<BookingSlot> rows = new ArrayList<>();
            for (int i = 0; i < n; i++) {
                BookingSlot row = new BookingSlot();
                row.setChargingPoint(chosen);
                row.setSlotStart(start.plusMinutes((long) i * TimeUtil.SLOT_MINUTES));
                row.setBooking(b);
                rows.add(row);
            }
            slots.saveAll(rows);
            slots.flush();   // force the INSERTs now so the UNIQUE(point, slot) check happens inside this try block
        } catch (DataIntegrityViolationException ex) {
            // Safety net: somebody else committed the same slot after our snapshot was taken.
            rollbackOnly();
            Alternatives alt = safeAlternatives(owner, vehicle, spec, station, start, socStart, socTarget);
            // our snapshot is stale (that is why we got here), so the contested slot may still look free: drop it
            LocalDateTime contestedEnd = start.plusMinutes((long) n * TimeUtil.SLOT_MINUTES);
            Long contestedPoint = chosen.getId();
            List<SlotOption> filtered = alt.sameStation().stream()
                    .filter(o -> !(o.pointId().equals(contestedPoint) && o.start().isBefore(contestedEnd)
                            && o.start().plusMinutes(TimeUtil.SLOT_MINUTES).isAfter(start)))
                    .collect(Collectors.toList());
            throw new SlotUnavailableException("This slot has just been booked by someone else",
                    new Alternatives(filtered, alt.otherStations()));
        }
        return toDto(b);
    }

    // =====================================================================================
    //  Confirm (payment)
    // =====================================================================================

    /** Pays for a HOLD. WALLET debits the wallet; UPI / CARD are simulated as always successful. */
    public BookingDto confirm(AuthUser actor, Long bookingId, PaymentMethod method) {
        Booking b = requireBooking(actor, bookingId);
        LocalDateTime now = clock.now();
        if (b.getStatus() != BookingStatus.HOLD) {
            throw new ConflictException("Only a booking on HOLD can be confirmed (current status: " + b.getStatus() + ")");
        }
        if (b.getHoldExpiresAt() != null && !b.getHoldExpiresAt().isAfter(now)) {
            throw new ConflictException("The hold has expired. Please create the booking again.");
        }
        BigDecimal amount = b.getEstCost().setScale(2, RoundingMode.HALF_UP);
        if (method == PaymentMethod.WALLET) {
            wallets.debit(b.getUser().getId(), amount, "BOOKING " + b.getBookingCode());   // throws 402 if too low
        }
        Payment pay = new Payment();
        pay.setBooking(b);
        pay.setAmount(amount);
        pay.setMethod(method);
        pay.setStatus(PaymentStatus.PAID);
        pay.setInvoiceNo("PENDING-" + b.getBookingCode());   // placeholder: the real number needs the generated id
        pay.setRefundedAmount(BigDecimal.ZERO.setScale(2));
        pay.setPaidAt(now);
        pay = payments.save(pay);                             // IDENTITY id is available right after save
        pay.setInvoiceNo(invoiceNumber(pay.getId()));
        payments.save(pay);

        b.setStatus(BookingStatus.CONFIRMED);
        b.setHoldExpiresAt(null);
        bookings.save(b);

        notifications.create(b.getUser(), NotificationType.BOOKING_CONFIRMED, "Booking confirmed",
                "Your slot at " + b.getStation().getName() + " on " + b.getStartTime().toLocalDate() + " at "
                        + b.getStartTime().toLocalTime() + " is confirmed. Paid " + rupees(amount) + " ("
                        + method + "). Invoice " + pay.getInvoiceNo() + ".", bookingPayload(b));
        return toDto(b, Optional.of(pay), Optional.empty());
    }

    // =====================================================================================
    //  Cancel + refund policy
    // =====================================================================================

    /** Cancels a HOLD or CONFIRMED booking, refunds according to the 60-minute rule and frees the slots. */
    public BookingDto cancel(AuthUser actor, Long bookingId, String reason) {
        Booking b = requireBooking(actor, bookingId);
        if (b.getStatus() != BookingStatus.HOLD && b.getStatus() != BookingStatus.CONFIRMED) {
            throw new ConflictException("Only HOLD or CONFIRMED bookings can be cancelled (current status: "
                    + b.getStatus() + ")");
        }
        LocalDateTime now = clock.now();
        Optional<Payment> payOpt = payments.findByBookingId(b.getId());
        BigDecimal refund = refundIfCancelled(b, now);

        if (payOpt.isPresent() && payOpt.get().getStatus() == PaymentStatus.PAID) {
            Payment pay = payOpt.get();
            if (refund.signum() > 0 && pay.getMethod() == PaymentMethod.WALLET) {
                wallets.credit(b.getUser().getId(), refund, WalletTxnType.REFUND, "REFUND " + b.getBookingCode());
            }
            // for UPI / CARD (simulated) only the refunded amount is recorded
            pay.setRefundedAmount(refund);
            pay.setStatus(refund.compareTo(pay.getAmount()) >= 0 ? PaymentStatus.REFUNDED : PaymentStatus.PART_REFUND);
            payments.save(pay);
        }

        releaseSlots(b);
        b.setStatus(BookingStatus.CANCELLED);
        b.setCancelledAt(now);
        b.setCancelReason(cut(reason == null || reason.isBlank() ? "Cancelled by user" : reason.trim(), 100));
        bookings.save(b);

        notifications.create(b.getUser(), NotificationType.BOOKING_CANCELLED, "Booking cancelled",
                "Booking " + b.getBookingCode() + " at " + b.getStation().getName() + " was cancelled."
                        + (refund.signum() > 0 ? " Refund: " + rupees(refund) + "." : ""), bookingPayload(b));
        return toDto(b);
    }

    /**
     * Refund the user would get if the booking were cancelled at {@code now}:
     * 100 % when at least 60 minutes remain before the start, otherwise 50 %, of the amount actually PAID.
     * A booking that has not been paid yet (HOLD) refunds 0.
     */
    @Transactional(readOnly = true)
    public BigDecimal refundIfCancelled(Booking b, LocalDateTime now) {
        BigDecimal paid = payments.findByBookingId(b.getId())
                .filter(p -> p.getStatus() == PaymentStatus.PAID)
                .map(Payment::getAmount)
                .orElse(BigDecimal.ZERO);
        return refundFor(paid, b.getStartTime(), now);
    }

    /** The refund rule itself (pure function, easy to unit-test). */
    static BigDecimal refundFor(BigDecimal paid, LocalDateTime start, LocalDateTime now) {
        boolean early = !now.plusMinutes(FULL_REFUND_MINUTES).isAfter(start);   // start - now >= 60 min
        BigDecimal rate = early ? BigDecimal.ONE : LATE_CANCEL_REFUND_RATE;
        return paid.multiply(rate).setScale(2, RoundingMode.HALF_UP);
    }

    // =====================================================================================
    //  Check-in / complete
    // =====================================================================================

    /** Arrival at the station: allowed from 15 minutes before to 15 minutes after the start time. */
    public BookingDto checkIn(AuthUser actor, Long bookingId) {
        Booking b = requireBooking(actor, bookingId);
        LocalDateTime now = clock.now();
        if (b.getStatus() != BookingStatus.CONFIRMED) {
            throw new ConflictException("Only a CONFIRMED booking can be checked in (current status: " + b.getStatus() + ")");
        }
        if (!inCheckInWindow(b, now)) {
            throw new BadRequestException("Check-in is possible from " + CHECK_IN_WINDOW_MINUTES
                    + " minutes before until " + CHECK_IN_WINDOW_MINUTES + " minutes after the start time ("
                    + b.getStartTime() + ")");
        }
        b.setStatus(BookingStatus.CHECKED_IN);
        b.setCheckedInAt(now);
        bookings.save(b);
        return toDto(b);
    }

    /** Simulated end of the charge (the real charger would report it). Only a CHECKED_IN booking can complete. */
    public BookingDto complete(AuthUser actor, Long bookingId, Integer socEndOrNull) {
        Booking b = requireBooking(actor, bookingId);
        if (b.getStatus() != BookingStatus.CHECKED_IN) {
            throw new ConflictException("Only a CHECKED_IN booking can be completed (current status: " + b.getStatus() + ")");
        }
        return completeBooking(b, socEndOrNull);
    }

    /**
     * Shared by the REST call and the auto-complete job: recomputes energy with the estimator, stores the
     * charging session, settles the payment (refunds the difference if it became cheaper), notifies the user and
     * refreshes the recharge prediction of the vehicle.
     */
    private BookingDto completeBooking(Booking b, Integer socEndOrNull) {
        int socEnd = socEndOrNull != null ? socEndOrNull : b.getSocTarget();
        if (socEnd <= b.getSocStart()) {
            throw new BadRequestException("Final charge must be higher than the starting charge (" + b.getSocStart() + "%)");
        }
        VehicleSpec spec = EstimatorService.specOf(b.getVehicle().getModel());
        ChargingPoint point = b.getChargingPoint();
        EstimateResponse est = estimator.estimate(spec, point, b.getStartTime(), b.getSocStart(), socEnd);

        LocalDateTime startedAt = b.getCheckedInAt() != null ? b.getCheckedInAt() : b.getStartTime();
        ChargingSession cs = new ChargingSession();
        cs.setBooking(b);
        cs.setStartedAt(startedAt);
        cs.setEndedAt(startedAt.plusMinutes(est.durationMinutes()));
        cs.setEnergyKwh(est.energyKwh());
        cs.setSocStart(b.getSocStart());
        cs.setSocEnd(socEnd);
        cs.setAvgKw(est.durationMinutes() > 0 ? est.energyKwh() / (est.durationMinutes() / 60.0) : est.acceptedKw());
        cs.setTariff(est.effectiveTariff());
        cs.setAmount(est.estimatedCost());
        cs.setCo2AvoidedKg(est.co2AvoidedKg());
        cs = sessions.save(cs);

        // Settlement: the customer only pays for what was really delivered.
        Optional<Payment> payOpt = payments.findByBookingId(b.getId());
        if (payOpt.isPresent()) {
            Payment pay = payOpt.get();
            BigDecimal paid = pay.getAmount();
            BigDecimal finalAmount = est.estimatedCost();
            if (finalAmount.compareTo(paid) < 0) {
                BigDecimal diff = paid.subtract(finalAmount);
                if (pay.getMethod() == PaymentMethod.WALLET) {
                    wallets.credit(b.getUser().getId(), diff, WalletTxnType.REFUND, "REFUND " + b.getBookingCode() + " (final bill)");
                }
                pay.setAmount(finalAmount);        // final bill; the difference went back to the payer
                payments.save(pay);
            }
        }

        b.setStatus(BookingStatus.COMPLETED);
        bookings.save(b);

        notifications.create(b.getUser(), NotificationType.CHARGE_COMPLETE, "Charging complete",
                String.format("You charged %.1f kWh at %s (%d%% to %d%%). CO2 avoided: %.1f kg. Bill: %s.",
                        est.energyKwh(), b.getStation().getName(), b.getSocStart(), socEnd, est.co2AvoidedKg(),
                        rupees(est.estimatedCost())), bookingPayload(b));
        predictions.recompute(b.getVehicle());
        return toDto(b, payOpt, Optional.of(cs));
    }

    // =====================================================================================
    //  Queries
    // =====================================================================================

    @Transactional(readOnly = true)
    public BookingDto get(AuthUser actor, Long bookingId) {
        return toDto(requireBooking(actor, bookingId));
    }

    /**
     * The caller's bookings, newest first.
     *
     * @param statusOrNull  optional status filter (e.g. CONFIRMED)
     * @param upcomingOrNull {@code true}: upcoming / in-progress only (soonest first); {@code false}: past only
     */
    @Transactional(readOnly = true)
    public PageResponse<BookingDto> list(AuthUser actor, String statusOrNull, Boolean upcomingOrNull, int page, int size) {
        LocalDateTime now = clock.now();
        int p = Math.max(0, page);
        int s = Math.min(Math.max(1, size), 100);
        List<BookingStatus> statuses = null;
        if (statusOrNull != null && !statusOrNull.isBlank()) {
            try {
                statuses = List.of(BookingStatus.valueOf(statusOrNull.trim().toUpperCase()));
            } catch (IllegalArgumentException ex) {
                throw new BadRequestException("Unknown booking status: " + statusOrNull);
            }
        }
        Long uid = actor.getId();
        Page<Booking> result;
        if (Boolean.TRUE.equals(upcomingOrNull)) {
            Pageable pr = PageRequest.of(p, s, Sort.by(Sort.Direction.ASC, "startTime"));
            // started up to 3 h ago still counts: it keeps a session that is in progress visible
            result = bookings.findByUserIdAndStartTimeGreaterThanEqualAndStatusIn(uid, now.minusHours(3),
                    statuses == null ? BookingStatus.LIVE : statuses, pr);
        } else {
            Pageable pr = PageRequest.of(p, s, Sort.by(Sort.Direction.DESC, "startTime"));
            if (Boolean.FALSE.equals(upcomingOrNull)) {
                result = statuses == null
                        ? bookings.findByUserIdAndStartTimeLessThan(uid, now, pr)
                        : bookings.findByUserIdAndStatusInAndStartTimeLessThan(uid, statuses, now, pr);
            } else {
                result = statuses == null
                        ? bookings.findByUserId(uid, pr)
                        : bookings.findByUserIdAndStatusIn(uid, statuses, pr);
            }
        }

        // two bulk queries instead of 2 x N lookups
        List<Long> ids = result.getContent().stream().map(Booking::getId).toList();
        Map<Long, Payment> payByBooking = new HashMap<>();
        Map<Long, ChargingSession> sessionByBooking = new HashMap<>();
        if (!ids.isEmpty()) {
            payments.findByBookingIdIn(ids).forEach(x -> payByBooking.put(x.getBooking().getId(), x));
            sessions.findByBookingIds(ids).forEach(x -> sessionByBooking.put(x.getBooking().getId(), x));
        }
        List<BookingDto> content = result.getContent().stream()
                .map(b -> toDto(b, Optional.ofNullable(payByBooking.get(b.getId())),
                        Optional.ofNullable(sessionByBooking.get(b.getId()))))
                .toList();
        return new PageResponse<>(content, result.getNumber(), result.getSize(), result.getTotalElements(),
                result.getTotalPages());
    }

    /** Tax-invoice style summary of the payment of a booking. */
    @Transactional(readOnly = true)
    public InvoiceDto invoice(AuthUser actor, Long bookingId) {
        Booking b = requireBooking(actor, bookingId);
        Payment pay = payments.findByBookingId(b.getId())
                .orElseThrow(() -> new ResourceNotFoundException("No invoice yet: booking " + b.getBookingCode()
                        + " has not been paid"));
        Optional<ChargingSession> cs = sessions.findByBookingId(b.getId());
        ChargingPoint point = b.getChargingPoint();
        BigDecimal tariff = cs.map(ChargingSession::getTariff).orElseGet(() -> point.getTariffPerKwh()
                .multiply(estimator.multiplier(b.getStartTime().getHour())).setScale(2, RoundingMode.HALF_UP));
        double energy = cs.map(ChargingSession::getEnergyKwh).orElse(b.getEstEnergyKwh());
        Vehicle v = b.getVehicle();
        return new InvoiceDto(pay.getInvoiceNo(), b.getBookingCode(), pay.getPaidAt(), b.getUser().getFullName(),
                b.getStation().getName(), b.getStation().getAddress(),
                v.getRegNumber() + " (" + v.getModel().getMake() + " " + v.getModel().getModel() + ")",
                point.getConnectorType().getCode(), energy, tariff, pay.getAmount(), pay.getRefundedAmount(),
                pay.getMethod(), pay.getStatus());
    }

    // =====================================================================================
    //  Mapping
    // =====================================================================================

    /** Entity to DTO. Public because reminders, fleet and operator services reuse it. Runs inside a transaction. */
    @Transactional(readOnly = true)
    public BookingDto toDto(Booking b) {
        return toDto(b, payments.findByBookingId(b.getId()), sessions.findByBookingId(b.getId()));
    }

    private BookingDto toDto(Booking b, Optional<Payment> payment, Optional<ChargingSession> session) {
        LocalDateTime now = clock.now();
        Station st = b.getStation();
        ChargingPoint p = b.getChargingPoint();
        Vehicle v = b.getVehicle();

        StationRef stationRef = new StationRef(st.getId(), st.getName(), st.getZone(), st.getAddress(),
                st.getLatitude(), st.getLongitude());
        BookingPointRef pointRef = new BookingPointRef(p.getId(), p.getLabel(), p.getConnectorType().getCode(),
                p.getPowerKw(), p.getTariffPerKwh());
        VehicleRef vehicleRef = new VehicleRef(v.getId(), v.getNickname(), v.getRegNumber(), v.getModel().getMake(),
                v.getModel().getModel());
        PaymentDto paymentDto = payment.map(x -> new PaymentDto(x.getAmount(), x.getMethod(), x.getStatus(),
                x.getInvoiceNo(), x.getRefundedAmount())).orElse(null);
        SessionDto sessionDto = session.map(x -> new SessionDto(x.getStartedAt(), x.getEndedAt(), x.getEnergyKwh(),
                x.getSocEnd(), x.getAmount(), x.getCo2AvoidedKg())).orElse(null);

        boolean canCancel = b.getStatus() == BookingStatus.HOLD || b.getStatus() == BookingStatus.CONFIRMED;
        boolean canCheckIn = b.getStatus() == BookingStatus.CONFIRMED && inCheckInWindow(b, now);
        BigDecimal refund = BigDecimal.ZERO.setScale(2);
        if (canCancel && payment.isPresent() && payment.get().getStatus() == PaymentStatus.PAID) {
            refund = refundFor(payment.get().getAmount(), b.getStartTime(), now);
        }
        return new BookingDto(b.getId(), b.getBookingCode(), b.getStatus(), b.getSource(), b.getStartTime(),
                b.getEndTime(), b.getSlots(), stationRef, pointRef, vehicleRef, b.getSocStart(), b.getSocTarget(),
                b.getEstEnergyKwh(), b.getEstCost(), b.getHoldExpiresAt(), b.getCheckedInAt(), b.getCancelledAt(),
                b.getCancelReason(), b.getCreatedAt(), paymentDto, sessionDto, canCancel, canCheckIn, refund,
                "VSL|" + b.getBookingCode() + "|" + b.getId());
    }

    // =====================================================================================
    //  Maintenance jobs (called by JobScheduler and by the admin "run now")
    // =====================================================================================

    /** HOLDs that were not paid in time become EXPIRED and their slots are released. */
    public int expireHolds() {
        List<Booking> expired = bookings.findByStatusAndHoldExpiresAtBefore(BookingStatus.HOLD, clock.now());
        for (Booking b : expired) {
            releaseSlots(b);
            b.setStatus(BookingStatus.EXPIRED);
            bookings.save(b);
        }
        return expired.size();
    }

    /**
     * CONFIRMED bookings whose customer did not arrive within 15 minutes after the start: status NO_SHOW,
     * 25 % of the paid amount is kept as penalty, 75 % is refunded, the user's no-show counter goes up.
     * The slots stay in booking_slots (they are in the past, nobody can use them any more).
     */
    public int markNoShows() {
        LocalDateTime now = clock.now();
        List<Booking> late = bookings.findByStatusAndStartTimeBefore(BookingStatus.CONFIRMED,
                now.minusMinutes(CHECK_IN_WINDOW_MINUTES));
        for (Booking b : late) {
            BigDecimal refund = BigDecimal.ZERO.setScale(2);
            Optional<Payment> payOpt = payments.findByBookingId(b.getId());
            if (payOpt.isPresent() && payOpt.get().getStatus() == PaymentStatus.PAID) {
                Payment pay = payOpt.get();
                BigDecimal penalty = pay.getAmount().multiply(NO_SHOW_PENALTY_RATE).setScale(2, RoundingMode.HALF_UP);
                refund = pay.getAmount().subtract(penalty);
                if (refund.signum() > 0 && pay.getMethod() == PaymentMethod.WALLET) {
                    wallets.credit(b.getUser().getId(), refund, WalletTxnType.REFUND,
                            "REFUND " + b.getBookingCode() + " (no-show, 25% retained)");
                }
                pay.setRefundedAmount(refund);
                pay.setStatus(PaymentStatus.PART_REFUND);
                payments.save(pay);
            }
            b.setStatus(BookingStatus.NO_SHOW);
            bookings.save(b);

            User u = b.getUser();
            u.setNoShowCount((u.getNoShowCount() == null ? 0 : u.getNoShowCount()) + 1);
            users.save(u);
            notifications.create(u, NotificationType.NO_SHOW, "Missed booking",
                    "You did not arrive for booking " + b.getBookingCode() + " at " + b.getStation().getName()
                            + ". A 25% fee was retained" + (refund.signum() > 0 ? "; " + rupees(refund) + " refunded." : "."),
                    bookingPayload(b));
        }
        return late.size();
    }

    /** CHECKED_IN sessions whose booked end time has passed are completed automatically. */
    public int autoCompleteSessions() {
        List<Booking> due = bookings.findByStatusAndEndTimeLessThanEqual(BookingStatus.CHECKED_IN, clock.now());
        for (Booking b : due) {
            completeBooking(b, null);
        }
        return due.size();
    }

    /** One BOOKING_SOON notification per confirmed booking that starts within the next 60 minutes. */
    public int notifyUpcoming() {
        LocalDateTime now = clock.now();
        int sent = 0;
        for (Booking b : bookings.findByStatusAndStartTimeBetween(BookingStatus.CONFIRMED, now, now.plusMinutes(60))) {
            String payload = bookingPayload(b);
            if (notifications.exists(b.getUser().getId(), NotificationType.BOOKING_SOON, payload)) {
                continue;   // already reminded
            }
            notifications.create(b.getUser(), NotificationType.BOOKING_SOON, "Your charging slot starts soon",
                    "Booking " + b.getBookingCode() + " at " + b.getStation().getName() + " starts at "
                            + b.getStartTime().toLocalTime() + ", point " + b.getChargingPoint().getLabel() + ".", payload);
            sent++;
        }
        return sent;
    }

    // =====================================================================================
    //  Helpers
    // =====================================================================================

    /** Removes the slot rows of a booking and announces that the time window is free again. */
    private void releaseSlots(Booking b) {
        slots.deleteByBookingId(b.getId());
        events.publishEvent(new SlotsReleasedEvent(b.getStation().getId(), b.getChargingPoint().getId(),
                b.getStartTime(), b.getEndTime()));
    }

    private static boolean inCheckInWindow(Booking b, LocalDateTime now) {
        return !now.isBefore(b.getStartTime().minusMinutes(CHECK_IN_WINDOW_MINUTES))
                && !now.isAfter(b.getStartTime().plusMinutes(CHECK_IN_WINDOW_MINUTES));
    }

    /** The points that may be used, in order of preference (highest accepted kW, then lowest tariff). */
    private List<ChargingPoint> candidatePoints(Station station, ChargingPoint pointOrNull, VehicleSpec spec) {
        if (pointOrNull != null) {
            if (!pointOrNull.getStation().getId().equals(station.getId())) {
                throw new BadRequestException("The charging point does not belong to this station");
            }
            if (pointOrNull.getStatus() != PointStatus.ACTIVE) {
                throw new BadRequestException("Charging point " + pointOrNull.getLabel() + " is not active");
            }
            if (!estimator.compatible(spec, pointOrNull)) {
                throw new BadRequestException("This vehicle cannot charge on connector "
                        + pointOrNull.getConnectorType().getCode());
            }
            return List.of(pointOrNull);
        }
        List<ChargingPoint> list = activeCompatiblePoints(station, spec);
        if (list.isEmpty()) {
            throw new BadRequestException("No active charging point at " + station.getName()
                    + " is compatible with this vehicle");
        }
        return list;
    }

    private List<ChargingPoint> activeCompatiblePoints(Station station, VehicleSpec spec) {
        return points.findByStationIdOrderByIdAsc(station.getId()).stream()
                .filter(p -> p.getStatus() == PointStatus.ACTIVE && estimator.compatible(spec, p))
                .sorted(Comparator.comparingDouble((ChargingPoint p) -> -estimator.acceptedKw(spec, p))
                        .thenComparing(ChargingPoint::getTariffPerKwh)
                        .thenComparing(ChargingPoint::getId))
                .toList();
    }

    /**
     * What we offer when the slot is taken: (1) free slots at the same station within +-3 hours on any
     * compatible point, nearest to the wish first; (2) the top-3 other stations from the recommendation engine
     * using the requested start as arrival time.
     */
    private Alternatives buildAlternatives(User owner, Vehicle vehicle, VehicleSpec spec, Station station,
                                           LocalDateTime start, int socStart, int socTarget) {
        return new Alternatives(sameStationOptions(spec, station, start, socStart, socTarget),
                otherStationOptions(owner, vehicle, station, start, socStart, socTarget));
    }

    /** Same as above but never throws: used after a failed INSERT where the session may be in a bad state. */
    private Alternatives safeAlternatives(User owner, Vehicle vehicle, VehicleSpec spec, Station station,
                                          LocalDateTime start, int socStart, int socTarget) {
        try {
            return buildAlternatives(owner, vehicle, spec, station, start, socStart, socTarget);
        } catch (RuntimeException ex) {
            return new Alternatives(List.of(), List.of());
        }
    }

    private List<SlotOption> sameStationOptions(VehicleSpec spec, Station station, LocalDateTime start,
                                                int socStart, int socTarget) {
        List<ChargingPoint> compatible = activeCompatiblePoints(station, spec);
        if (compatible.isEmpty()) {
            return List.of();
        }
        LocalDateTime earliest = TimeUtil.floorToSlot(clock.now());
        LocalDateTime from = start.minusHours(ALTERNATIVE_WINDOW_HOURS);
        if (from.isBefore(earliest)) {
            from = earliest;
        }
        LocalDateTime to = start.plusHours(ALTERNATIVE_WINDOW_HOURS);

        Map<Long, Integer> slotsNeeded = new HashMap<>();
        int maxSlots = 1;
        for (ChargingPoint p : compatible) {
            int n = estimator.estimate(spec, p, start, socStart, socTarget).slots();
            slotsNeeded.put(p.getId(), n);
            maxSlots = Math.max(maxSlots, n);
        }
        List<Long> ids = compatible.stream().map(ChargingPoint::getId).toList();
        Map<Long, Set<LocalDateTime>> occupied = availability.occupiedSlots(ids, from,
                to.plusMinutes((long) maxSlots * TimeUtil.SLOT_MINUTES));

        List<SlotOption> options = new ArrayList<>();
        for (LocalDateTime t = from; !t.isAfter(to); t = t.plusMinutes(TimeUtil.SLOT_MINUTES)) {
            for (ChargingPoint p : compatible) {
                int n = slotsNeeded.get(p.getId());
                if (availability.withinOpeningHours(station, t, n)
                        && availability.isFree(occupied.getOrDefault(p.getId(), Set.of()), t, n)) {
                    options.add(new SlotOption(p.getId(), p.getLabel(), t));
                }
            }
        }
        options.sort(Comparator
                .comparingLong((SlotOption o) -> Math.abs(java.time.Duration.between(start, o.start()).toMinutes()))
                .thenComparing(SlotOption::pointId));
        return options.size() > MAX_SAME_STATION_ALTERNATIVES
                ? new ArrayList<>(options.subList(0, MAX_SAME_STATION_ALTERNATIVES)) : options;
    }

    private List<RecommendedItem> otherStationOptions(User owner, Vehicle vehicle, Station station,
                                                      LocalDateTime start, int socStart, int socTarget) {
        try {
            RecommendationRequest rr = new RecommendationRequest(station.getLatitude(), station.getLongitude(),
                    vehicle.getId(), null, start, socStart, socTarget, null, null, null, 6);
            RecommendationResponse resp = recommendation.recommend(rr, AuthUser.from(owner));
            if (resp == null || resp.items() == null) {
                return List.of();
            }
            return resp.items().stream()
                    .filter(i -> i.station() == null || !station.getId().equals(i.station().id()))
                    .limit(MAX_OTHER_STATION_ALTERNATIVES)
                    .collect(Collectors.toList());
        } catch (RuntimeException ex) {
            return List.of();   // alternatives are a convenience; never hide the real 409 behind a failure here
        }
    }

    /** Marks the surrounding transaction rollback-only (no-op when there is none, e.g. in unit tests). */
    private static void rollbackOnly() {
        try {
            TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
        } catch (NoTransactionException ignored) {
            // nothing to roll back
        }
    }

    private String newBookingCode() {
        String code = CodeGenerator.bookingCode();
        int tries = 0;
        while (bookings.existsByBookingCode(code) && tries++ < 10) {
            code = CodeGenerator.bookingCode();
        }
        return code;
    }

    static String invoiceNumber(Long paymentId) {
        return "INV-2526-" + String.format("%06d", paymentId);
    }

    private static String bookingPayload(Booking b) {
        return "{\"bookingId\":" + b.getId() + "}";
    }

    private static String rupees(BigDecimal v) {
        return "₹" + v.setScale(2, RoundingMode.HALF_UP).toPlainString();
    }

    private static String cut(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max);
    }

    // ---------------- access control ----------------

    private Vehicle requireVehicle(AuthUser actor, Long vehicleId) {
        Vehicle v = vehicles.findById(vehicleId).orElseThrow(() -> new ResourceNotFoundException("Vehicle", vehicleId));
        if (!canUseVehicle(actor, v)) {
            throw new ForbiddenException("This vehicle does not belong to you");
        }
        return v;
    }

    /** Owner of the vehicle, the fleet manager of its fleet, or an admin. */
    private static boolean canUseVehicle(AuthUser actor, Vehicle v) {
        if (actor.getRole() == Role.ADMIN) {
            return true;
        }
        if (v.getUser() != null && v.getUser().getId().equals(actor.getId())) {
            return true;
        }
        return actor.getRole() == Role.FLEET_MANAGER && actor.getFleetId() != null && v.getFleet() != null
                && actor.getFleetId().equals(v.getFleet().getId());
    }

    /** Loads a booking and checks that the caller may touch it (owner, fleet manager of the vehicle's fleet, admin). */
    private Booking requireBooking(AuthUser actor, Long bookingId) {
        Booking b = bookings.findById(bookingId).orElseThrow(() -> new ResourceNotFoundException("Booking", bookingId));
        boolean owner = b.getUser().getId().equals(actor.getId());
        if (!owner && !canUseVehicle(actor, b.getVehicle())) {
            throw new ForbiddenException("This booking belongs to another user");
        }
        return b;
    }
}
