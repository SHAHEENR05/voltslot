package com.chargeiq.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.chargeiq.clock.AppClock;
import com.chargeiq.dto.CommonDtos.PageResponse;
import com.chargeiq.dto.ReferenceDtos.AmenityDto;
import com.chargeiq.dto.StationDtos.ConnectorSummary;
import com.chargeiq.dto.StationDtos.PointDto;
import com.chargeiq.dto.StationDtos.SentimentSplit;
import com.chargeiq.dto.StationDtos.StationDetailDto;
import com.chargeiq.dto.StationDtos.StationSummaryDto;
import com.chargeiq.entity.ChargingPoint;
import com.chargeiq.entity.Station;
import com.chargeiq.entity.enums.PointStatus;
import com.chargeiq.entity.enums.SentimentLabel;
import com.chargeiq.entity.enums.StationStatus;
import com.chargeiq.exception.BadRequestException;
import com.chargeiq.exception.ResourceNotFoundException;
import com.chargeiq.repository.BookingSlotRepository;
import com.chargeiq.repository.ChargingPointRepository;
import com.chargeiq.repository.ReviewRepository;
import com.chargeiq.repository.StationRepository;
import com.chargeiq.util.GeoUtil;
import com.chargeiq.util.TimeUtil;

/**
 * The station locator: search with filters/sorting, station detail and the compact "summary" card used everywhere
 * (search results, recommendations, operator list).
 * <p>
 * The station table is small (tens of rows), so filtering, sorting and paging happen in memory after a single
 * bounding-box / status query. The important performance rule is to avoid the N+1 query problem: summaries for many
 * stations are built with <b>one</b> query for all their charging points and <b>one</b> query for "which points are
 * occupied right now", never one query per station.
 */
@Service
@Transactional
public class StationService {

    private final StationRepository stations;
    private final ChargingPointRepository points;
    private final BookingSlotRepository slots;
    private final ReviewRepository reviews;
    private final ForecastService forecast;
    private final AppClock clock;

    public StationService(StationRepository stations, ChargingPointRepository points, BookingSlotRepository slots,
                          ReviewRepository reviews, ForecastService forecast, AppClock clock) {
        this.stations = stations;
        this.points = points;
        this.slots = slots;
        this.reviews = reviews;
        this.forecast = forecast;
        this.clock = clock;
    }

    /**
     * Station search. All parameters are optional.
     *
     * @param lat      with {@code lon}: enables distance; with {@code radiusKm} also restricts to that radius
     * @param connector connector code (e.g. CCS2) - at least one ACTIVE point must have it
     * @param minKw    at least one ACTIVE point (of the requested connector, if given) must deliver this power
     * @param amenity  amenity name (case-insensitive)
     * @param zone     exact zone name (case-insensitive)
     * @param q        case-insensitive "contains" on name, address or zone
     * @param openNow  true = only stations open at the app-clock time; false = only closed ones
     * @param sort     distance | rating | price | reliability (default: distance if lat/lon given, else name)
     */
    @Transactional(readOnly = true)
    public PageResponse<StationSummaryDto> search(Double lat, Double lon, Double radiusKm, String connector, Double minKw,
                                                  String amenity, String zone, String q, Boolean openNow, String sort,
                                                  int page, int size) {
        String sortKey = sort == null || sort.isBlank() ? null : sort.trim().toLowerCase(Locale.ROOT);
        if (sortKey != null && !List.of("distance", "rating", "price", "reliability").contains(sortKey)) {
            throw new BadRequestException("sort must be one of distance, rating, price, reliability");
        }
        boolean hasPosition = lat != null && lon != null;
        LocalDateTime now = clock.now();

        // 1) candidate stations: bounding box (cheap) when a radius is given, otherwise all ACTIVE stations
        List<Station> candidates;
        if (hasPosition && radiusKm != null && radiusKm > 0) {
            candidates = stations.findInBox(StationStatus.ACTIVE,
                    lat - GeoUtil.latDegrees(radiusKm), lat + GeoUtil.latDegrees(radiusKm),
                    lon - GeoUtil.lonDegrees(radiusKm, lat), lon + GeoUtil.lonDegrees(radiusKm, lat));
        } else {
            candidates = stations.findByStatus(StationStatus.ACTIVE);
        }

        // 2) exact distance + cheap filters that need no extra data
        String needle = q == null || q.isBlank() ? null : q.trim().toLowerCase(Locale.ROOT);
        Map<Long, Double> distance = new HashMap<>();
        List<Station> stage = new ArrayList<>();
        for (Station s : candidates) {
            if (hasPosition) {
                double d = GeoUtil.haversineKm(lat, lon, s.getLatitude(), s.getLongitude());
                if (radiusKm != null && radiusKm > 0 && d > radiusKm) {
                    continue;
                }
                distance.put(s.getId(), round2(d));
            }
            if (zone != null && !zone.isBlank() && !s.getZone().equalsIgnoreCase(zone.trim())) {
                continue;
            }
            if (needle != null && !(s.getName().toLowerCase(Locale.ROOT).contains(needle)
                    || s.getAddress().toLowerCase(Locale.ROOT).contains(needle)
                    || s.getZone().toLowerCase(Locale.ROOT).contains(needle))) {
                continue;
            }
            if (openNow != null && isOpen(s, now) != openNow) {
                continue;
            }
            if (amenity != null && !amenity.isBlank()) {
                String a = amenity.trim();
                boolean has = s.getAmenities().stream().anyMatch(x -> x.getName().equalsIgnoreCase(a));
                if (!has) {
                    continue;
                }
            }
            stage.add(s);
        }

        // 3) point based filters (connector / minKw) - one query for all remaining stations
        Map<Long, List<ChargingPoint>> pointsByStation = loadPoints(stage);
        boolean pointFilter = (connector != null && !connector.isBlank()) || (minKw != null && minKw > 0);
        List<Station> kept = new ArrayList<>();
        for (Station s : stage) {
            if (pointFilter && !hasMatchingPoint(pointsByStation.get(s.getId()), connector, minKw)) {
                continue;
            }
            kept.add(s);
        }

        // 4) build summaries (bulk), sort, page
        List<StationSummaryDto> all = new ArrayList<>(build(kept, hasPosition ? distance : null, pointsByStation, now));
        all.sort(comparatorFor(sortKey, hasPosition));
        return PageResponse.ofList(all, page, size);
    }

    /** Station card plus amenities, points, rating histogram and sentiment split. */
    @Transactional(readOnly = true)
    public StationDetailDto detail(Long id) {
        Station s = require(id);
        StationSummaryDto summary = summary(s, null);

        List<AmenityDto> amenities = s.getAmenities().stream()
                .sorted(Comparator.comparing(a -> a.getName()))
                .map(a -> new AmenityDto(a.getId(), a.getName(), a.getIcon()))
                .collect(java.util.stream.Collectors.toList());

        List<PointDto> pts = new ArrayList<>();
        for (ChargingPoint p : points.findByStationIdOrderByIdAsc(id)) {
            pts.add(toPointDto(p));
        }

        // rating histogram 1..5 (zeros included so the chart always has five bars)
        Map<Integer, Long> breakdown = new TreeMap<>();
        for (int r = 1; r <= 5; r++) {
            breakdown.put(r, 0L);
        }
        // row = [rating, count]
        for (Object[] row : reviews.ratingCounts(id)) {
            breakdown.put(((Number) row[0]).intValue(), ((Number) row[1]).longValue());
        }

        // sentiment split in whole percent; neutral takes the rounding remainder so the three always add up to 100
        long pos = 0;
        long neg = 0;
        long total = 0;
        // row = [SentimentLabel, count]
        for (Object[] row : reviews.sentimentCounts(id)) {
            long n = ((Number) row[1]).longValue();
            total += n;
            if (row[0] == SentimentLabel.POSITIVE) {
                pos += n;
            } else if (row[0] == SentimentLabel.NEGATIVE) {
                neg += n;
            }
        }
        SentimentSplit split;
        if (total == 0) {
            split = new SentimentSplit(0, 0, 0);
        } else {
            int posPct = (int) Math.round(pos * 100.0 / total);
            int negPct = (int) Math.round(neg * 100.0 / total);
            split = new SentimentSplit(posPct, Math.max(0, 100 - posPct - negPct), negPct);
        }
        return new StationDetailDto(summary, amenities, pts, breakdown, split, s.getUptimePct());
    }

    /** Loads a station or throws 404. */
    @Transactional(readOnly = true)
    public Station require(Long id) {
        return stations.findById(id).orElseThrow(() -> new ResourceNotFoundException("Station", id));
    }

    /**
     * Bulk summary builder (result keeps the order of the input collection).
     * Uses 1 query for all points + 1 query for the points occupied "now" - independent of the number of stations.
     */
    @Transactional(readOnly = true)
    public List<StationSummaryDto> summaries(Collection<Station> stationList, Map<Long, Double> distanceKmByStationId) {
        return build(stationList, distanceKmByStationId, loadPoints(stationList), clock.now());
    }

    @Transactional(readOnly = true)
    public StationSummaryDto summary(Station s, Double distanceKm) {
        Map<Long, Double> d = distanceKm == null ? null : Map.of(s.getId(), distanceKm);
        return summaries(List.of(s), d).get(0);
    }

    public static PointDto toPointDto(ChargingPoint p) {
        return new PointDto(p.getId(), p.getLabel(), p.getConnectorType().getCode(), p.getConnectorType().getDisplayName(),
                p.getConnectorType().getCurrentType(), p.getPowerKw(), p.getTariffPerKwh(), p.getStatus());
    }

    // ------------------------------------------------------------------ internals

    /** One query: all points of the given stations, grouped by station id (ordered by point id). */
    private Map<Long, List<ChargingPoint>> loadPoints(Collection<Station> list) {
        Map<Long, List<ChargingPoint>> map = new HashMap<>();
        if (list.isEmpty()) {
            return map;
        }
        List<Long> ids = new ArrayList<>(list.size());
        for (Station s : list) {
            ids.add(s.getId());
        }
        for (ChargingPoint p : points.findByStationIdInOrderByIdAsc(ids)) {
            map.computeIfAbsent(p.getStation().getId(), k -> new ArrayList<>()).add(p);
        }
        return map;
    }

    private List<StationSummaryDto> build(Collection<Station> list, Map<Long, Double> distances,
                                          Map<Long, List<ChargingPoint>> pointsByStation, LocalDateTime now) {
        List<StationSummaryDto> out = new ArrayList<>(list.size());
        if (list.isEmpty()) {
            return out;
        }
        // 2nd (and last) bulk query: ids of points whose current half-hour slot is taken
        Set<Long> occupiedNow = new HashSet<>(slots.pointsOccupiedAt(TimeUtil.floorToSlot(now)));

        for (Station s : list) {
            List<ChargingPoint> pts = pointsByStation.getOrDefault(s.getId(), List.of());
            boolean open = isOpen(s, now);

            Map<String, int[]> perConnector = new TreeMap<>();       // code -> [count]
            Map<String, Double> maxKw = new HashMap<>();
            int active = 0;
            int free = 0;
            BigDecimal minActive = null;
            BigDecimal minAny = null;
            for (ChargingPoint p : pts) {
                String code = p.getConnectorType().getCode();
                perConnector.computeIfAbsent(code, k -> new int[1])[0]++;
                maxKw.merge(code, p.getPowerKw(), Math::max);
                if (minAny == null || p.getTariffPerKwh().compareTo(minAny) < 0) {
                    minAny = p.getTariffPerKwh();
                }
                if (p.getStatus() == PointStatus.ACTIVE) {
                    active++;
                    if (minActive == null || p.getTariffPerKwh().compareTo(minActive) < 0) {
                        minActive = p.getTariffPerKwh();
                    }
                    if (open && !occupiedNow.contains(p.getId())) {
                        free++;
                    }
                }
            }
            List<ConnectorSummary> connectors = new ArrayList<>();
            for (Map.Entry<String, int[]> e : perConnector.entrySet()) {
                connectors.add(new ConnectorSummary(e.getKey(), e.getValue()[0], maxKw.get(e.getKey())));
            }
            BigDecimal minTariff = minActive != null ? minActive : (minAny != null ? minAny : BigDecimal.ZERO);

            double crowd = forecast.crowdingIndex(s.getId(), now);
            Double dist = distances == null ? null : distances.get(s.getId());

            out.add(new StationSummaryDto(s.getId(), s.getName(), s.getAddress(), s.getZone(), s.getCity(),
                    s.getLatitude(), s.getLongitude(), s.getTier(), s.getOperator().getId(), s.getOperator().getName(),
                    dist, connectors, pts.size(), active, minTariff, s.getAvgRating(), s.getReviewCount(),
                    s.getReliabilityScore(), sentimentLabel(s), open, s.getOpenHour(), s.getCloseHour(), free,
                    Math.round(crowd * 10) / 10.0, ForecastService.level(crowd)));
        }
        return out;
    }

    /** Open when the hour of {@code now} lies in [openHour, closeHour). */
    private static boolean isOpen(Station s, LocalDateTime now) {
        int h = now.getHour();
        return h >= s.getOpenHour() && h < s.getCloseHour();
    }

    /** Same thresholds as the review sentiment labels (>= 0.15 positive, <= -0.05 negative). */
    private static String sentimentLabel(Station s) {
        if (s.getReviewCount() == null || s.getReviewCount() == 0) {
            return SentimentLabel.NEUTRAL.name();
        }
        double score = s.getSentimentScore();
        if (score >= 0.15) {
            return SentimentLabel.POSITIVE.name();
        }
        if (score <= -0.05) {
            return SentimentLabel.NEGATIVE.name();
        }
        return SentimentLabel.NEUTRAL.name();
    }

    private static boolean hasMatchingPoint(List<ChargingPoint> pts, String connector, Double minKw) {
        if (pts == null) {
            return false;
        }
        for (ChargingPoint p : pts) {
            if (p.getStatus() != PointStatus.ACTIVE) {
                continue;
            }
            boolean codeOk = connector == null || connector.isBlank()
                    || p.getConnectorType().getCode().equalsIgnoreCase(connector.trim());
            boolean kwOk = minKw == null || p.getPowerKw() >= minKw;
            if (codeOk && kwOk) {
                return true;
            }
        }
        return false;
    }

    /** Sort order for the result list; ties are always broken by id so paging is stable. */
    private static Comparator<StationSummaryDto> comparatorFor(String sortKey, boolean hasPosition) {
        Comparator<StationSummaryDto> byId = Comparator.comparing(StationSummaryDto::id);
        String key = sortKey != null ? sortKey : (hasPosition ? "distance" : "name");
        Comparator<StationSummaryDto> primary;
        switch (key) {
            case "rating":
                primary = Comparator.comparingDouble(StationSummaryDto::avgRating).reversed();
                break;
            case "price":
                primary = Comparator.comparing(StationSummaryDto::minTariff);
                break;
            case "reliability":
                primary = Comparator.comparingDouble(StationSummaryDto::reliabilityScore).reversed();
                break;
            case "distance":
                if (hasPosition) {
                    primary = Comparator.comparingDouble(StationSummaryDto::distanceKm);
                    break;
                }
                primary = Comparator.comparing(StationSummaryDto::name, String.CASE_INSENSITIVE_ORDER);
                break;
            default:
                primary = Comparator.comparing(StationSummaryDto::name, String.CASE_INSENSITIVE_ORDER);
                break;
        }
        return primary.thenComparing(byId);
    }

    private static double round2(double x) {
        return BigDecimal.valueOf(x).setScale(2, RoundingMode.HALF_UP).doubleValue();
    }
}
