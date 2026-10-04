package com.chargeiq.service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.chargeiq.clock.AppClock;
import com.chargeiq.dto.ReminderDtos.CadencePoint;
import com.chargeiq.dto.ReminderDtos.PredictionDto;
import com.chargeiq.entity.ChargingSession;
import com.chargeiq.entity.RechargePrediction;
import com.chargeiq.entity.Station;
import com.chargeiq.entity.Vehicle;
import com.chargeiq.entity.enums.Role;
import com.chargeiq.repository.ChargingSessionRepository;
import com.chargeiq.repository.RechargePredictionRepository;
import com.chargeiq.repository.StationRepository;
import com.chargeiq.repository.VehicleRepository;
import com.chargeiq.security.AuthUser;

/**
 * "When will this vehicle need charging again?" - the engine behind the BigBasket-style reminder.
 * <pre>
 *   sessions   = completed charging sessions of the vehicle, oldest first (by started_at)
 *   need >= 3 sessions, otherwise no prediction (state NO_DATA)
 *   intervals  = gaps in (fractional) days between consecutive session starts, last 6 gaps
 *   median     = median(intervals)                       -> typical charging cadence
 *   nextDue    = end of last session + median
 *   cv         = std(intervals) / mean(intervals)        -> how irregular the driver is
 *   confidence = clamp(1 - cv, 0.2, 0.95) * min(1, sessions / 6)
 *   preferred hour / station = mode of the last 10 sessions, avg energy = mean of the last 10 sessions
 * </pre>
 * The median is used instead of the mean because one long holiday gap should not shift the whole schedule.
 */
@Service
@Transactional
public class RechargePredictionService {
    /** Minimum completed sessions before a prediction is made. */
    public static final int MIN_SESSIONS = 3;
    /** How many intervals feed the median. */
    public static final int INTERVAL_WINDOW = 6;
    /** How many recent sessions feed the preferred hour / station / energy. */
    public static final int RECENT_WINDOW = 10;

    private final ChargingSessionRepository sessions;
    private final RechargePredictionRepository repo;
    private final VehicleRepository vehicles;
    private final StationRepository stations;
    private final AppClock clock;

    public RechargePredictionService(ChargingSessionRepository sessions, RechargePredictionRepository repo,
                                     VehicleRepository vehicles, StationRepository stations, AppClock clock) {
        this.sessions = sessions;
        this.repo = repo;
        this.vehicles = vehicles;
        this.stations = stations;
        this.clock = clock;
    }

    // ------------------------------------------------------------------------------------------------
    // Persisting predictions
    // ------------------------------------------------------------------------------------------------

    /** Recomputes (insert or update) the prediction of one vehicle; empty when the vehicle has fewer than 3 sessions. */
    public Optional<RechargePrediction> recompute(Vehicle v) {
        List<ChargingSession> history = sessions.findByVehicleOrdered(v.getId());
        if (history.size() < MIN_SESSIONS) {
            return Optional.empty();
        }
        List<Double> intervals = lastIntervals(history);
        double median = median(intervals);
        double conf = confidence(intervals, history.size());

        ChargingSession last = history.get(history.size() - 1);
        List<ChargingSession> recent = history.subList(Math.max(0, history.size() - RECENT_WINDOW), history.size());

        RechargePrediction p = repo.findByVehicleId(v.getId()).orElseGet(RechargePrediction::new);
        p.setVehicle(v);
        p.setUser(v.getUser());
        p.setLastChargeAt(last.getEndedAt());
        p.setMedianIntervalDays(round(median, 3));
        p.setNextDueAt(last.getEndedAt().plusSeconds(Math.round(median * 86400.0)));
        p.setConfidence(round(conf, 3));
        p.setSessionsUsed(history.size());
        p.setPreferredHour(modeHour(recent));
        p.setPreferredStation(modeStation(recent));
        p.setAvgEnergyKwh(round(recent.stream().mapToDouble(ChargingSession::getEnergyKwh).average().orElse(0.0), 2));
        p.setUpdatedAt(clock.now());
        return Optional.of(repo.save(p));
    }

    /** Start-up helper: creates predictions for every vehicle that has enough history but no row yet. */
    public int recomputeMissing() {
        int created = 0;
        for (Vehicle v : vehicles.findAll()) {
            if (repo.findByVehicleId(v.getId()).isEmpty() && recompute(v).isPresent()) {
                created++;
            }
        }
        return created;
    }

    // ------------------------------------------------------------------------------------------------
    // Read model for the UI
    // ------------------------------------------------------------------------------------------------

    /** UPCOMING | DUE_SOON | OVERDUE | NO_DATA for a prediction at time {@code now}. */
    public static String state(RechargePrediction p, LocalDateTime now, int leadHours) {
        if (p == null || p.getNextDueAt() == null) {
            return "NO_DATA";
        }
        LocalDateTime due = p.getNextDueAt();
        if (now.isAfter(due)) {
            return "OVERDUE";
        }
        if (!now.isBefore(due.minusHours(leadHours))) {
            return "DUE_SOON";
        }
        return "UPCOMING";
    }

    /** Predictions of the caller's vehicles (a fleet manager sees the whole fleet). The suggestion is left null here. */
    @Transactional(readOnly = true)
    public List<PredictionDto> predictionsFor(AuthUser actor) {
        List<Vehicle> list = (actor.getRole() == Role.FLEET_MANAGER && actor.getFleetId() != null)
                ? vehicles.findByFleetIdOrderByIdAsc(actor.getFleetId())
                : vehicles.findByUserIdOrderByIdAsc(actor.getId());
        LocalDateTime now = clock.now();
        List<PredictionDto> out = new ArrayList<>();
        for (Vehicle v : list) {
            out.add(toDto(v, now));
        }
        return out;
    }

    private PredictionDto toDto(Vehicle v, LocalDateTime now) {
        List<ChargingSession> history = sessions.findByVehicleOrdered(v.getId());
        String label = VehicleService.label(v);
        Optional<RechargePrediction> opt = repo.findByVehicleId(v.getId());
        if (opt.isEmpty()) {
            return noData(v, label, history);
        }
        RechargePrediction p = opt.get();
        int lead = v.getUser().getReminderLeadHours() == null ? 24 : v.getUser().getReminderLeadHours();
        Station pref = p.getPreferredStation();
        double hoursUntil = round(Duration.between(now, p.getNextDueAt()).getSeconds() / 3600.0, 1);
        return new PredictionDto(v.getId(), label, state(p, now, lead), p.getLastChargeAt(),
                p.getMedianIntervalDays(), p.getAvgEnergyKwh(), p.getPreferredHour(),
                pref == null ? null : pref.getId(), pref == null ? null : pref.getName(),
                p.getSessionsUsed(), p.getConfidence(), p.getNextDueAt(), hoursUntil, cadence(history), null);
    }

    /**
     * Fewer than 3 sessions: state NO_DATA, no reminder will ever be raised. When at least one session exists we still
     * show the rule-of-thumb fallback cadence (range * 0.6 / avg daily km) so the UI can say "roughly every N days".
     */
    private PredictionDto noData(Vehicle v, String label, List<ChargingSession> history) {
        double fallbackDays = fallbackDays(v);
        LocalDateTime last = history.isEmpty() ? null : history.get(history.size() - 1).getEndedAt();
        LocalDateTime nextDue = last == null ? null : last.plusSeconds(Math.round(fallbackDays * 86400.0));
        return new PredictionDto(v.getId(), label, "NO_DATA", last, last == null ? 0.0 : round(fallbackDays, 2), 0.0, 0,
                null, null, history.size(), 0.0, nextDue, 0.0, cadence(history), null);
    }

    /** Days until the battery is ~40% left, assuming the driver covers avgDailyKm per day on 60% of the range. */
    static double fallbackDays(Vehicle v) {
        int avgKm = v.getAvgDailyKm() == null || v.getAvgDailyKm() <= 0 ? 40 : v.getAvgDailyKm();
        return (v.getModel().getRangeKm() * 0.6) / avgKm;
    }

    private static List<CadencePoint> cadence(List<ChargingSession> history) {
        List<CadencePoint> out = new ArrayList<>();
        int from = Math.max(1, history.size() - INTERVAL_WINDOW);
        for (int i = from; i < history.size(); i++) {
            LocalDateTime start = history.get(i).getStartedAt();
            out.add(new CadencePoint(start.toLocalDate(), round(daysBetween(history.get(i - 1).getStartedAt(), start), 2)));
        }
        return out;
    }

    // ------------------------------------------------------------------------------------------------
    // Pure maths (static, no database - unit tested directly)
    // ------------------------------------------------------------------------------------------------

    /** Gap in fractional days between two timestamps. */
    static double daysBetween(LocalDateTime a, LocalDateTime b) {
        return Duration.between(a, b).getSeconds() / 86400.0;
    }

    /** Intervals between consecutive session starts, restricted to the last {@link #INTERVAL_WINDOW} gaps. */
    static List<Double> lastIntervals(List<ChargingSession> ordered) {
        List<Double> all = new ArrayList<>();
        for (int i = 1; i < ordered.size(); i++) {
            all.add(daysBetween(ordered.get(i - 1).getStartedAt(), ordered.get(i).getStartedAt()));
        }
        return new ArrayList<>(all.subList(Math.max(0, all.size() - INTERVAL_WINDOW), all.size()));
    }

    static double median(List<Double> values) {
        if (values.isEmpty()) {
            return 0.0;
        }
        List<Double> sorted = new ArrayList<>(values);
        Collections.sort(sorted);
        int n = sorted.size();
        return n % 2 == 1 ? sorted.get(n / 2) : (sorted.get(n / 2 - 1) + sorted.get(n / 2)) / 2.0;
    }

    /** confidence = clamp(1 - cv, 0.2, 0.95) * min(1, nSessions / 6), cv = population std / mean of the intervals. */
    static double confidence(List<Double> intervals, int nSessions) {
        double mean = intervals.stream().mapToDouble(Double::doubleValue).average().orElse(0.0);
        double cv = 1.0;
        if (mean > 0) {
            double variance = intervals.stream().mapToDouble(x -> (x - mean) * (x - mean)).average().orElse(0.0);
            cv = Math.sqrt(variance) / mean;
        }
        double base = Math.min(0.95, Math.max(0.2, 1.0 - cv));
        return base * Math.min(1.0, nSessions / 6.0);
    }

    /** Most frequent start hour; ties are won by the hour that occurred most recently. */
    static int modeHour(List<ChargingSession> recent) {
        Map<Integer, int[]> stats = new HashMap<>(); // hour -> {count, lastIndex}
        for (int i = 0; i < recent.size(); i++) {
            int h = recent.get(i).getStartedAt().getHour();
            int[] s = stats.computeIfAbsent(h, k -> new int[2]);
            s[0]++;
            s[1] = i;
        }
        int best = 0;
        int[] bestStats = null;
        for (Map.Entry<Integer, int[]> e : stats.entrySet()) {
            int[] s = e.getValue();
            if (bestStats == null || s[0] > bestStats[0] || (s[0] == bestStats[0] && s[1] > bestStats[1])) {
                best = e.getKey();
                bestStats = s;
            }
        }
        return best;
    }

    /** Most frequently used station (ties: the most recent one); null when sessions carry no station. */
    private Station modeStation(List<ChargingSession> recent) {
        Map<Long, int[]> stats = new HashMap<>();
        for (int i = 0; i < recent.size(); i++) {
            Station st = recent.get(i).getBooking().getStation();
            if (st == null) {
                continue;
            }
            int[] s = stats.computeIfAbsent(st.getId(), k -> new int[2]);
            s[0]++;
            s[1] = i;
        }
        Long bestId = null;
        int[] bestStats = null;
        for (Map.Entry<Long, int[]> e : stats.entrySet()) {
            int[] s = e.getValue();
            if (bestStats == null || s[0] > bestStats[0] || (s[0] == bestStats[0] && s[1] > bestStats[1])) {
                bestId = e.getKey();
                bestStats = s;
            }
        }
        return bestId == null ? null : stations.findById(bestId).orElse(null);
    }

    private static double round(double v, int places) {
        double f = Math.pow(10, places);
        return Math.round(v * f) / f;
    }
}
