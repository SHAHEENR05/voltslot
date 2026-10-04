package com.chargeiq.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.chargeiq.clock.AppClock;
import com.chargeiq.dto.BookingDtos.EstimateResponse;
import com.chargeiq.dto.RecommendationDtos.Baseline;
import com.chargeiq.dto.RecommendationDtos.ComponentScore;
import com.chargeiq.dto.RecommendationDtos.PointRef;
import com.chargeiq.dto.RecommendationDtos.RecommendationRequest;
import com.chargeiq.dto.RecommendationDtos.RecommendationResponse;
import com.chargeiq.dto.RecommendationDtos.RecommendedItem;
import com.chargeiq.dto.RecommendationDtos.Savings;
import com.chargeiq.dto.RecommendationDtos.WeightsDto;
import com.chargeiq.dto.StationDtos.StationSummaryDto;
import com.chargeiq.entity.ChargingPoint;
import com.chargeiq.entity.Station;
import com.chargeiq.entity.Vehicle;
import com.chargeiq.entity.enums.PointStatus;
import com.chargeiq.entity.enums.Preset;
import com.chargeiq.entity.enums.StationStatus;
import com.chargeiq.exception.BadRequestException;
import com.chargeiq.exception.ForbiddenException;
import com.chargeiq.exception.ResourceNotFoundException;
import com.chargeiq.repository.ChargingPointRepository;
import com.chargeiq.repository.StationRepository;
import com.chargeiq.repository.VehicleRepository;
import com.chargeiq.security.AuthUser;
import com.chargeiq.util.GeoUtil;
import com.chargeiq.util.TimeUtil;

/**
 * The demand-aware recommendation engine - the heart of VoltSlot.
 * <p>
 * Instead of "nearest station", it ranks stations by a weighted score of six explainable factors and tells the
 * driver <i>why</i>. The pipeline for one request is:
 * <ol>
 *   <li><b>Candidates</b> - ACTIVE stations inside the radius (bounding-box query, then exact haversine distance),
 *       keeping only ACTIVE charging points the vehicle's connector can use.</li>
 *   <li><b>Timing</b> - drive time {@code eta = ceil(km * 1.35 / 24 * 60)} (road factor 1.35, Mumbai average 24 km/h);
 *       {@code arrival = max(requested arrival, now + eta)}; then the <i>earliest free slot</i> on any compatible point
 *       within 12 hours ({@link AvailabilityService#earliestFreeStart}). Wait = slot start - arrival.
 *       A station with no free slot in that window is <b>skipped</b> (it cannot be booked, so it is not a real option).</li>
 *   <li><b>Cost and speed</b> - {@link EstimatorService} at the hour of the slot (peak/off-peak tariff, taper).</li>
 *   <li><b>Crowding</b> - predicted crowding index at the slot start from {@link ForecastService}.</li>
 *   <li><b>Scoring</b> - six components normalised to 0..1 (higher = better):
 *       distance = 1-min(d/radius,1); wait = 1-min(wait/90,1); crowding = 1-index/100;
 *       price = 1-(cost-minCost)/(maxCost-minCost+eps) over the candidates; reliability = score/100;
 *       speed = min(acceptedKw/120,1). {@code score = 100 * sum(weight_i * component_i)}; presets or user weights
 *       (re-normalised to sum 1).</li>
 *   <li><b>Explainability</b> - every item carries per-component {score, weight, contribution} (contributions sum to
 *       the score), human-readable reasons, tags (Nearest/Fastest/Cheapest/Quietest/Best overall), and the response
 *       compares the winner with the nearest compatible station ("saves 40 min and Rs 62").</li>
 * </ol>
 * The result is deterministic: no randomness anywhere, ties are broken by station id.
 */
@Service
@Transactional
public class RecommendationService {

    /**
     * Extra restrictions used by the fleet scheduler and the trip planner.
     *
     * @param notAfter           latest allowed slot START (null = 12 h look-ahead from arrival)
     * @param extraOccupied      point-slots already tentatively used by the caller, keys made with {@link #slotKey}
     * @param excludedStationIds stations that must not be returned
     * @param onlyStationIds     when non-null, only these stations are considered
     */
    public record Constraints(LocalDateTime notAfter, Set<String> extraOccupied, Set<Long> excludedStationIds,
                              Collection<Long> onlyStationIds) {
        public static final Constraints NONE = new Constraints(null, Set.of(), Set.of(), null);
    }

    // ---- model constants (see 20_backend_spec.md) ----
    static final double ROAD_FACTOR = 1.35;
    static final double AVG_SPEED_KMH = 24.0;
    static final int HORIZON_HOURS = 12;
    static final double WAIT_NORMALISER_MIN = 90.0;
    static final double SPEED_NORMALISER_KW = 120.0;
    static final double PRICE_EPSILON = 1e-6;
    static final double DEFAULT_RADIUS_KM = 25.0;
    static final int DEFAULT_LIMIT = 8;
    static final int DEFAULT_SOC_START = 20;
    static final int DEFAULT_SOC_TARGET = 80;

    /** Component order used for weights, arrays and the breakdown map. */
    static final List<String> COMPONENTS = List.of("distance", "wait", "crowding", "price", "reliability", "speed");

    private static final List<String> ALL_CONNECTORS = List.of("CCS2", "TYPE2", "CHADEMO", "LECCS", "BHARAT_DC");
    private static final DateTimeFormatter HHMM = DateTimeFormatter.ofPattern("HH:mm");
    private static final String RUPEE = "₹";

    /** Preset weights in COMPONENTS order: distance, wait, crowding, price, reliability, speed. */
    private static final Map<Preset, double[]> PRESET_WEIGHTS = new EnumMap<>(Preset.class);

    static {
        PRESET_WEIGHTS.put(Preset.BALANCED, new double[]{0.22, 0.22, 0.20, 0.14, 0.12, 0.10});
        PRESET_WEIGHTS.put(Preset.FASTEST, new double[]{0.20, 0.25, 0.05, 0.05, 0.05, 0.40});
        PRESET_WEIGHTS.put(Preset.CHEAPEST, new double[]{0.15, 0.10, 0.10, 0.50, 0.10, 0.05});
        PRESET_WEIGHTS.put(Preset.LEAST_CROWDED, new double[]{0.15, 0.20, 0.45, 0.05, 0.10, 0.05});
    }

    private final StationRepository stations;
    private final ChargingPointRepository points;
    private final VehicleRepository vehicles;
    private final EstimatorService estimator;
    private final AvailabilityService availability;
    private final ForecastService forecast;
    private final StationService stationService;
    private final AppClock clock;

    public RecommendationService(StationRepository stations, ChargingPointRepository points, VehicleRepository vehicles,
                                 EstimatorService estimator, AvailabilityService availability, ForecastService forecast,
                                 StationService stationService, AppClock clock) {
        this.stations = stations;
        this.points = points;
        this.vehicles = vehicles;
        this.estimator = estimator;
        this.availability = availability;
        this.forecast = forecast;
        this.stationService = stationService;
        this.clock = clock;
    }

    /** Key of one point-slot inside {@link Constraints#extraOccupied()}. */
    public static String slotKey(Long pointId, LocalDateTime slotStart) {
        return pointId + "|" + slotStart;
    }

    public RecommendationResponse recommend(RecommendationRequest req, AuthUser actorOrNull) {
        return recommend(req, actorOrNull, Constraints.NONE);
    }

    /** One station option after timing/cost/crowding were worked out (before scoring). */
    private record Candidate(Station station, double distanceKm, int etaMinutes, LocalDateTime arrival,
                             ChargingPoint point, EstimateResponse est, LocalDateTime slotStart, int waitMinutes,
                             double crowding) { }

    /** A candidate with its normalised components and raw score. */
    private record Scored(Candidate c, double[] comp, double raw, long sortKey) { }

    @Transactional(readOnly = true)
    public RecommendationResponse recommend(RecommendationRequest req, AuthUser actorOrNull, Constraints c) {
        Constraints cons = c == null ? Constraints.NONE : c;
        LocalDateTime now = clock.now();

        // ---------- 1. inputs and defaults ----------
        double radius = req.radiusKm() == null ? DEFAULT_RADIUS_KM : req.radiusKm();
        int limit = req.limit() == null ? DEFAULT_LIMIT : Math.max(1, req.limit());
        int socStart = req.socStart() == null ? DEFAULT_SOC_START : req.socStart();
        int socTarget = req.socTarget() == null ? DEFAULT_SOC_TARGET : req.socTarget();
        if (socTarget <= socStart) {
            throw new BadRequestException("socTarget must be greater than socStart");
        }
        EstimatorService.VehicleSpec spec = resolveSpec(req, actorOrNull);
        LocalDateTime requested = req.arrivalTime() == null ? now : req.arrivalTime();
        // Earliest moment the driver could possibly be at a charger (zero distance); basis of "time to start charging".
        LocalDateTime base = requested.isAfter(now) ? requested : now;

        boolean customWeights = hasCustomWeights(req.weights());
        Preset basePreset = req.preset() == null ? Preset.BALANCED : req.preset();
        double[] w = resolveWeights(basePreset, req.weights());
        Preset reportedPreset = customWeights ? null : basePreset;
        WeightsDto weightsDto = new WeightsDto(round4(w[0]), round4(w[1]), round4(w[2]), round4(w[3]), round4(w[4]), round4(w[5]));
        double energyNeeded = round2((socTarget - socStart) / 100.0 * spec.batteryKwh() / 0.92);

        // ---------- 2. candidate stations: bounding box, then haversine ----------
        double lat = req.latitude();
        double lon = req.longitude();
        double dLat = GeoUtil.latDegrees(radius);
        double dLon = GeoUtil.lonDegrees(radius, lat);
        List<Station> inBox = stations.findInBox(StationStatus.ACTIVE, lat - dLat, lat + dLat, lon - dLon, lon + dLon);

        Set<Long> excluded = cons.excludedStationIds() == null ? Set.of() : cons.excludedStationIds();
        Set<Long> only = cons.onlyStationIds() == null ? null : new HashSet<>(cons.onlyStationIds());
        Map<Long, Double> distanceById = new HashMap<>();
        List<Station> nearby = new ArrayList<>();
        for (Station s : inBox) {
            if (excluded.contains(s.getId()) || (only != null && !only.contains(s.getId()))) {
                continue;
            }
            double d = GeoUtil.haversineKm(lat, lon, s.getLatitude(), s.getLongitude());
            if (d <= radius) {
                nearby.add(s);
                distanceById.put(s.getId(), d);
            }
        }
        nearby.sort(Comparator.comparing(Station::getId));
        if (nearby.isEmpty()) {
            return emptyResponse(now, reportedPreset, weightsDto, energyNeeded);
        }

        // ---------- 3. compatible ACTIVE points per station (one query) ----------
        List<Long> stationIds = new ArrayList<>();
        for (Station s : nearby) {
            stationIds.add(s.getId());
        }
        Map<Long, List<ChargingPoint>> compatibleByStation = new HashMap<>();
        Map<Long, Integer> slotsByPoint = new HashMap<>();
        List<Long> pointIds = new ArrayList<>();
        int maxSlots = 1;
        for (ChargingPoint p : points.findByStationIdInOrderByIdAsc(stationIds)) {
            if (p.getStatus() != PointStatus.ACTIVE || !estimator.compatible(spec, p)) {
                continue;
            }
            compatibleByStation.computeIfAbsent(p.getStation().getId(), k -> new ArrayList<>()).add(p);
            // Duration does not depend on the start time, so the number of slots can be fixed per point up front.
            int n = estimator.estimate(spec, p, null, socStart, socTarget).slots();
            slotsByPoint.put(p.getId(), n);
            pointIds.add(p.getId());
            maxSlots = Math.max(maxSlots, n);
        }

        // ---------- 4. arrival times and ONE occupancy query for the whole search window ----------
        Map<Long, Integer> etaById = new HashMap<>();
        Map<Long, LocalDateTime> arrivalById = new HashMap<>();
        Map<Long, Integer> horizonById = new HashMap<>();
        LocalDateTime maxArrival = base;
        int maxHorizon = HORIZON_HOURS;
        for (Station s : nearby) {
            double d = distanceById.get(s.getId());
            int eta = (int) Math.ceil(d * ROAD_FACTOR / AVG_SPEED_KMH * 60);
            LocalDateTime arrival = now.plusMinutes(eta).isAfter(requested) ? now.plusMinutes(eta) : requested;
            etaById.put(s.getId(), eta);
            arrivalById.put(s.getId(), arrival);
            int horizon = HORIZON_HOURS;
            if (cons.notAfter() != null) {
                long minutes = Duration.between(arrival, cons.notAfter()).toMinutes();
                horizon = (int) Math.max(0, (minutes + 59) / 60);
            }
            horizonById.put(s.getId(), horizon);
            maxHorizon = Math.max(maxHorizon, horizon);
            if (arrival.isAfter(maxArrival)) {
                maxArrival = arrival;
            }
        }
        LocalDateTime windowFrom = TimeUtil.floorToSlot(base);
        LocalDateTime windowTo = maxArrival.plusHours(maxHorizon).plusMinutes((long) (maxSlots + 1) * TimeUtil.SLOT_MINUTES);
        Map<Long, Set<LocalDateTime>> occupied = availability.occupiedSlots(pointIds, windowFrom, windowTo);
        Map<Long, Set<LocalDateTime>> extra = parseExtra(cons.extraOccupied());

        // ---------- 5. best point + earliest slot per station ----------
        List<Candidate> candidates = new ArrayList<>();
        for (Station s : nearby) {
            List<ChargingPoint> compat = compatibleByStation.get(s.getId());
            if (compat == null) {
                continue; // no ACTIVE point this vehicle can use -> station is not an option at all
            }
            LocalDateTime arrival = arrivalById.get(s.getId());
            int horizon = horizonById.get(s.getId());
            Candidate best = null;
            for (ChargingPoint p : compat) {
                Set<LocalDateTime> taken = occupiedFor(p.getId(), occupied, extra);
                LocalDateTime start = availability.earliestFreeStart(s, taken, arrival, slotsByPoint.get(p.getId()), horizon);
                if (start == null || (cons.notAfter() != null && start.isAfter(cons.notAfter()))) {
                    continue;
                }
                EstimateResponse est = estimator.estimate(spec, p, start, socStart, socTarget);
                if (best == null || better(start, est, p, best)) {
                    int wait = (int) Duration.between(arrival, start).toMinutes();
                    double crowd = forecast.crowdingIndex(s.getId(), start);
                    best = new Candidate(s, distanceById.get(s.getId()), etaById.get(s.getId()), arrival, p, est, start, wait, crowd);
                }
            }
            // Stations with no free slot inside the look-ahead horizon are skipped on purpose: the driver could not
            // book them, so ranking them would only produce a recommendation that fails at booking time.
            if (best != null) {
                candidates.add(best);
            }
        }
        if (candidates.isEmpty()) {
            return emptyResponse(now, reportedPreset, weightsDto, energyNeeded);
        }

        // ---------- 6. normalise and score ----------
        double minCost = Double.MAX_VALUE;
        double maxCost = -Double.MAX_VALUE;
        for (Candidate cd : candidates) {
            double cost = cd.est().estimatedCost().doubleValue();
            minCost = Math.min(minCost, cost);
            maxCost = Math.max(maxCost, cost);
        }
        List<Scored> scored = new ArrayList<>();
        for (Candidate cd : candidates) {
            double[] comp = new double[6];
            comp[0] = 1 - Math.min(cd.distanceKm() / radius, 1.0);
            comp[1] = 1 - Math.min(cd.waitMinutes() / WAIT_NORMALISER_MIN, 1.0);
            comp[2] = 1 - clamp01(cd.crowding() / 100.0);
            comp[3] = 1 - (cd.est().estimatedCost().doubleValue() - minCost) / (maxCost - minCost + PRICE_EPSILON);
            comp[4] = clamp01(cd.station().getReliabilityScore() / 100.0);
            comp[5] = Math.min(cd.est().acceptedKw() / SPEED_NORMALISER_KW, 1.0);
            double sum = 0;
            for (int i = 0; i < 6; i++) {
                comp[i] = clamp01(comp[i]);
                sum += w[i] * comp[i];
            }
            double raw = 100.0 * sum;
            // compare on a 1e-9 grid so floating point noise can never reorder equal scores; id breaks real ties
            scored.add(new Scored(cd, comp, raw, Math.round(raw * 1e9)));
        }
        scored.sort(Comparator.comparingLong(Scored::sortKey).reversed()
                .thenComparing(sc -> sc.c().station().getId()));
        List<Scored> top = new ArrayList<>(scored.subList(0, Math.min(limit, scored.size())));

        // ---------- 7. nearest compatible station = baseline for the savings headline ----------
        Candidate baseline = candidates.get(0);
        for (Candidate cd : candidates) {
            if (cd.distanceKm() < baseline.distanceKm()
                    || (cd.distanceKm() == baseline.distanceKm() && cd.station().getId() < baseline.station().getId())) {
                baseline = cd;
            }
        }

        // ---------- 8. station cards: ONE bulk call for everything we return ----------
        List<Station> toSummarise = new ArrayList<>();
        Map<Long, Double> dist2 = new HashMap<>();
        for (Scored sc : top) {
            toSummarise.add(sc.c().station());
            dist2.put(sc.c().station().getId(), round2(sc.c().distanceKm()));
        }
        Map<Long, StationSummaryDto> summaryById = new HashMap<>();
        for (StationSummaryDto dto : stationService.summaries(toSummarise, dist2)) {
            summaryById.put(dto.id(), dto);
        }

        // ---------- 9. tags among the returned items ----------
        Map<Long, List<String>> tags = new HashMap<>();
        for (Scored sc : top) {
            tags.put(sc.c().station().getId(), new ArrayList<>());
        }
        tag(top, tags, "Nearest", Comparator.comparingDouble((Scored s) -> s.c().distanceKm()));
        tag(top, tags, "Fastest", Comparator.comparingInt((Scored s) -> s.c().waitMinutes() + s.c().est().durationMinutes()));
        tag(top, tags, "Cheapest", Comparator.comparing((Scored s) -> s.c().est().estimatedCost()));
        tag(top, tags, "Quietest", Comparator.comparingDouble((Scored s) -> s.c().crowding()));
        tags.get(top.get(0).c().station().getId()).add(0, "Best overall");

        // ---------- 10. build response items ----------
        List<RecommendedItem> items = new ArrayList<>();
        int rank = 1;
        for (Scored sc : top) {
            items.add(toItem(rank++, sc, w, summaryById.get(sc.c().station().getId()), baseline, tags.get(sc.c().station().getId()),
                    socStart, socTarget));
        }
        Baseline baselineDto = new Baseline(baseline.station().getId(), baseline.station().getName(),
                round2(baseline.distanceKm()), baseline.etaMinutes(), baseline.waitMinutes(), round1(baseline.crowding()),
                baseline.est().estimatedCost());
        Savings savings = savings(top.get(0).c(), baseline, base);

        return new RecommendationResponse(now, reportedPreset, weightsDto, energyNeeded, items, baselineDto, savings);
    }

    // ================================================================== helpers

    /** Vehicle (with access check) -> explicit connectors -> "any connector" generic car. */
    private EstimatorService.VehicleSpec resolveSpec(RecommendationRequest req, AuthUser actor) {
        if (req.vehicleId() != null) {
            Long vid = req.vehicleId();
            Vehicle v = vehicles.findById(vid).orElseThrow(() -> new ResourceNotFoundException("Vehicle", vid));
            if (actor != null && !actor.isAdmin()) {
                boolean owner = v.getUser() != null && actor.getId().equals(v.getUser().getId());
                boolean sameFleet = v.getFleet() != null && actor.getFleetId() != null
                        && actor.getFleetId().equals(v.getFleet().getId());
                if (!owner && !sameFleet) {
                    throw new ForbiddenException("You cannot use this vehicle");
                }
            }
            return EstimatorService.specOf(v.getModel());
        }
        if (req.connectorCodes() != null && !req.connectorCodes().isEmpty()) {
            return EstimatorService.genericSpec(req.connectorCodes());
        }
        return EstimatorService.genericSpec(ALL_CONNECTORS);
    }

    private static boolean hasCustomWeights(WeightsDto cw) {
        return cw != null && (cw.distance() != null || cw.waiting() != null || cw.crowding() != null
                || cw.price() != null || cw.reliability() != null || cw.speed() != null);
    }

    /**
     * Preset weights, overridden by any custom value that was supplied, then re-normalised so they sum to 1.
     * Negative values count as 0; if everything is 0 the preset is used.
     */
    static double[] resolveWeights(Preset preset, WeightsDto cw) {
        double[] presetW = PRESET_WEIGHTS.get(preset);
        double[] w = presetW.clone();
        if (cw != null) {
            Double[] given = {cw.distance(), cw.waiting(), cw.crowding(), cw.price(), cw.reliability(), cw.speed()};
            for (int i = 0; i < 6; i++) {
                if (given[i] != null && !given[i].isNaN()) {
                    w[i] = Math.max(0.0, given[i]);
                }
            }
        }
        double sum = 0;
        for (double x : w) {
            sum += x;
        }
        if (sum <= 0) {
            w = presetW.clone();
            sum = 0;
            for (double x : w) {
                sum += x;
            }
        }
        for (int i = 0; i < 6; i++) {
            w[i] = w[i] / sum;
        }
        return w;
    }

    /** True when (start, cost, point) beats the current best: earlier start, then cheaper, then lower point id. */
    private static boolean better(LocalDateTime start, EstimateResponse est, ChargingPoint p, Candidate best) {
        int byStart = start.compareTo(best.slotStart());
        if (byStart != 0) {
            return byStart < 0;
        }
        int byCost = est.estimatedCost().compareTo(best.est().estimatedCost());
        if (byCost != 0) {
            return byCost < 0;
        }
        return p.getId() < best.point().getId();
    }

    /** Taken slots of one point = DB occupancy + the caller's tentative reservations. */
    private static Set<LocalDateTime> occupiedFor(Long pointId, Map<Long, Set<LocalDateTime>> db,
                                                  Map<Long, Set<LocalDateTime>> extra) {
        Set<LocalDateTime> base = db.get(pointId);
        Set<LocalDateTime> add = extra.get(pointId);
        if (add == null || add.isEmpty()) {
            return base == null ? Set.of() : base;
        }
        Set<LocalDateTime> merged = new HashSet<>();
        if (base != null) {
            merged.addAll(base);
        }
        merged.addAll(add);
        return merged;
    }

    /** Splits "pointId|slotStart" keys into a per-point set; malformed keys are ignored. */
    private static Map<Long, Set<LocalDateTime>> parseExtra(Set<String> keys) {
        Map<Long, Set<LocalDateTime>> out = new HashMap<>();
        if (keys == null) {
            return out;
        }
        for (String k : keys) {
            int bar = k.indexOf('|');
            if (bar <= 0) {
                continue;
            }
            try {
                Long pid = Long.valueOf(k.substring(0, bar));
                LocalDateTime t = LocalDateTime.parse(k.substring(bar + 1));
                out.computeIfAbsent(pid, x -> new HashSet<>()).add(t);
            } catch (RuntimeException ignored) {
                // skip malformed key
            }
        }
        return out;
    }

    /** Adds {@code label} to the item that is minimal under {@code order} (ties -> lower station id). */
    private static void tag(List<Scored> items, Map<Long, List<String>> tags, String label, Comparator<Scored> order) {
        Scored winner = items.get(0);
        for (Scored s : items) {
            int cmp = order.compare(s, winner);
            if (cmp < 0 || (cmp == 0 && s.c().station().getId() < winner.c().station().getId())) {
                winner = s;
            }
        }
        tags.get(winner.c().station().getId()).add(label);
    }

    private RecommendedItem toItem(int rank, Scored sc, double[] w, StationSummaryDto station, Candidate baseline,
                                   List<String> tagList, int socStart, int socTarget) {
        Candidate c = sc.c();

        // Breakdown in hundredths of a score point; the score is the exact sum so the UI can show "a + b + c = total".
        Map<String, ComponentScore> breakdown = new LinkedHashMap<>();
        long hundredths = 0;
        for (int i = 0; i < 6; i++) {
            long h = Math.round(w[i] * sc.comp()[i] * 10000.0);
            hundredths += h;
            breakdown.put(COMPONENTS.get(i), new ComponentScore(round4(sc.comp()[i]), round4(w[i]), h / 100.0));
        }
        double score = hundredths / 100.0;

        ChargingPoint p = c.point();
        PointRef ref = new PointRef(p.getId(), p.getLabel(), p.getConnectorType().getCode(), p.getPowerKw(), p.getTariffPerKwh());
        int slots = c.est().slots();
        LocalDateTime slotEnd = c.slotStart().plusMinutes((long) slots * TimeUtil.SLOT_MINUTES);

        return new RecommendedItem(rank, score, station, ref, c.etaMinutes(), c.arrival(), c.slotStart(), slotEnd, slots,
                c.waitMinutes(), c.est().durationMinutes(), c.est().estimatedCost(), c.est().effectiveTariff(),
                round1(c.crowding()), ForecastService.level(c.crowding()), breakdown,
                reasons(c, baseline, socStart, socTarget), List.copyOf(tagList));
    }

    /** Plain-English explanation of why this station was picked (always at least distance, wait and crowding). */
    private List<String> reasons(Candidate c, Candidate baseline, int socStart, int socTarget) {
        List<String> out = new ArrayList<>();
        out.add(String.format(Locale.ROOT, "%.1f km away, ~%d min drive", c.distanceKm(), c.etaMinutes()));
        if (c.waitMinutes() == 0) {
            out.add("No wait: slot free at " + HHMM.format(c.slotStart()));
        } else {
            out.add("Slot free at " + HHMM.format(c.slotStart()) + " (" + c.waitMinutes() + " min after you arrive)");
        }
        out.add(String.format(Locale.ROOT, "Predicted crowding %s (%d) at that hour",
                ForecastService.level(c.crowding()), Math.round(c.crowding())));
        out.add(String.format(Locale.ROOT, "Charges at up to %.0f kW - about %d min for %d%% to %d%%",
                c.est().acceptedKw(), c.est().durationMinutes(), socStart, socTarget));

        boolean isBaseline = c.station().getId().equals(baseline.station().getId());
        if (!isBaseline) {
            BigDecimal cheaper = baseline.est().estimatedCost().subtract(c.est().estimatedCost());
            if (cheaper.compareTo(BigDecimal.ONE) >= 0) {
                out.add(RUPEE + cheaper.setScale(0, RoundingMode.HALF_UP).toPlainString() + " cheaper than the nearest station");
            }
            int lessWait = baseline.waitMinutes() - c.waitMinutes();
            if (lessWait >= 5) {
                out.add(lessWait + " min less waiting than the nearest station");
            }
        } else {
            out.add("Your nearest compatible station");
        }
        if (c.station().getReliabilityScore() >= 80) {
            out.add(String.format(Locale.ROOT, "Highly reliable station (score %.0f)", c.station().getReliabilityScore()));
        }
        return out;
    }

    /**
     * Headline comparison against the nearest compatible station.
     * Time = minutes from the earliest possible arrival ({@code base}) until charging can start (drive + wait).
     * Negative differences are reported as 0 - the engine may trade a little time or money for a quieter, more
     * reliable or faster station, and the summary says so.
     */
    private Savings savings(Candidate best, Candidate baseline, LocalDateTime base) {
        if (best.station().getId().equals(baseline.station().getId())) {
            return new Savings(0, BigDecimal.ZERO.setScale(2),
                    "Your nearest compatible station is also the best match - no detour needed.");
        }
        long baselineMin = Duration.between(base, baseline.slotStart()).toMinutes();
        long bestMin = Duration.between(base, best.slotStart()).toMinutes();
        int minutesSaved = (int) Math.max(0, baselineMin - bestMin);
        BigDecimal rupeesSaved = baseline.est().estimatedCost().subtract(best.est().estimatedCost())
                .max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);

        String summary;
        String name = baseline.station().getName();
        if (minutesSaved > 0 && rupeesSaved.compareTo(BigDecimal.ONE) >= 0) {
            summary = "Saves " + minutesSaved + " min and " + RUPEE + rupeesSaved.setScale(0, RoundingMode.HALF_UP).toPlainString()
                    + " compared with the nearest station (" + name + ").";
        } else if (minutesSaved > 0) {
            summary = "Saves " + minutesSaved + " min compared with the nearest station (" + name + ").";
        } else if (rupeesSaved.compareTo(BigDecimal.ONE) >= 0) {
            summary = "Saves " + RUPEE + rupeesSaved.setScale(0, RoundingMode.HALF_UP).toPlainString()
                    + " compared with the nearest station (" + name + ").";
        } else {
            summary = "Similar time and cost to the nearest station (" + name + "), with better crowding, speed or reliability.";
        }
        return new Savings(minutesSaved, rupeesSaved, summary);
    }

    private RecommendationResponse emptyResponse(LocalDateTime now, Preset preset, WeightsDto weights, double energy) {
        return new RecommendationResponse(now, preset, weights, energy, List.of(), null,
                new Savings(0, BigDecimal.ZERO.setScale(2), "No compatible station with a free slot was found nearby."));
    }

    private static double clamp01(double x) {
        return Math.max(0.0, Math.min(1.0, x));
    }

    private static double round1(double x) {
        return Math.round(x * 10.0) / 10.0;
    }

    private static double round2(double x) {
        return Math.round(x * 100.0) / 100.0;
    }

    private static double round4(double x) {
        return Math.round(x * 10000.0) / 10000.0;
    }
}
