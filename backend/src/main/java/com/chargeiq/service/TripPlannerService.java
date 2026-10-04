package com.chargeiq.service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.chargeiq.clock.AppClock;
import com.chargeiq.dto.RecommendationDtos.RecommendationRequest;
import com.chargeiq.dto.RecommendationDtos.RecommendationResponse;
import com.chargeiq.dto.RecommendationDtos.RecommendedItem;
import com.chargeiq.dto.TripDtos.TripLeg;
import com.chargeiq.dto.TripDtos.TripRequest;
import com.chargeiq.dto.TripDtos.TripResponse;
import com.chargeiq.entity.ChargingPoint;
import com.chargeiq.entity.Station;
import com.chargeiq.entity.Vehicle;
import com.chargeiq.entity.VehicleModel;
import com.chargeiq.entity.enums.CurrentType;
import com.chargeiq.entity.enums.PointStatus;
import com.chargeiq.entity.enums.Preset;
import com.chargeiq.entity.enums.StationStatus;
import com.chargeiq.repository.ChargingPointRepository;
import com.chargeiq.repository.StationRepository;
import com.chargeiq.security.AuthUser;
import com.chargeiq.service.RecommendationService.Constraints;
import com.chargeiq.util.GeoUtil;

/**
 * Trip planner: "I am driving from A to B with X % battery - where do I charge?".
 *
 * <p><b>Model (deliberately simple and explainable):</b>
 * <ul>
 *   <li>The route is the straight line A-B; road distance = straight-line x 1.3 (road factor).</li>
 *   <li>Speed blend: the first 20 road-km at 28 km/h (city), the rest at 45 km/h (highway).</li>
 *   <li>Usable range = vehicle range x (SoC - reserve) / 100. The reserve is 10 % unless the caller says otherwise.
 *       Without a vehicle a generic 250 km CCS2 car is assumed.</li>
 *   <li>If the destination is within usable range there is no stop. Otherwise we look for stations that are
 *       (a) within 6 km of the line (corridor, via {@link GeoUtil#projectOnLine}),
 *       (b) between 35 % and 85 % of the reachable distance ahead of us and
 *       (c) have a DC point compatible with the vehicle. They are ranked by the {@link RecommendationService}
 *       (BALANCED, restricted to those ids via {@code Constraints.onlyStationIds}) at the computed arrival time.</li>
 *   <li>At the stop we charge only as much as the rest of the trip needs (at most 80 % because DC charging
 *       slows down above 80 %). The loop repeats until the destination is reachable.</li>
 * </ul>
 * It is an approximation (no real road network) and says so in the response notes.</p>
 */
@Service
@Transactional
public class TripPlannerService {

    private static final double ROAD_FACTOR = 1.3;
    private static final double CITY_KMH = 28.0;
    private static final double HIGHWAY_KMH = 45.0;
    private static final double CITY_KM = 20.0;
    private static final double CORRIDOR_KM = 6.0;
    private static final double WINDOW_FROM = 0.35;
    private static final double WINDOW_TO = 0.85;
    private static final double IDEAL_AT = 0.60;
    private static final int MAX_STOPS = 6;
    private static final int GENERIC_RANGE_KM = 250;
    private static final int DEFAULT_RESERVE = 10;
    private static final int MAX_TARGET_SOC = 80;

    private final VehicleService vehicleService;
    private final RecommendationService recommendation;
    private final StationRepository stations;
    private final ChargingPointRepository points;
    private final EstimatorService estimator;
    private final ForecastService forecast;
    private final StationService stationService;
    private final AppClock clock;

    public TripPlannerService(VehicleService vehicleService, RecommendationService recommendation, StationRepository stations,
                              ChargingPointRepository points, EstimatorService estimator, ForecastService forecast,
                              StationService stationService, AppClock clock) {
        this.vehicleService = vehicleService;
        this.recommendation = recommendation;
        this.stations = stations;
        this.points = points;
        this.estimator = estimator;
        this.forecast = forecast;
        this.stationService = stationService;
        this.clock = clock;
    }

    /** A station near the route line that owns at least one DC point the vehicle can use. */
    private record Candidate(Station station, double alongKm, Set<Long> dcPointIds) { }

    /** Plans the trip. {@code actorOrNull} may be null (public endpoint). */
    @Transactional(readOnly = true)
    public TripResponse plan(TripRequest r, AuthUser actorOrNull) {
        LocalDateTime departAt = r.departAt() != null ? r.departAt() : clock.now();
        int reserve = r.reserveSocPercent() == null ? DEFAULT_RESERVE : r.reserveSocPercent();
        int startSoc = r.startSocPercent();
        List<String> notes = new ArrayList<>();

        // ---- vehicle (or the generic car)
        EstimatorService.VehicleSpec spec;
        int rangeKm;
        Long vehicleId = r.vehicleId();
        if (vehicleId != null) {
            Vehicle v = vehicleService.requireAccessible(vehicleId, actorOrNull);
            VehicleModel m = v.getModel();
            spec = EstimatorService.specOf(m);
            rangeKm = m.getRangeKm();
            notes.add("Vehicle: " + m.getMake() + " " + m.getModel() + " (range about " + rangeKm + " km).");
        } else {
            spec = EstimatorService.genericSpec(Set.of("CCS2"));
            rangeKm = GENERIC_RANGE_KM;
            notes.add("No vehicle selected - assuming a generic car with " + GENERIC_RANGE_KM + " km range and a CCS2 port.");
        }

        // ---- geometry
        double oLat = r.originLat();
        double oLon = r.originLon();
        double dLat = r.destLat();
        double dLon = r.destLon();
        double straightKm = GeoUtil.haversineKm(oLat, oLon, dLat, dLon);
        double totalRoadKm = straightKm * ROAD_FACTOR;
        boolean needsCharging = totalRoadKm > usableRange(rangeKm, startSoc, reserve);

        List<double[]> polyline = new ArrayList<>();
        polyline.add(new double[]{oLat, oLon});
        List<TripLeg> legs = new ArrayList<>();
        List<Candidate> corridor = null;       // loaded lazily, only when a stop is needed

        double curLat = oLat;
        double curLon = oLon;
        double curSoc = startSoc;
        LocalDateTime time = departAt;
        int drivingMinutes = 0;
        int stops = 0;
        boolean feasible = true;
        boolean reachedDestination = false;
        int arrivalSoc = 0;

        while (true) {
            double remainingRoad = GeoUtil.haversineKm(curLat, curLon, dLat, dLon) * ROAD_FACTOR;
            double reachableRoad = usableRange(rangeKm, curSoc, reserve);

            // ---- destination reachable: final drive leg
            if (remainingRoad <= reachableRoad) {
                int minutes = driveMinutes(remainingRoad);
                double endSoc = Math.max(0, curSoc - remainingRoad / rangeKm * 100.0);
                legs.add(driveLeg(curLat, curLon, dLat, dLon, remainingRoad, minutes, curSoc, endSoc, time));
                time = time.plusMinutes(minutes);
                drivingMinutes += minutes;
                arrivalSoc = (int) Math.round(endSoc);
                polyline.add(new double[]{dLat, dLon});
                reachedDestination = true;
                break;
            }
            // ---- need a charging stop
            if (reachableRoad <= 0) {
                feasible = false;
                notes.add("The starting charge (" + startSoc + " %) is at or below the " + reserve
                        + " % reserve, so no leg can be driven safely. Charge first or lower the reserve.");
                break;
            }
            if (stops >= MAX_STOPS) {
                feasible = false;
                notes.add("More than " + MAX_STOPS + " charging stops would be needed - trip not planned.");
                break;
            }
            if (corridor == null) {
                corridor = loadCorridor(oLat, oLon, dLat, dLon, spec);
            }
            double posAlong = GeoUtil.projectOnLine(oLat, oLon, dLat, dLon, curLat, curLon)[0];
            double reachStraight = reachableRoad / ROAD_FACTOR;
            double lo = posAlong + WINDOW_FROM * reachStraight;
            double hi = Math.min(posAlong + WINDOW_TO * reachStraight, straightKm);
            List<Candidate> inWindow = new ArrayList<>();
            for (Candidate c : corridor) {
                if (c.alongKm() >= lo && c.alongKm() <= hi) {
                    inWindow.add(c);
                }
            }
            if (inWindow.isEmpty()) {
                feasible = false;
                notes.add(String.format("No compatible DC fast-charging station within %.0f km of the route between %.0f and %.0f km "
                        + "(straight-line, measured from the origin). Start with a higher charge or pick another route.",
                        CORRIDOR_KM, lo, hi));
                break;
            }

            // Where on the line would we ideally like to stop? Use it as the "user location" for ranking and
            // to estimate the battery state we will arrive with and how much we need to charge.
            double idealAlong = Math.min(posAlong + IDEAL_AT * reachStraight, straightKm);
            double frac = straightKm <= 0 ? 0 : idealAlong / straightKm;
            double iLat = oLat + (dLat - oLat) * frac;
            double iLon = oLon + (dLon - oLon) * frac;
            double toIdealRoad = Math.max(0, (idealAlong - posAlong) * ROAD_FACTOR);
            int arrivalSocEst = (int) Math.max(1, Math.min(99, Math.round(curSoc - toIdealRoad / rangeKm * 100.0)));
            double remainingAfterRoad = Math.max(0, (straightKm - idealAlong) * ROAD_FACTOR);
            int needed = (int) Math.ceil(reserve + remainingAfterRoad / rangeKm * 100.0 + 5);
            int target = Math.min(100, Math.max(arrivalSocEst + 10, Math.min(MAX_TARGET_SOC, needed)));
            LocalDateTime arrivalAtIdeal = time.plusMinutes(driveMinutes(toIdealRoad));

            Set<Long> ids = new HashSet<>();
            Map<Long, Candidate> byId = new HashMap<>();
            for (Candidate c : inWindow) {
                ids.add(c.station().getId());
                byId.put(c.station().getId(), c);
            }
            double radius = Math.max(25.0, reachStraight * 0.5 + CORRIDOR_KM + 5);
            RecommendationRequest req = new RecommendationRequest(iLat, iLon, vehicleId,
                    vehicleId == null ? List.of("CCS2") : null, arrivalAtIdeal, arrivalSocEst, target,
                    Preset.BALANCED, null, radius, 8);
            RecommendationResponse resp = recommendation.recommend(req, actorOrNull, new Constraints(null, Set.of(), Set.of(), ids));
            List<RecommendedItem> items = resp == null || resp.items() == null ? List.of() : resp.items();

            // Prefer the best-ranked item that sits on a DC point; fall back to the best-ranked item.
            RecommendedItem chosen = null;
            for (RecommendedItem it : items) {
                Candidate c = byId.get(it.station().id());
                if (c != null && c.dcPointIds().contains(it.point().pointId())) {
                    chosen = it;
                    break;
                }
            }
            if (chosen == null) {
                for (RecommendedItem it : items) {
                    if (byId.containsKey(it.station().id())) {
                        chosen = it;
                        break;
                    }
                }
            }
            if (chosen == null) {
                feasible = false;
                notes.add("Stations exist near the route but none has a free compatible slot for the expected arrival time.");
                break;
            }

            // ---- drive leg to the chosen station (real distance from where we are now)
            double stLat = chosen.station().latitude();
            double stLon = chosen.station().longitude();
            double legRoad = GeoUtil.haversineKm(curLat, curLon, stLat, stLon) * ROAD_FACTOR;
            int legMinutes = driveMinutes(legRoad);
            double socAtStation = Math.max(1, curSoc - legRoad / rangeKm * 100.0);
            legs.add(driveLeg(curLat, curLon, stLat, stLon, legRoad, legMinutes, curSoc, socAtStation, time));
            time = time.plusMinutes(legMinutes);
            drivingMinutes += legMinutes;

            // ---- charge leg (starts at the booked slot; any waiting time is the gap before it)
            LocalDateTime chargeStart = chosen.slotStart().isBefore(time) ? time : chosen.slotStart();
            LocalDateTime chargeEnd = chargeStart.plusMinutes(chosen.chargeMinutes());
            legs.add(new TripLeg("CHARGE", stLat, stLon, stLat, stLon, 0.0, chosen.chargeMinutes(),
                    (int) Math.round(socAtStation), target, chargeStart, chargeEnd, chosen.station(),
                    chosen.point().pointId(), chosen.point().label(), chosen.point().connectorCode(),
                    chosen.slotStart(), chosen.slotEnd(), chosen.crowdingLevel(), chosen.estimatedCost()));
            stops++;
            notes.add("Stop " + stops + ": " + chosen.station().name() + " (" + chosen.station().zone() + "), "
                    + chosen.point().label() + " " + chosen.point().connectorCode() + " " + Math.round(chosen.point().powerKw())
                    + " kW, charge to " + target + " %"
                    + (chosen.waitMinutes() > 0 ? ", expect about " + chosen.waitMinutes() + " min wait for a free slot" : ", no waiting")
                    + ", crowding " + chosen.crowdingLevel() + ".");

            time = chargeEnd;
            curSoc = target;
            curLat = stLat;
            curLon = stLon;
            polyline.add(new double[]{stLat, stLon});
        }

        // ---- notes
        if (!needsCharging) {
            notes.add("Destination is within usable range (" + Math.round(usableRange(rangeKm, startSoc, reserve))
                    + " km at " + startSoc + " % with a " + reserve + " % reserve) - no charging stop needed.");
        }
        if (reachedDestination) {
            notes.add("Expected arrival battery: about " + arrivalSoc + " %.");
        }
        notes.add("Approximate straight-line corridor: road distance is estimated as " + ROAD_FACTOR
                + " x the straight-line distance and speeds blend 28 km/h city with 45 km/h highway; a real navigation app may differ.");

        return new TripResponse(round1(totalRoadKm), drivingMinutes, needsCharging, feasible,
                reachedDestination ? arrivalSoc : 0, departAt, reachedDestination ? time : null, legs, polyline, notes);
    }

    // ------------------------------------------------------------------ helpers

    /** Road kilometres we can still drive from {@code soc} % while keeping the reserve. */
    private static double usableRange(int rangeKm, double soc, int reserve) {
        return Math.max(0, rangeKm * (soc - reserve) / 100.0);
    }

    /** Drive time for a road distance: first 20 km at city speed, the rest at highway speed. */
    static int driveMinutes(double roadKm) {
        double hours = Math.min(roadKm, CITY_KM) / CITY_KMH + Math.max(0, roadKm - CITY_KM) / HIGHWAY_KMH;
        return (int) Math.ceil(hours * 60.0);
    }

    private static double round1(double x) {
        return Math.round(x * 10.0) / 10.0;
    }

    private static TripLeg driveLeg(double fromLat, double fromLon, double toLat, double toLon, double roadKm, int minutes,
                                    double socStart, double socEnd, LocalDateTime start) {
        return new TripLeg("DRIVE", fromLat, fromLon, toLat, toLon, round1(roadKm), minutes,
                (int) Math.round(socStart), (int) Math.round(socEnd), start, start.plusMinutes(minutes),
                null, null, null, null, null, null, null, null);
    }

    /**
     * All ACTIVE stations within the 6 km corridor of the origin-destination line that own at least one ACTIVE DC
     * point compatible with the vehicle. Computed once per request.
     */
    private List<Candidate> loadCorridor(double oLat, double oLon, double dLat, double dLon, EstimatorService.VehicleSpec spec) {
        List<Station> active = stations.findByStatus(StationStatus.ACTIVE);
        Map<Long, Double> alongByStation = new HashMap<>();
        List<Station> near = new ArrayList<>();
        for (Station s : active) {
            double[] ac = GeoUtil.projectOnLine(oLat, oLon, dLat, dLon, s.getLatitude(), s.getLongitude());
            if (ac[1] <= CORRIDOR_KM) {
                near.add(s);
                alongByStation.put(s.getId(), ac[0]);
            }
        }
        if (near.isEmpty()) {
            return List.of();
        }
        List<Long> nearIds = near.stream().map(Station::getId).collect(Collectors.toList());
        Map<Long, Set<Long>> dcPoints = new HashMap<>();
        for (ChargingPoint p : points.findByStationIdInOrderByIdAsc(nearIds)) {
            if (p.getStatus() == PointStatus.ACTIVE && p.getConnectorType().getCurrentType() == CurrentType.DC
                    && estimator.compatible(spec, p)) {
                dcPoints.computeIfAbsent(p.getStation().getId(), k -> new HashSet<>()).add(p.getId());
            }
        }
        List<Candidate> result = new ArrayList<>();
        for (Station s : near) {
            Set<Long> dc = dcPoints.get(s.getId());
            if (dc != null && !dc.isEmpty()) {
                result.add(new Candidate(s, alongByStation.get(s.getId()), dc));
            }
        }
        return result;
    }
}
