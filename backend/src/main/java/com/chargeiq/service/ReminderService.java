package com.chargeiq.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.chargeiq.clock.AppClock;
import com.chargeiq.dto.BookingDtos.BookingDto;
import com.chargeiq.dto.RecommendationDtos.RecommendationRequest;
import com.chargeiq.dto.RecommendationDtos.RecommendationResponse;
import com.chargeiq.dto.RecommendationDtos.RecommendedItem;
import com.chargeiq.dto.ReminderDtos.ReminderDto;
import com.chargeiq.dto.ReminderDtos.ReminderVehicle;
import com.chargeiq.dto.ReminderDtos.SuggestionDto;
import com.chargeiq.entity.ChargingPoint;
import com.chargeiq.entity.Notification;
import com.chargeiq.entity.RechargePrediction;
import com.chargeiq.entity.Station;
import com.chargeiq.entity.User;
import com.chargeiq.entity.Vehicle;
import com.chargeiq.entity.enums.BookingSource;
import com.chargeiq.entity.enums.BookingStatus;
import com.chargeiq.entity.enums.NotificationStatus;
import com.chargeiq.entity.enums.NotificationType;
import com.chargeiq.entity.enums.Preset;
import com.chargeiq.entity.enums.Role;
import com.chargeiq.exception.BadRequestException;
import com.chargeiq.exception.ConflictException;
import com.chargeiq.exception.ForbiddenException;
import com.chargeiq.exception.ResourceNotFoundException;
import com.chargeiq.repository.BookingRepository;
import com.chargeiq.repository.ChargingPointRepository;
import com.chargeiq.repository.NotificationRepository;
import com.chargeiq.repository.RechargePredictionRepository;
import com.chargeiq.repository.StationRepository;
import com.chargeiq.repository.UserRepository;
import com.chargeiq.repository.VehicleRepository;
import com.chargeiq.security.AuthUser;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * The "time to recharge" reminder (BigBasket-style "you usually reorder about now").
 * <p>
 * Flow: {@link RechargePredictionService} stores when each vehicle is due; {@link #evaluate()} (run by the scheduler
 * every 5 minutes and once at start-up) turns due predictions into RECHARGE_REMINDER notifications; the UI shows the
 * ACTIVE ones as a pop-up with a ready-made slot suggestion; the driver can snooze, dismiss or book in one click.
 * <p>
 * A reminder is raised only when ALL hold: user reminders enabled; now in [nextDue - leadHours, nextDue + 72h];
 * no future HOLD/CONFIRMED/CHECKED_IN booking for the vehicle; no ACTIVE/SNOOZED reminder already exists for the
 * vehicle; and the driver has not DISMISSED a reminder in the current cycle (dismissed after the last charge).
 * <p>
 * Extra constructor parameter compared with the shared contract: {@link ChargingPointRepository}, used so that the
 * booking is made on exactly the charging point that was suggested.
 */
@Service
@Transactional
public class ReminderService {
    private static final int OVERDUE_GRACE_HOURS = 72;
    private static final DateTimeFormatter HHMM = DateTimeFormatter.ofPattern("HH:mm");
    private static final DateTimeFormatter DAY_TIME = DateTimeFormatter.ofPattern("EEE d MMM 'at' HH:mm");

    private final NotificationRepository notifications;
    private final RechargePredictionRepository predictions;
    private final RechargePredictionService predictionService;
    private final BookingRepository bookings;
    private final UserRepository users;
    private final VehicleRepository vehicles;
    private final StationRepository stations;
    private final RecommendationService recommendation;
    private final BookingService bookingService;
    private final NotificationService notificationService;
    private final ObjectMapper json;
    private final boolean demoMode;
    private final AppClock clock;
    private final ChargingPointRepository points;

    public ReminderService(NotificationRepository notifications, RechargePredictionRepository predictions,
                           RechargePredictionService predictionService, BookingRepository bookings,
                           UserRepository users, VehicleRepository vehicles, StationRepository stations,
                           RecommendationService recommendation, @Lazy BookingService bookingService,
                           NotificationService notificationService, ObjectMapper json,
                           @Value("${app.demo-mode:true}") boolean demoMode, AppClock clock,
                           ChargingPointRepository points) {
        this.notifications = notifications;
        this.predictions = predictions;
        this.predictionService = predictionService;
        this.bookings = bookings;
        this.users = users;
        this.vehicles = vehicles;
        this.stations = stations;
        this.recommendation = recommendation;
        this.bookingService = bookingService;
        this.notificationService = notificationService;
        this.json = json;
        this.demoMode = demoMode;
        this.clock = clock;
        this.points = points;
    }

    // ------------------------------------------------------------------------------------------------
    // Scheduler entry points
    // ------------------------------------------------------------------------------------------------

    /** Re-activates finished snoozes and creates reminders for every due vehicle. Returns the number created. */
    public int evaluate() {
        LocalDateTime now = clock.now();
        reactivateSnoozes(notifications.findByTypeAndStatusAndSnoozedUntilLessThanEqual(
                NotificationType.RECHARGE_REMINDER, NotificationStatus.SNOOZED, now));

        // Candidate window: due within the next 72 h (max lead) or overdue by up to 72 h. Exact per-user lead is re-checked.
        List<RechargePrediction> candidates = predictions.findByNextDueAtBetween(
                now.minusHours(OVERDUE_GRACE_HOURS), now.plusHours(72));
        int created = 0;
        for (RechargePrediction p : candidates) {
            if (evaluateOne(p, now)) {
                created++;
            }
        }
        return created;
    }

    /** Evaluates only the actor's vehicles (used by the "refresh" button); returns the number of ACTIVE reminders. */
    public int refresh(AuthUser actor) {
        LocalDateTime now = clock.now();
        List<Notification> snoozed = notifications.findByUserIdAndTypeAndStatusIn(actor.getId(),
                NotificationType.RECHARGE_REMINDER, List.of(NotificationStatus.SNOOZED));
        reactivateSnoozes(snoozed.stream()
                .filter(n -> n.getSnoozedUntil() != null && !n.getSnoozedUntil().isAfter(now)).toList());
        for (RechargePrediction p : predictions.findByUserId(actor.getId())) {
            evaluateOne(p, now);
        }
        return notifications.findByUserIdAndTypeAndStatusIn(actor.getId(), NotificationType.RECHARGE_REMINDER,
                List.of(NotificationStatus.ACTIVE)).size();
    }

    private void reactivateSnoozes(List<Notification> snoozed) {
        for (Notification n : snoozed) {
            n.setStatus(NotificationStatus.ACTIVE);
            n.setSnoozedUntil(null);
            n.setRead(false);
            notifications.save(n);
        }
    }

    /** Applies all eligibility rules to one prediction and creates the notification when everything passes. */
    private boolean evaluateOne(RechargePrediction p, LocalDateTime now) {
        User user = p.getUser();
        if (!Boolean.TRUE.equals(user.getReminderEnabled())) {
            return false;
        }
        int lead = user.getReminderLeadHours() == null ? 24 : user.getReminderLeadHours();
        LocalDateTime due = p.getNextDueAt();
        if (now.isBefore(due.minusHours(lead)) || now.isAfter(due.plusHours(OVERDUE_GRACE_HOURS))) {
            return false;
        }
        Vehicle vehicle = p.getVehicle();
        if (hasLiveBooking(vehicle.getId(), now)) {
            return false;
        }
        String needle = vehicleNeedle(vehicle.getId());
        // already showing / snoozed?
        for (Notification n : notifications.findByUserIdAndTypeAndStatusIn(user.getId(), NotificationType.RECHARGE_REMINDER,
                List.of(NotificationStatus.ACTIVE, NotificationStatus.SNOOZED))) {
            if (n.getPayload() != null && n.getPayload().contains(needle)) {
                return false;
            }
        }
        // dismissed in the current cycle (after the last completed charge)? then stay quiet until the next session
        for (Notification n : notifications.findByUserIdAndTypeAndStatusIn(user.getId(), NotificationType.RECHARGE_REMINDER,
                List.of(NotificationStatus.DISMISSED))) {
            if (n.getPayload() != null && n.getPayload().contains(needle)
                    && n.getCreatedAt().isAfter(p.getLastChargeAt())) {
                return false;
            }
        }

        SuggestionDto suggestion = buildSuggestion(p, user, vehicle, now);
        notificationService.create(user, NotificationType.RECHARGE_REMINDER, headline(vehicle),
                limit(buildMessage(user, p, suggestion, now), 400), payloadJson(vehicle, suggestion, due));
        return true;
    }

    // ------------------------------------------------------------------------------------------------
    // Reading and acting on reminders
    // ------------------------------------------------------------------------------------------------

    /** ACTIVE reminders of the caller, each with a freshly computed slot suggestion (never stale). */
    public List<ReminderDto> active(AuthUser actor) {
        LocalDateTime now = clock.now();
        List<Notification> list = new ArrayList<>(notifications.findByUserIdAndTypeAndStatusIn(actor.getId(),
                NotificationType.RECHARGE_REMINDER, List.of(NotificationStatus.ACTIVE)));
        list.sort(Comparator.comparing(Notification::getCreatedAt).reversed());
        List<ReminderDto> out = new ArrayList<>();
        for (Notification n : list) {
            Long vehicleId = vehicleIdOf(n);
            Vehicle vehicle = vehicleId == null ? null : vehicles.findById(vehicleId).orElse(null);
            Optional<RechargePrediction> pred = vehicleId == null ? Optional.empty() : predictions.findByVehicleId(vehicleId);
            if (vehicle == null || pred.isEmpty()) {
                continue;
            }
            if (hasLiveBooking(vehicleId, now)) {
                // the driver already booked (maybe through another screen) -> the reminder is obsolete
                n.setStatus(NotificationStatus.DONE);
                notifications.save(n);
                continue;
            }
            RechargePrediction p = pred.get();
            SuggestionDto suggestion = buildSuggestion(p, n.getUser(), vehicle, now);
            double hours = Duration.between(now, p.getNextDueAt()).getSeconds() / 3600.0;
            out.add(new ReminderDto(n.getId(),
                    new ReminderVehicle(vehicle.getId(), VehicleService.label(vehicle), vehicle.getModel().getMake(),
                            vehicle.getModel().getModel()),
                    p.getNextDueAt(), Math.round(hours * 10.0) / 10.0, now.isAfter(p.getNextDueAt()),
                    headline(vehicle), buildMessage(n.getUser(), p, suggestion, now), p.getConfidence(),
                    p.getMedianIntervalDays(), p.getLastChargeAt(), suggestion));
        }
        return out;
    }

    public void snooze(AuthUser actor, Long notificationId, int hours) {
        Notification n = requireOwnReminder(actor, notificationId);
        if (n.getStatus() != NotificationStatus.ACTIVE && n.getStatus() != NotificationStatus.SNOOZED) {
            throw new ConflictException("This reminder has already been handled");
        }
        n.setStatus(NotificationStatus.SNOOZED);
        n.setSnoozedUntil(clock.now().plusHours(hours));
        n.setRead(true);
        notifications.save(n);
    }

    public void dismiss(AuthUser actor, Long notificationId) {
        Notification n = requireOwnReminder(actor, notificationId);
        n.setStatus(NotificationStatus.DISMISSED);
        n.setSnoozedUntil(null);
        n.setRead(true);
        notifications.save(n);
    }

    /** Books (HOLD) the suggested slot with source REMINDER; the UI then lets the driver pay to confirm. */
    public BookingDto book(AuthUser actor, Long notificationId) {
        Notification n = requireOwnReminder(actor, notificationId);
        if (n.getStatus() != NotificationStatus.ACTIVE && n.getStatus() != NotificationStatus.SNOOZED) {
            throw new ConflictException("This reminder has already been handled");
        }
        Long vehicleId = vehicleIdOf(n);
        Vehicle vehicle = vehicleId == null ? null : vehicles.findById(vehicleId).orElse(null);
        RechargePrediction p = vehicleId == null ? null : predictions.findByVehicleId(vehicleId).orElse(null);
        if (vehicle == null || p == null) {
            throw new ResourceNotFoundException("Vehicle for this reminder no longer exists");
        }
        LocalDateTime now = clock.now();
        SuggestionDto s = buildSuggestion(p, n.getUser(), vehicle, now);
        if (s == null) {
            throw new BadRequestException("No suitable charging slot is available right now - please search manually");
        }
        Station station = stations.findById(s.stationId())
                .orElseThrow(() -> new ResourceNotFoundException("Station", s.stationId()));
        ChargingPoint point = s.pointId() == null ? null : points.findById(s.pointId()).orElse(null);

        BookingDto booking = bookingService.createHold(n.getUser(), vehicle, point, station, s.slotStart(),
                20, 80, BookingSource.REMINDER, 5);

        n.setStatus(NotificationStatus.DONE);
        n.setRead(true);
        notifications.save(n);
        return booking;
    }

    /**
     * Demo helper: pretends the vehicle is due right now so the pop-up can be shown on stage.
     * Only available when app.demo-mode=true (otherwise 404, as if the endpoint did not exist).
     */
    public void demoTrigger(AuthUser actor, Long vehicleId) {
        if (!demoMode) {
            throw new ResourceNotFoundException("Resource not found");
        }
        Vehicle vehicle = vehicles.findById(vehicleId).orElseThrow(() -> new ResourceNotFoundException("Vehicle", vehicleId));
        boolean owner = vehicle.getUser().getId().equals(actor.getId());
        boolean sameFleet = actor.getRole() == Role.FLEET_MANAGER && actor.getFleetId() != null
                && vehicle.getFleet() != null && actor.getFleetId().equals(vehicle.getFleet().getId());
        if (!(owner || sameFleet || actor.getRole() == Role.ADMIN)) {
            throw new ForbiddenException("You do not have access to this vehicle");
        }
        LocalDateTime now = clock.now();
        RechargePrediction p = predictions.findByVehicleId(vehicleId)
                .or(() -> predictionService.recompute(vehicle))
                .orElseThrow(() -> new BadRequestException(
                        "This vehicle needs at least 3 completed charging sessions before a recharge time can be predicted"));
        User user = p.getUser();
        if (!Boolean.TRUE.equals(user.getReminderEnabled())) {
            throw new BadRequestException("Recharge reminders are switched off in the profile of this user");
        }
        if (hasLiveBooking(vehicleId, now)) {
            throw new ConflictException("This vehicle already has an upcoming booking, so no reminder is needed");
        }
        p.setNextDueAt(now);
        p.setUpdatedAt(now);
        predictions.save(p);

        // Clear the "already handled" blockers so the demo can be repeated.
        String needle = vehicleNeedle(vehicleId);
        for (Notification n : notifications.findByUserIdAndType(user.getId(), NotificationType.RECHARGE_REMINDER)) {
            if (n.getPayload() == null || !n.getPayload().contains(needle)) {
                continue;
            }
            if (n.getStatus() == NotificationStatus.DISMISSED) {
                n.setStatus(NotificationStatus.DONE);
                notifications.save(n);
            } else if (n.getStatus() == NotificationStatus.SNOOZED || n.getStatus() == NotificationStatus.ACTIVE) {
                n.setStatus(NotificationStatus.ACTIVE);
                n.setSnoozedUntil(null);
                n.setRead(false);
                notifications.save(n);
            }
        }
        evaluateOne(p, now);
    }

    // ------------------------------------------------------------------------------------------------
    // Suggestion + copy
    // ------------------------------------------------------------------------------------------------

    /**
     * Best station for this vehicle right now: the BALANCED recommendation around the user's home (or the preferred
     * station when no home is stored), for 20% -> 80%, arriving at max(now + 1h, preferred hour of the due day).
     * Returns null when no location or no compatible station with a free slot is available.
     */
    private SuggestionDto buildSuggestion(RechargePrediction p, User user, Vehicle vehicle, LocalDateTime now) {
        Double lat = user.getHomeLat();
        Double lon = user.getHomeLon();
        if (lat == null || lon == null) {
            Station pref = p.getPreferredStation();
            if (pref == null) {
                return null;
            }
            lat = pref.getLatitude();
            lon = pref.getLongitude();
        }
        LocalDateTime day = p.getNextDueAt().isAfter(now) ? p.getNextDueAt() : now;
        LocalDateTime wanted = day.toLocalDate().atTime(p.getPreferredHour(), 0);
        LocalDateTime earliest = now.plusHours(1);
        LocalDateTime arrival = wanted.isAfter(earliest) ? wanted : earliest;

        RecommendationRequest req = new RecommendationRequest(lat, lon, vehicle.getId(), null, arrival, 20, 80,
                Preset.BALANCED, null, null, 3);
        RecommendationResponse res = recommendation.recommend(req, null);
        if (res == null || res.items() == null || res.items().isEmpty()) {
            return null;
        }
        RecommendedItem it = res.items().get(0);
        double distance = it.station().distanceKm() == null ? 0.0 : it.station().distanceKm();
        return new SuggestionDto(it.station().id(), it.station().name(), it.station().zone(), it.point().pointId(),
                it.point().connectorCode(), it.slotStart(), it.slotEnd(), it.crowdingLevel(), it.crowdingIndex(),
                it.estimatedCost(), it.chargeMinutes(), Math.round(distance * 10.0) / 10.0, reasonOf(it));
    }

    /** One-sentence explanation built from the recommendation engine's own reasons. */
    private static String reasonOf(RecommendedItem it) {
        List<String> reasons = it.reasons() == null ? List.of() : it.reasons();
        if (reasons.isEmpty()) {
            return "Best overall match for your vehicle right now.";
        }
        return "Best overall match: " + String.join("; ", reasons.subList(0, Math.min(2, reasons.size()))) + ".";
    }

    static String headline(Vehicle vehicle) {
        return "Time to recharge your " + vehicle.getModel().getModel();
    }

    /** e.g. "You usually charge every ~6 days. Your last charge was 5 days ago. Aarav, a quiet slot is free at ..." */
    private String buildMessage(User user, RechargePrediction p, SuggestionDto s, LocalDateTime now) {
        long cadenceDays = Math.max(1, Math.round(p.getMedianIntervalDays()));
        long since = Duration.between(p.getLastChargeAt(), now).toDays();
        String sinceText = since <= 0 ? "earlier today" : since + (since == 1 ? " day ago" : " days ago");
        String first = user.getFullName() == null ? "there" : user.getFullName().trim().split("\\s+")[0];
        StringBuilder sb = new StringBuilder();
        sb.append("You usually charge every ~").append(cadenceDays).append(cadenceDays == 1 ? " day" : " days")
                .append(". Your last charge was ").append(sinceText).append(". ").append(first).append(", ");
        if (s == null) {
            sb.append("open VoltSlot to find a free slot nearby.");
        } else {
            boolean quiet = "LOW".equals(s.crowdingLevel());
            boolean today = s.slotStart().toLocalDate().equals(now.toLocalDate());
            sb.append(quiet ? "a quiet slot" : "a slot").append(" is free at ").append(s.stationName()).append(" ")
                    .append(today ? "at " + s.slotStart().format(HHMM) : s.slotStart().format(DAY_TIME))
                    .append(" (").append(inr(s.estimatedCost())).append(").");
        }
        return sb.toString();
    }

    /** Whole rupees with Indian digit grouping, e.g. 125000 -> "₹1,25,000". */
    static String inr(BigDecimal amount) {
        if (amount == null) {
            return "₹0";
        }
        String digits = amount.setScale(0, RoundingMode.HALF_UP).abs().toPlainString();
        String out;
        if (digits.length() <= 3) {
            out = digits;
        } else {
            String last3 = digits.substring(digits.length() - 3);
            String rest = digits.substring(0, digits.length() - 3);
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < rest.length(); i++) {
                if (i > 0 && (rest.length() - i) % 2 == 0) {
                    sb.append(',');
                }
                sb.append(rest.charAt(i));
            }
            out = sb + "," + last3;
        }
        return "₹" + out;
    }

    // ------------------------------------------------------------------------------------------------
    // Small helpers
    // ------------------------------------------------------------------------------------------------

    private boolean hasLiveBooking(Long vehicleId, LocalDateTime now) {
        return bookings.existsByVehicleIdAndStatusInAndEndTimeAfter(vehicleId, BookingStatus.LIVE, now);
    }

    /** Text searched for inside the payload; the trailing comma stops vehicle 1 from matching vehicle 12. */
    private static String vehicleNeedle(Long vehicleId) {
        return "\"vehicleId\":" + vehicleId + ",";
    }

    private String payloadJson(Vehicle vehicle, SuggestionDto s, LocalDateTime due) {
        Map<String, Object> m = new LinkedHashMap<>(); // keeps vehicleId first (see vehicleNeedle)
        m.put("vehicleId", vehicle.getId());
        m.put("stationId", s == null ? null : s.stationId());
        m.put("pointId", s == null ? null : s.pointId());
        m.put("slotStart", s == null ? null : s.slotStart().toString());
        m.put("slotEnd", s == null ? null : s.slotEnd().toString());
        m.put("dueAt", due.toString());
        try {
            return json.writeValueAsString(m);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Cannot serialise reminder payload", e);
        }
    }

    private Long vehicleIdOf(Notification n) {
        if (n.getPayload() == null) {
            return null;
        }
        try {
            JsonNode node = json.readTree(n.getPayload()).get("vehicleId");
            return node == null || node.isNull() ? null : node.asLong();
        } catch (JsonProcessingException e) {
            return null;
        }
    }

    private Notification requireOwnReminder(AuthUser actor, Long notificationId) {
        Notification n = notifications.findById(notificationId)
                .orElseThrow(() -> new ResourceNotFoundException("Notification", notificationId));
        if (!n.getUser().getId().equals(actor.getId())) {
            throw new ForbiddenException("This notification belongs to another user");
        }
        if (n.getType() != NotificationType.RECHARGE_REMINDER) {
            throw new BadRequestException("This notification is not a recharge reminder");
        }
        return n;
    }

    private static String limit(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max - 1) + "…";
    }
}
