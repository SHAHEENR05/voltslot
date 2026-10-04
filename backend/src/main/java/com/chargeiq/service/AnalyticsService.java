package com.chargeiq.service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.io.Writer;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.chargeiq.clock.AppClock;
import com.chargeiq.dto.AnalyticsDtos.AnomalyPoint;
import com.chargeiq.dto.AnalyticsDtos.CohortCell;
import com.chargeiq.dto.AnalyticsDtos.Filter;
import com.chargeiq.dto.AnalyticsDtos.ForecastPoint;
import com.chargeiq.dto.AnalyticsDtos.FunnelStage;
import com.chargeiq.dto.AnalyticsDtos.HeatCell;
import com.chargeiq.dto.AnalyticsDtos.Insight;
import com.chargeiq.dto.AnalyticsDtos.Keyword;
import com.chargeiq.dto.AnalyticsDtos.Kpis;
import com.chargeiq.dto.AnalyticsDtos.LabelShare;
import com.chargeiq.dto.AnalyticsDtos.LeadTimeBucket;
import com.chargeiq.dto.AnalyticsDtos.MixSlice;
import com.chargeiq.dto.AnalyticsDtos.MonthSentiment;
import com.chargeiq.dto.AnalyticsDtos.OverviewDto;
import com.chargeiq.dto.AnalyticsDtos.SegmentStat;
import com.chargeiq.dto.AnalyticsDtos.SentimentDto;
import com.chargeiq.dto.AnalyticsDtos.SparkPoint;
import com.chargeiq.dto.AnalyticsDtos.StationSentiment;
import com.chargeiq.dto.AnalyticsDtos.StationStat;
import com.chargeiq.dto.AnalyticsDtos.TrendDto;
import com.chargeiq.dto.AnalyticsDtos.TrendPoint;
import com.chargeiq.dto.AnalyticsDtos.WeatherImpactDto;
import com.chargeiq.dto.AnalyticsDtos.WeatherRow;
import com.chargeiq.dto.AnalyticsDtos.ZoneStat;
import com.chargeiq.entity.enums.Role;
import com.chargeiq.exception.BadRequestException;
import com.chargeiq.exception.ForbiddenException;
import com.chargeiq.security.AuthUser;
import com.chargeiq.util.TimeSeriesStats;

/**
 * Business-intelligence queries over the star schema (dw_fact_session, dw_fact_booking, dw_dim_*) plus a few
 * operational / ML-output tables (reviews, funnel_events, weather_daily, holidays, sentiment_keywords, station_clusters).
 *
 * <p><b>Why {@link NamedParameterJdbcTemplate} / native SQL and not Spring Data JPA here?</b>
 * <ol>
 *   <li>The warehouse tables are a read-only <i>reporting</i> model produced by a stored procedure; they have no
 *       entities and no identity/relationship semantics, so mapping them would add classes without adding value.</li>
 *   <li>Analytics need GROUP BY, conditional aggregation, CTEs and date functions across 4-5 joined tables and return
 *       tuples (not entities) - SQL expresses that directly and lets MySQL do the heavy lifting; JPQL/Criteria would be
 *       longer and slower, and fetching entities to aggregate in Java would be wasteful.</li>
 *   <li>Every user supplied value is bound as a named parameter (never concatenated). The only text spliced into a SQL
 *       string comes from fixed whitelists (granularity, mix dimension, sort column, metric), so there is no SQL injection
 *       surface.</li>
 * </ol>
 * The module targets MySQL 8 (CTEs, window-free but MySQL date functions); it is not exercised on H2.
 *
 * <p><b>Access rule:</b> ADMIN sees the whole network and may filter by any operator; an OPERATOR is always restricted
 * to its own operator id - a client supplied {@code operatorId} is ignored (see {@link #resolve}).
 *
 * <p><b>Common filters:</b> from / to (inclusive, default: last 90 days up to the app clock's today), zone, connector code,
 * tier (HUB / STANDARD) and operatorId. All dates are by session/booking <i>start</i> date in Asia/Kolkata local time.
 */
@Service
@Transactional(readOnly = true)
public class AnalyticsService {

    // ------------------------------------------------------------------ SQL building blocks (constants only)

    /** Star join for sessions: aliases f = fact, d = date, s = station, c = connector. */
    private static final String SESSION_FROM = " FROM dw_fact_session f"
            + " JOIN dw_dim_date d ON d.date_key = f.date_key"
            + " JOIN dw_dim_station s ON s.station_key = f.station_key"
            + " JOIN dw_dim_connector c ON c.connector_key = f.connector_key ";

    /** Star join for bookings (same aliases). */
    private static final String BOOKING_FROM = " FROM dw_fact_booking f"
            + " JOIN dw_dim_date d ON d.date_key = f.date_key"
            + " JOIN dw_dim_station s ON s.station_key = f.station_key"
            + " JOIN dw_dim_connector c ON c.connector_key = f.connector_key ";

    private static final List<String> FUNNEL_STAGES = List.of("SEARCH", "VIEW_STATION", "SELECT_SLOT", "BOOK", "CHECK_IN", "COMPLETE");
    private static final List<String> DAY_PARTS = List.of("NIGHT", "MORNING", "AFTERNOON", "EVENING", "LATE");
    private static final String[] DAY_NAMES = {"", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"};
    private static final double ANOMALY_Z = 2.2;
    private static final int FORECAST_DAYS = 14;

    private final NamedParameterJdbcTemplate jdbc;
    private final AppClock clock;

    public AnalyticsService(NamedParameterJdbcTemplate jdbc, AppClock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    // ================================================================== public API (one method per endpoint)

    /** KPI cards for the period, the previous period of equal length, % change and a 30-day sparkline. */
    public OverviewDto overview(AuthUser actor, Filter raw) {
        return overview(resolve(actor, raw));
    }

    public TrendDto trend(AuthUser actor, Filter raw, String granularity) {
        return trend(resolve(actor, raw), granularity);
    }

    public List<HeatCell> heatmap(AuthUser actor, Filter raw, String metric, Long stationId) {
        return heatmap(resolve(actor, raw), metric, stationId);
    }

    public List<ZoneStat> zones(AuthUser actor, Filter raw) {
        return zones(resolve(actor, raw));
    }

    public List<MixSlice> mix(AuthUser actor, Filter raw, String by) {
        return mix(resolve(actor, raw), by);
    }

    public List<FunnelStage> funnel(AuthUser actor, Filter raw) {
        return funnel(resolve(actor, raw));
    }

    public List<SegmentStat> segments(AuthUser actor, Filter raw) {
        return segments(resolve(actor, raw));
    }

    public List<StationStat> stations(AuthUser actor, Filter raw, String sort, String order, int limit) {
        return stations(resolve(actor, raw), sort, order, limit);
    }

    public SentimentDto sentiment(AuthUser actor, Filter raw) {
        return sentiment(resolve(actor, raw));
    }

    public WeatherImpactDto weatherImpact(AuthUser actor, Filter raw) {
        return weatherImpact(resolve(actor, raw));
    }

    public List<CohortCell> cohorts(AuthUser actor, Filter raw) {
        return cohorts(resolve(actor, raw));
    }

    public List<LeadTimeBucket> leadTime(AuthUser actor, Filter raw) {
        return leadTime(resolve(actor, raw));
    }

    public List<Insight> insights(AuthUser actor, Filter raw) {
        return insights(resolve(actor, raw));
    }

    /** Streams every session of the filtered selection as CSV (UTF-8, header row first) into {@code out}. */
    public void exportSessionsCsv(AuthUser actor, Filter raw, Writer out) {
        exportSessionsCsv(resolve(actor, raw), out);
    }

    /** Same, for a filter that has already been through {@link #resolve} (lets the controller validate before it sets headers). */
    public void exportSessionsCsv(Filter f, Writer out) {
        MapSqlParameterSource p = params(f);
        String sql = "SELECT cs.id AS session_id, cs.booking_id, cs.started_at, cs.ended_at, s.station_name, s.zone,"
                + " s.operator_name, s.tier, c.code AS connector, v.category AS vehicle_category,"
                + " CONCAT(v.make, ' ', v.model) AS vehicle, f.source, f.energy_kwh, f.duration_min,"
                + " f.effective_tariff, f.revenue, f.lead_time_hours, f.soc_start, f.soc_end, f.co2_avoided_kg"
                + SESSION_FROM
                + " JOIN dw_dim_vehicle v ON v.vehicle_key = f.vehicle_key"
                + " JOIN charging_sessions cs ON cs.id = f.session_id"
                + where(f, p, true) + " ORDER BY cs.started_at, cs.id LIMIT 200000";
        try {
            out.write('﻿'); // BOM so that Excel opens the file as UTF-8
            out.write("sessionId,bookingId,startedAt,endedAt,station,zone,operator,tier,connector,vehicleCategory,vehicle,"
                    + "source,energyKwh,durationMin,tariffPerKwh,revenueInr,leadTimeHours,socStart,socEnd,co2AvoidedKg\n");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        jdbc.query(sql, p, (RowCallbackHandler) rs -> {
            StringBuilder sb = new StringBuilder(256);
            sb.append(rs.getLong("session_id")).append(',').append(rs.getLong("booking_id")).append(',')
                    .append(ts(rs.getTimestamp("started_at"))).append(',').append(ts(rs.getTimestamp("ended_at"))).append(',')
                    .append(csv(rs.getString("station_name"))).append(',').append(csv(rs.getString("zone"))).append(',')
                    .append(csv(rs.getString("operator_name"))).append(',').append(csv(rs.getString("tier"))).append(',')
                    .append(csv(rs.getString("connector"))).append(',').append(csv(rs.getString("vehicle_category"))).append(',')
                    .append(csv(rs.getString("vehicle"))).append(',').append(csv(rs.getString("source"))).append(',')
                    .append(rs.getBigDecimal("energy_kwh").setScale(2, java.math.RoundingMode.HALF_UP)).append(',')
                    .append(rs.getInt("duration_min")).append(',').append(rs.getBigDecimal("effective_tariff")).append(',')
                    .append(rs.getBigDecimal("revenue")).append(',').append(rs.getBigDecimal("lead_time_hours")).append(',')
                    .append(rs.getInt("soc_start")).append(',').append(rs.getInt("soc_end")).append(',')
                    .append(rs.getBigDecimal("co2_avoided_kg").setScale(2, java.math.RoundingMode.HALF_UP)).append('\n');
            try {
                out.write(sb.toString());
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        });
    }

    // ================================================================== filter handling

    /**
     * Applies defaults, validates and enforces the operator restriction.
     * OPERATOR -> operatorId is forced to the actor's own operator (client value ignored); ADMIN -> client value used.
     */
    public Filter resolve(AuthUser actor, Filter raw) {
        if (actor == null || (actor.getRole() != Role.ADMIN && actor.getRole() != Role.OPERATOR)) {
            throw new ForbiddenException("Analytics are available to administrators and operators only");
        }
        Long operatorId = raw.operatorId();
        if (actor.getRole() == Role.OPERATOR) {
            if (actor.getOperatorId() == null) {
                throw new ForbiddenException("This operator account is not linked to an operator");
            }
            operatorId = actor.getOperatorId();
        }
        LocalDate to = raw.to() != null ? raw.to() : clock.today();
        LocalDate from = raw.from() != null ? raw.from() : to.minusDays(89);
        if (from.isAfter(to)) {
            throw new BadRequestException("'from' must not be after 'to'");
        }
        if (ChronoUnit.DAYS.between(from, to) > 800) {
            throw new BadRequestException("The date range may not exceed 800 days");
        }
        String tier = blankToNull(raw.tier());
        if (tier != null) {
            tier = tier.toUpperCase(Locale.ROOT);
            if (!tier.equals("HUB") && !tier.equals("STANDARD")) {
                throw new BadRequestException("tier must be HUB or STANDARD");
            }
        }
        String connector = blankToNull(raw.connector());
        return new Filter(from, to, blankToNull(raw.zone()), connector == null ? null : connector.toUpperCase(Locale.ROOT),
                tier, operatorId);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static Filter range(Filter f, LocalDate from, LocalDate to) {
        return new Filter(from, to, f.zone(), f.connector(), f.tier(), f.operatorId());
    }

    /** Binds from/to and every non-null filter as a named parameter. */
    private static MapSqlParameterSource params(Filter f) {
        MapSqlParameterSource p = new MapSqlParameterSource().addValue("from", f.from()).addValue("to", f.to());
        if (f.zone() != null) {
            p.addValue("zone", f.zone());
        }
        if (f.connector() != null) {
            p.addValue("connector", f.connector());
        }
        if (f.tier() != null) {
            p.addValue("tier", f.tier());
        }
        if (f.operatorId() != null) {
            p.addValue("operatorId", f.operatorId());
        }
        return p;
    }

    /** Station/connector conditions only (no dates); every fragment is a constant, values are named parameters. */
    private static String dimConditions(Filter f, boolean withConnector) {
        StringBuilder sb = new StringBuilder();
        if (f.zone() != null) {
            sb.append(" AND s.zone = :zone");
        }
        if (f.tier() != null) {
            sb.append(" AND s.tier = :tier");
        }
        if (f.operatorId() != null) {
            sb.append(" AND s.operator_id = :operatorId");
        }
        if (withConnector && f.connector() != null) {
            sb.append(" AND c.code = :connector");
        }
        return sb.toString();
    }

    /** WHERE clause with the date range (on alias d) plus the dimension filters. */
    private static String where(Filter f, MapSqlParameterSource p, boolean withConnector) {
        return " WHERE d.full_date BETWEEN :from AND :to" + dimConditions(f, withConnector);
    }

    // ================================================================== overview

    private OverviewDto overview(Filter f) {
        Kpis cur = kpis(f);
        long days = ChronoUnit.DAYS.between(f.from(), f.to()) + 1;
        LocalDate prevTo = f.from().minusDays(1);
        Kpis prev = kpis(range(f, prevTo.minusDays(days - 1), prevTo));

        Map<String, Double> delta = new LinkedHashMap<>();
        delta.put("sessions", pctChange(cur.sessions(), prev.sessions()));
        delta.put("energyKwh", pctChange(cur.energyKwh(), prev.energyKwh()));
        delta.put("revenue", pctChange(cur.revenue(), prev.revenue()));
        delta.put("avgSessionKwh", pctChange(cur.avgSessionKwh(), prev.avgSessionKwh()));
        delta.put("avgDurationMin", pctChange(cur.avgDurationMin(), prev.avgDurationMin()));
        delta.put("utilizationPct", pctChange(cur.utilizationPct(), prev.utilizationPct()));
        delta.put("uniqueUsers", pctChange(cur.uniqueUsers(), prev.uniqueUsers()));
        delta.put("bookings", pctChange(cur.bookings(), prev.bookings()));
        delta.put("cancellationRatePct", pctChange(cur.cancellationRatePct(), prev.cancellationRatePct()));
        delta.put("noShowRatePct", pctChange(cur.noShowRatePct(), prev.noShowRatePct()));
        delta.put("co2AvoidedKg", pctChange(cur.co2AvoidedKg(), prev.co2AvoidedKg()));
        delta.put("avgLeadHours", pctChange(cur.avgLeadHours(), prev.avgLeadHours()));

        LocalDate sparkFrom = f.to().minusDays(29).isBefore(f.from()) ? f.from() : f.to().minusDays(29);
        Map<LocalDate, double[]> daily = dailySeries(range(f, sparkFrom, f.to()));
        List<SparkPoint> spark = new ArrayList<>();
        for (LocalDate d = sparkFrom; !d.isAfter(f.to()); d = d.plusDays(1)) {
            double[] v = daily.getOrDefault(d, new double[3]);
            spark.add(new SparkPoint(d, (long) v[0], r2(v[2]), r1(v[1])));
        }
        return new OverviewDto(f.from(), f.to(), cur, prev, delta, spark);
    }

    /** One period's KPIs: sessions aggregate + booking aggregate + peak hour + capacity (for utilisation). */
    private Kpis kpis(Filter f) {
        MapSqlParameterSource p = params(f);
        double[] s = jdbc.queryForObject(
                "SELECT COUNT(*) AS n, COALESCE(SUM(f.energy_kwh),0) AS kwh, COALESCE(SUM(f.revenue),0) AS rev,"
                        + " COALESCE(AVG(f.duration_min),0) AS dur, COUNT(DISTINCT f.user_key) AS users,"
                        + " COALESCE(SUM(f.co2_avoided_kg),0) AS co2, COALESCE(SUM(f.duration_min),0) AS mins"
                        + SESSION_FROM + where(f, p, true),
                p, (rs, i) -> new double[] {rs.getLong("n"), rs.getDouble("kwh"), rs.getDouble("rev"), rs.getDouble("dur"),
                        rs.getLong("users"), rs.getDouble("co2"), rs.getDouble("mins")});

        long points = pointCount(f);
        long days = ChronoUnit.DAYS.between(f.from(), f.to()) + 1;
        double utilization = points == 0 ? 0 : s[6] / (points * (double) days * 1440.0) * 100.0;

        // booking outcomes: rates are computed over *resolved* bookings (completed + cancelled + no-show);
        // EXPIRED holds never became real bookings, upcoming ones have no outcome yet.
        double[] b = jdbc.queryForObject(
                "SELECT COUNT(*) AS n, COALESCE(SUM(f.status = 'CANCELLED'),0) AS can, COALESCE(SUM(f.status = 'NO_SHOW'),0) AS ns,"
                        + " COALESCE(SUM(f.status IN ('COMPLETED','CANCELLED','NO_SHOW')),0) AS res,"
                        + " COALESCE(AVG(CASE WHEN f.status NOT IN ('EXPIRED','HOLD') THEN f.lead_time_hours END),0) AS lead_h"
                        + BOOKING_FROM + where(f, p, true),
                p, (rs, i) -> new double[] {rs.getLong("n"), rs.getLong("can"), rs.getLong("ns"), rs.getLong("res"),
                        rs.getDouble("lead_h")});

        List<Integer> peak = jdbc.query("SELECT f.time_key AS h, COUNT(*) AS n" + SESSION_FROM + where(f, p, true)
                + " GROUP BY f.time_key ORDER BY n DESC, f.time_key LIMIT 1", p, (rs, i) -> rs.getInt("h"));

        long sessions = (long) s[0];
        return new Kpis(sessions, r1(s[1]), r2(s[2]), r2(sessions == 0 ? 0 : s[1] / sessions), r1(s[3]), r2(utilization),
                (long) s[4], (long) b[0], r1(b[3] == 0 ? 0 : b[1] / b[3] * 100), r1(b[3] == 0 ? 0 : b[2] / b[3] * 100),
                r1(s[5]), r1(b[4]), peak.isEmpty() ? null : peak.get(0));
    }

    /** Number of charging points in the stations selected by the zone / tier / operator filters. */
    private long pointCount(Filter f) {
        MapSqlParameterSource p = params(f);
        Long n = jdbc.queryForObject("SELECT COALESCE(SUM(s.num_points),0) FROM dw_dim_station s WHERE 1 = 1"
                + dimConditions(f, false), p, Long.class);
        return n == null ? 0 : n;
    }

    /** date -> [sessions, energyKwh, revenue] for the (already ranged) filter. */
    private Map<LocalDate, double[]> dailySeries(Filter f) {
        MapSqlParameterSource p = params(f);
        Map<LocalDate, double[]> out = new HashMap<>();
        jdbc.query("SELECT d.full_date AS dt, COUNT(*) AS n, SUM(f.energy_kwh) AS kwh, SUM(f.revenue) AS rev"
                + SESSION_FROM + where(f, p, true) + " GROUP BY d.full_date", p, (RowCallbackHandler) rs ->
                out.put(rs.getDate("dt").toLocalDate(), new double[] {rs.getLong("n"), rs.getDouble("kwh"), rs.getDouble("rev")}));
        return out;
    }

    // ================================================================== trend + forecast + anomalies

    private TrendDto trend(Filter f, String granularity) {
        String g = granularity == null || granularity.isBlank() ? "DAY" : granularity.trim().toUpperCase(Locale.ROOT);
        // whitelist: the period expression is chosen here, never taken from the request
        String periodExpr;
        switch (g) {
            case "DAY" -> periodExpr = "d.full_date";
            case "WEEK" -> periodExpr = "DATE_SUB(d.full_date, INTERVAL WEEKDAY(d.full_date) DAY)";
            case "MONTH" -> periodExpr = "d.month_key";
            default -> throw new BadRequestException("granularity must be DAY, WEEK or MONTH");
        }
        MapSqlParameterSource p = params(f);
        Map<String, TrendPoint> rows = new LinkedHashMap<>();
        jdbc.query("SELECT CAST(" + periodExpr + " AS CHAR) AS per, COUNT(*) AS n, SUM(f.energy_kwh) AS kwh,"
                + " SUM(f.revenue) AS rev" + SESSION_FROM + where(f, p, true) + " GROUP BY per ORDER BY per", p,
                (RowCallbackHandler) rs -> {
                    double kwh = rs.getDouble("kwh");
                    double rev = rs.getDouble("rev");
                    rows.put(rs.getString("per"), new TrendPoint(rs.getString("per"), rs.getLong("n"), r1(kwh), r2(rev),
                            r2(kwh == 0 ? 0 : rev / kwh)));
                });
        List<TrendPoint> series = new ArrayList<>();
        if (g.equals("DAY")) { // fill days without sessions with zeros so the chart has no gaps
            for (LocalDate d = f.from(); !d.isAfter(f.to()); d = d.plusDays(1)) {
                series.add(rows.getOrDefault(d.toString(), new TrendPoint(d.toString(), 0, 0, 0, 0)));
            }
        } else {
            series.addAll(rows.values());
        }

        // ---- forecast + anomalies always work on the DAILY series of complete days (today is still in progress)
        List<ForecastPoint> forecast = new ArrayList<>();
        List<AnomalyPoint> anomalies = new ArrayList<>();
        String method = "NONE";
        LocalDate today = clock.today();
        LocalDate end = f.to().isBefore(today) ? f.to() : today.minusDays(1);
        LocalDate dataStart = dataStart();
        LocalDate seriesFrom = f.from().minusDays(28);                  // 28 days of warm-up for the rolling baseline
        if (end.minusDays(111).isBefore(seriesFrom)) {
            seriesFrom = end.minusDays(111);                             // at least 16 weeks for the seasonal model
        }
        if (seriesFrom.isBefore(dataStart)) {
            seriesFrom = dataStart;
        }
        int n = (int) (ChronoUnit.DAYS.between(seriesFrom, end) + 1);
        if (n >= 14) {
            Map<LocalDate, double[]> daily = dailySeries(range(f, seriesFrom, end));
            double[] y = new double[n];
            for (int i = 0; i < n; i++) {
                y[i] = daily.getOrDefault(seriesFrom.plusDays(i), new double[3])[0];
            }
            TimeSeriesStats.Forecast fc = TimeSeriesStats.holtWinters(y, 7, FORECAST_DAYS);
            method = fc.method();
            for (int h = 0; h < FORECAST_DAYS; h++) {
                forecast.add(new ForecastPoint(end.plusDays(h + 1L), r1(fc.predicted()[h]), r1(fc.lower()[h]), r1(fc.upper()[h])));
            }
            anomalies = anomalies(y, seriesFrom, f.from());
        }
        return new TrendDto(g, method, series, forecast, anomalies);
    }

    /** Flags days whose z-score against the previous 28 days is at least 2.2 and explains them (holiday / rain). */
    private List<AnomalyPoint> anomalies(double[] y, LocalDate seriesFrom, LocalDate reportFrom) {
        double[] z = TimeSeriesStats.rollingZScore(y, 28, 14);
        LocalDate seriesTo = seriesFrom.plusDays(y.length - 1L);
        Map<LocalDate, String> holidays = new HashMap<>();
        jdbc.query("SELECT holiday_date, name FROM holidays WHERE holiday_date BETWEEN :a AND :b",
                new MapSqlParameterSource().addValue("a", seriesFrom).addValue("b", seriesTo),
                (RowCallbackHandler) rs -> holidays.put(rs.getDate("holiday_date").toLocalDate(), rs.getString("name")));
        Map<LocalDate, String[]> weather = new HashMap<>();
        jdbc.query("SELECT weather_date, rainfall_mm, condition_label FROM weather_daily WHERE weather_date BETWEEN :a AND :b",
                new MapSqlParameterSource().addValue("a", seriesFrom).addValue("b", seriesTo),
                (RowCallbackHandler) rs -> weather.put(rs.getDate("weather_date").toLocalDate(),
                        new String[] {rs.getString("condition_label"), String.format(Locale.ROOT, "%.0f", rs.getDouble("rainfall_mm"))}));

        List<AnomalyPoint> all = new ArrayList<>();
        for (int i = 0; i < y.length; i++) {
            LocalDate date = seriesFrom.plusDays(i);
            if (date.isBefore(reportFrom) || Double.isNaN(z[i]) || Math.abs(z[i]) < ANOMALY_Z) {
                continue;
            }
            double expected = TimeSeriesStats.mean(y, Math.max(0, i - 28), i);
            List<String> causes = new ArrayList<>();
            if (holidays.containsKey(date)) {
                causes.add("public holiday (" + holidays.get(date) + ")");
            }
            String[] w = weather.get(date);
            if (w != null && "HEAVY_RAIN".equals(w[0])) {
                causes.add("heavy rain (" + w[1] + " mm)");
            } else if (w != null && "RAIN".equals(w[0])) {
                causes.add("rain (" + w[1] + " mm)");
            }
            if (causes.isEmpty() && date.getDayOfWeek().getValue() >= 6) {
                causes.add("weekend effect");
            }
            String reason = (z[i] > 0 ? "Spike" : "Dip") + ": "
                    + (causes.isEmpty() ? "no known cause (holiday / weather)" : String.join(", ", causes));
            all.add(new AnomalyPoint(date, y[i], r1(expected), r2(z[i]), reason));
        }
        // keep the 25 strongest, back in date order
        all.sort((a, b) -> Double.compare(Math.abs(b.zScore()), Math.abs(a.zScore())));
        List<AnomalyPoint> top = new ArrayList<>(all.subList(0, Math.min(25, all.size())));
        top.sort((a, b) -> a.date().compareTo(b.date()));
        return top;
    }

    /** First day that has any session in the whole warehouse (so warm-up windows never reach into empty history). */
    private LocalDate dataStart() {
        List<LocalDate> l = jdbc.query("SELECT MIN(d.full_date) AS m FROM dw_fact_session f JOIN dw_dim_date d ON d.date_key = f.date_key",
                (rs, i) -> rs.getDate("m") == null ? null : rs.getDate("m").toLocalDate());
        return l.isEmpty() || l.get(0) == null ? LocalDate.of(2025, 10, 1) : l.get(0);
    }

    // ================================================================== heat-map

    private List<HeatCell> heatmap(Filter f, String metric, Long stationId) {
        String m = metric == null || metric.isBlank() ? "sessions" : metric.trim().toLowerCase(Locale.ROOT);
        String agg;
        switch (m) { // whitelist
            case "sessions" -> agg = "COUNT(*)";
            case "revenue" -> agg = "SUM(f.revenue)";
            default -> throw new BadRequestException("metric must be sessions or revenue");
        }
        MapSqlParameterSource p = params(f);
        String station = "";
        if (stationId != null) {
            station = " AND s.station_key = :stationId";
            p.addValue("stationId", stationId);
        }
        double[][] grid = new double[8][24];
        jdbc.query("SELECT d.day_of_week AS dow, f.time_key AS hr, " + agg + " AS v" + SESSION_FROM + where(f, p, true) + station
                + " GROUP BY d.day_of_week, f.time_key", p,
                (RowCallbackHandler) rs -> grid[rs.getInt("dow")][rs.getInt("hr")] = rs.getDouble("v"));
        List<HeatCell> cells = new ArrayList<>(168);
        for (int dow = 1; dow <= 7; dow++) {
            for (int h = 0; h < 24; h++) {
                cells.add(new HeatCell(dow, h, r2(grid[dow][h])));
            }
        }
        return cells;
    }

    // ================================================================== zones

    private List<ZoneStat> zones(Filter f) {
        // 1) station side (so zones without sessions still appear)
        record ZoneBase(int stations, int points, double lat, double lon) { }
        Map<String, ZoneBase> base = new LinkedHashMap<>();
        MapSqlParameterSource ps = params(f);
        jdbc.query("SELECT s.zone AS zone, COUNT(*) AS st, SUM(s.num_points) AS pts, AVG(s.latitude) AS lat, AVG(s.longitude) AS lon"
                + " FROM dw_dim_station s WHERE 1 = 1" + dimConditions(f, false) + " GROUP BY s.zone ORDER BY s.zone", ps,
                (RowCallbackHandler) rs -> base.put(rs.getString("zone"),
                        new ZoneBase(rs.getInt("st"), rs.getInt("pts"), rs.getDouble("lat"), rs.getDouble("lon"))));

        // 2) session side for the selected period
        record ZoneSessions(long n, double kwh, double rev, double mins) { }
        Map<String, ZoneSessions> sess = new HashMap<>();
        MapSqlParameterSource p = params(f);
        jdbc.query("SELECT s.zone AS zone, COUNT(*) AS n, SUM(f.energy_kwh) AS kwh, SUM(f.revenue) AS rev, SUM(f.duration_min) AS mins"
                + SESSION_FROM + where(f, p, true) + " GROUP BY s.zone", p,
                (RowCallbackHandler) rs -> sess.put(rs.getString("zone"),
                        new ZoneSessions(rs.getLong("n"), rs.getDouble("kwh"), rs.getDouble("rev"), rs.getDouble("mins"))));

        // 3) growth: last 30 days ending at "to" versus the 30 days before that
        Map<String, double[]> growth = zoneGrowth(f);

        long total = sess.values().stream().mapToLong(ZoneSessions::n).sum();
        long days = ChronoUnit.DAYS.between(f.from(), f.to()) + 1;
        List<ZoneStat> out = new ArrayList<>();
        for (Map.Entry<String, ZoneBase> e : base.entrySet()) {
            ZoneBase b = e.getValue();
            ZoneSessions s = sess.getOrDefault(e.getKey(), new ZoneSessions(0, 0, 0, 0));
            double[] g = growth.get(e.getKey());
            Double growthPct = g == null || g[1] < 5 ? null : r1((g[0] - g[1]) / g[1] * 100);
            out.add(new ZoneStat(e.getKey(), b.stations(), b.points(), r4(b.lat()), r4(b.lon()), s.n(), r1(s.kwh()), r2(s.rev()),
                    r2(s.n() == 0 ? 0 : s.rev() / s.n()), r1(total == 0 ? 0 : s.n() * 100.0 / total),
                    r2(b.points() == 0 ? 0 : s.mins() / (b.points() * (double) days * 1440.0) * 100), growthPct));
        }
        out.sort((a, b) -> Double.compare(b.revenue(), a.revenue()));
        return out;
    }

    /** zone -> [sessions in last 30 days, sessions in the 30 days before]. */
    private Map<String, double[]> zoneGrowth(Filter f) {
        LocalDate recentFrom = f.to().minusDays(29);
        Filter wide = range(f, f.to().minusDays(59), f.to());
        MapSqlParameterSource p = params(wide).addValue("recentFrom", recentFrom);
        Map<String, double[]> out = new HashMap<>();
        jdbc.query("SELECT s.zone AS zone, COALESCE(SUM(d.full_date >= :recentFrom),0) AS cur, COALESCE(SUM(d.full_date < :recentFrom),0) AS prev"
                + SESSION_FROM + where(wide, p, true) + " GROUP BY s.zone", p,
                (RowCallbackHandler) rs -> out.put(rs.getString("zone"), new double[] {rs.getLong("cur"), rs.getLong("prev")}));
        return out;
    }

    // ================================================================== mix

    private List<MixSlice> mix(Filter f, String by) {
        String key = by == null || by.isBlank() ? "connector" : by.trim();
        String join;
        String label;
        switch (key) { // whitelist: join + label expression are constants
            case "connector" -> { join = ""; label = "c.code"; }
            case "vehicleCategory" -> { join = " LEFT JOIN dw_dim_vehicle v ON v.vehicle_key = f.vehicle_key "; label = "v.category"; }
            case "payment" -> { join = " LEFT JOIN payments pay ON pay.booking_id = f.booking_id "; label = "pay.method"; }
            case "source" -> { join = ""; label = "f.source"; }
            case "tier" -> { join = ""; label = "s.tier"; }
            case "dayPart" -> { join = " LEFT JOIN dw_dim_time t ON t.time_key = f.time_key "; label = "t.day_part"; }
            default -> throw new BadRequestException("by must be one of connector, vehicleCategory, payment, source, tier, dayPart");
        }
        MapSqlParameterSource p = params(f);
        List<MixSlice> raw = jdbc.query("SELECT COALESCE(" + label + ", 'UNKNOWN') AS lbl, COUNT(*) AS n,"
                + " COALESCE(SUM(f.energy_kwh),0) AS kwh, COALESCE(SUM(f.revenue),0) AS rev"
                + SESSION_FROM + join + where(f, p, true) + " GROUP BY lbl ORDER BY n DESC, lbl", p,
                (rs, i) -> new MixSlice(rs.getString("lbl"), rs.getLong("n"), 0, r1(rs.getDouble("kwh")), r2(rs.getDouble("rev"))));
        long total = raw.stream().mapToLong(MixSlice::sessions).sum();
        List<MixSlice> out = new ArrayList<>();
        for (MixSlice s : raw) {
            out.add(new MixSlice(s.label(), s.sessions(), r1(total == 0 ? 0 : s.sessions() * 100.0 / total), s.energyKwh(), s.revenue()));
        }
        if (key.equals("dayPart")) { // natural order of the day instead of size order
            out.sort((a, b) -> Integer.compare(DAY_PARTS.indexOf(a.label()), DAY_PARTS.indexOf(b.label())));
        }
        return out;
    }

    // ================================================================== funnel

    private List<FunnelStage> funnel(Filter f) {
        MapSqlParameterSource p = new MapSqlParameterSource()
                .addValue("fromTs", f.from().atStartOfDay()).addValue("toTs", f.to().plusDays(1).atStartOfDay());
        String stationFilter = "";
        if (f.zone() != null || f.tier() != null || f.operatorId() != null) {
            // SEARCH events carry no station, so keep every event of the *journeys* that touched a selected station
            if (f.zone() != null) {
                p.addValue("zone", f.zone());
            }
            if (f.tier() != null) {
                p.addValue("tier", f.tier());
            }
            if (f.operatorId() != null) {
                p.addValue("operatorId", f.operatorId());
            }
            stationFilter = " AND fe.session_key IN (SELECT fe2.session_key FROM funnel_events fe2"
                    + " JOIN dw_dim_station s ON s.station_key = fe2.station_id"
                    + " WHERE fe2.event_time >= :fromTs AND fe2.event_time < :toTs" + dimConditions(f, false) + ")";
        }
        Map<String, Long> counts = new HashMap<>();
        jdbc.query("SELECT fe.event_type AS et, COUNT(DISTINCT fe.session_key) AS n FROM funnel_events fe"
                + " WHERE fe.event_time >= :fromTs AND fe.event_time < :toTs" + stationFilter + " GROUP BY fe.event_type", p,
                (RowCallbackHandler) rs -> counts.put(rs.getString("et"), rs.getLong("n")));
        List<FunnelStage> out = new ArrayList<>();
        long first = counts.getOrDefault(FUNNEL_STAGES.get(0), 0L);
        long prev = 0;
        for (int i = 0; i < FUNNEL_STAGES.size(); i++) {
            long n = counts.getOrDefault(FUNNEL_STAGES.get(i), 0L);
            Double step = i == 0 ? null : (prev == 0 ? null : r1(n * 100.0 / prev));
            out.add(new FunnelStage(i + 1, FUNNEL_STAGES.get(i), n, r1(first == 0 ? 0 : n * 100.0 / first), step,
                    step == null ? 0 : r1(100 - step)));
            prev = n;
        }
        return out;
    }

    // ================================================================== segments

    private List<SegmentStat> segments(Filter f) {
        MapSqlParameterSource p = params(f);
        record Seg(String name, long users, long n, double kwh, double rev, double night, double weekend) { }
        List<Seg> raw = jdbc.query("SELECT COALESCE(u.segment, 'Unsegmented') AS seg, COUNT(DISTINCT f.user_key) AS users, COUNT(*) AS n,"
                + " SUM(f.energy_kwh) AS kwh, SUM(f.revenue) AS rev,"
                + " SUM(CASE WHEN f.time_key >= 22 OR f.time_key < 6 THEN 1 ELSE 0 END) AS night, SUM(d.is_weekend) AS wkend"
                + SESSION_FROM + " LEFT JOIN dw_dim_user u ON u.user_key = f.user_key " + where(f, p, true)
                + " GROUP BY seg ORDER BY rev DESC", p,
                (rs, i) -> new Seg(rs.getString("seg"), rs.getLong("users"), rs.getLong("n"), rs.getDouble("kwh"),
                        rs.getDouble("rev"), rs.getDouble("night"), rs.getDouble("wkend")));
        double totalRev = raw.stream().mapToDouble(Seg::rev).sum();
        List<SegmentStat> out = new ArrayList<>();
        for (Seg s : raw) {
            out.add(new SegmentStat(s.name(), s.users(), s.n(), r1(s.kwh()), r2(s.rev()), r2(s.users() == 0 ? 0 : s.rev() / s.users()),
                    r1(totalRev == 0 ? 0 : s.rev() * 100 / totalRev), r1(s.users() == 0 ? 0 : (double) s.n() / s.users()),
                    r1(s.n() == 0 ? 0 : s.night() * 100 / s.n()), r1(s.n() == 0 ? 0 : s.weekend() * 100 / s.n())));
        }
        return out;
    }

    // ================================================================== station leaderboard

    private List<StationStat> stations(Filter f, String sort, String order, int limit) {
        String sortKey = sort == null || sort.isBlank() ? "sessions" : sort.trim();
        String orderExpr;
        switch (sortKey) { // whitelist of ORDER BY aliases
            case "sessions" -> orderExpr = "sessions";
            case "revenue" -> orderExpr = "revenue";
            case "energy" -> orderExpr = "energy_kwh";
            case "utilization" -> orderExpr = "utilization_pct";
            case "sessionsPerPoint" -> orderExpr = "sessions_per_point";
            case "rating" -> orderExpr = "st.avg_rating";
            case "reliability" -> orderExpr = "st.reliability_score";
            default -> throw new BadRequestException(
                    "sort must be one of sessions, revenue, energy, utilization, sessionsPerPoint, rating, reliability");
        }
        String dir = "asc".equalsIgnoreCase(order) ? "ASC" : "DESC";
        int max = Math.min(Math.max(limit, 1), 100);
        long days = ChronoUnit.DAYS.between(f.from(), f.to()) + 1;
        MapSqlParameterSource p = params(f).addValue("days", days).addValue("limit", max);
        String connector = f.connector() != null ? " AND c.code = :connector" : "";
        String sql = "SELECT s.station_key AS id, s.station_name, s.zone, s.operator_name, s.tier, s.num_points,"
                + " COUNT(x.session_id) AS sessions, COALESCE(SUM(x.energy_kwh),0) AS energy_kwh, COALESCE(SUM(x.revenue),0) AS revenue,"
                + " COALESCE(AVG(x.duration_min),0) AS avg_dur,"
                + " COALESCE(SUM(x.duration_min) / NULLIF(s.num_points * :days * 1440, 0) * 100, 0) AS utilization_pct,"
                + " COALESCE(COUNT(x.session_id) / NULLIF(s.num_points, 0), 0) AS sessions_per_point,"
                + " st.avg_rating, st.reliability_score, st.uptime_pct, sc.cluster_label, sc.recommendation"
                + " FROM dw_dim_station s"
                + " JOIN stations st ON st.id = s.station_key"
                + " LEFT JOIN station_clusters sc ON sc.station_id = s.station_key"
                + " LEFT JOIN (SELECT f.* FROM dw_fact_session f"
                + "            JOIN dw_dim_date d ON d.date_key = f.date_key"
                + "            JOIN dw_dim_connector c ON c.connector_key = f.connector_key"
                + "            WHERE d.full_date BETWEEN :from AND :to" + connector + ") x ON x.station_key = s.station_key"
                + " WHERE 1 = 1" + dimConditions(f, false)
                + " GROUP BY s.station_key, s.station_name, s.zone, s.operator_name, s.tier, s.num_points,"
                + " st.avg_rating, st.reliability_score, st.uptime_pct, sc.cluster_label, sc.recommendation"
                + " ORDER BY " + orderExpr + " " + dir + ", s.station_name LIMIT :limit";
        return jdbc.query(sql, p, (rs, i) -> new StationStat(rs.getLong("id"), rs.getString("station_name"), rs.getString("zone"),
                rs.getString("operator_name"), rs.getString("tier"), rs.getInt("num_points"), rs.getLong("sessions"),
                r1(rs.getDouble("energy_kwh")), r2(rs.getDouble("revenue")), r1(rs.getDouble("avg_dur")),
                r2(rs.getDouble("utilization_pct")), r1(rs.getDouble("sessions_per_point")), r2(rs.getDouble("avg_rating")),
                r1(rs.getDouble("reliability_score")), r1(rs.getDouble("uptime_pct")),
                rs.getString("cluster_label"), rs.getString("recommendation")));
    }

    // ================================================================== sentiment

    private SentimentDto sentiment(Filter f) {
        MapSqlParameterSource p = params(f)
                .addValue("fromTs", f.from().atStartOfDay()).addValue("toTs", f.to().plusDays(1).atStartOfDay());
        String base = " FROM reviews r JOIN dw_dim_station s ON s.station_key = r.station_id"
                + " WHERE r.created_at >= :fromTs AND r.created_at < :toTs" + dimConditions(f, false);

        double[] overall = jdbc.queryForObject("SELECT COUNT(*) AS n, COALESCE(AVG(r.rating),0) AS rt, COALESCE(AVG(r.sentiment_score),0) AS sc"
                + base, p, (rs, i) -> new double[] {rs.getLong("n"), rs.getDouble("rt"), rs.getDouble("sc")});
        long total = (long) overall[0];

        Map<String, Long> byLabel = new HashMap<>();
        jdbc.query("SELECT r.sentiment_label AS lbl, COUNT(*) AS n" + base + " GROUP BY r.sentiment_label", p,
                (RowCallbackHandler) rs -> byLabel.put(rs.getString("lbl"), rs.getLong("n")));
        List<LabelShare> labels = new ArrayList<>();
        for (String l : List.of("POSITIVE", "NEUTRAL", "NEGATIVE")) {
            long n = byLabel.getOrDefault(l, 0L);
            labels.add(new LabelShare(l, n, r1(total == 0 ? 0 : n * 100.0 / total)));
        }

        List<Keyword> pos = keywords("POSITIVE");
        List<Keyword> neg = keywords("NEGATIVE");

        String perStation = "SELECT s.station_key AS id, s.station_name AS nm, s.zone AS zn, COUNT(*) AS n, AVG(r.rating) AS rt,"
                + " AVG(r.sentiment_score) AS sc, SUM(r.sentiment_label = 'NEGATIVE') * 100.0 / COUNT(*) AS neg" + base
                + " GROUP BY s.station_key, s.station_name, s.zone HAVING COUNT(*) >= 5 ORDER BY sc ";
        List<StationSentiment> worst = jdbc.query(perStation + "ASC, nm LIMIT 5", p, (rs, i) -> toStationSentiment(rs));
        List<StationSentiment> best = jdbc.query(perStation + "DESC, nm LIMIT 5", p, (rs, i) -> toStationSentiment(rs));

        List<MonthSentiment> monthly = jdbc.query("SELECT DATE_FORMAT(r.created_at, '%Y-%m') AS mon, COUNT(*) AS n,"
                + " AVG(r.rating) AS rt, AVG(r.sentiment_score) AS sc" + base + " GROUP BY mon ORDER BY mon", p,
                (rs, i) -> new MonthSentiment(rs.getString("mon"), rs.getLong("n"), r2(rs.getDouble("rt")), r2(rs.getDouble("sc"))));
        return new SentimentDto(total, r2(overall[1]), r2(overall[2]), labels, pos, neg, worst, best, monthly);
    }

    private static StationSentiment toStationSentiment(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new StationSentiment(rs.getLong("id"), rs.getString("nm"), rs.getString("zn"), rs.getLong("n"),
                r2(rs.getDouble("rt")), r2(rs.getDouble("sc")), r1(rs.getDouble("neg")));
    }

    /** Most frequent words of one polarity (table produced by the Python NLP step; global, not filterable). */
    private List<Keyword> keywords(String label) {
        return jdbc.query("SELECT word, freq FROM sentiment_keywords WHERE label = :label ORDER BY freq DESC, word LIMIT 12",
                new MapSqlParameterSource("label", label), (rs, i) -> new Keyword(rs.getString("word"), rs.getInt("freq")));
    }

    // ================================================================== weather / holiday impact

    /**
     * Compares sessions on rainy / holiday / weekend days with a <i>local baseline</i>: the average of normal days
     * (CLEAR or CLOUDY, no holiday, same weekday/weekend type) within +-14 days. Using a local baseline removes the
     * long-term growth and the monsoon season, so the figure isolates the effect of the day itself.
     */
    private WeatherImpactDto weatherImpact(Filter f) {
        LocalDate today = clock.today();
        LocalDate lastComplete = today.minusDays(1);
        LocalDate to = f.to().isAfter(lastComplete) ? lastComplete : f.to();
        LocalDate dataStart = dataStart();
        LocalDate qFrom = f.from().minusDays(14).isBefore(dataStart) ? dataStart : f.from().minusDays(14);
        LocalDate qTo = to.plusDays(14).isAfter(lastComplete) ? lastComplete : to.plusDays(14);
        if (qTo.isBefore(qFrom)) {
            return new WeatherImpactDto(List.of(), List.of(), 0, 0, 0, 0, "no data in range");
        }
        Filter q = range(f, qFrom, qTo);
        MapSqlParameterSource p = params(q);
        List<DayRow> days = jdbc.query("SELECT d.full_date AS dt, d.weather_label AS wl, d.is_holiday AS hol, d.is_weekend AS wk,"
                + " COALESCE(x.n,0) AS n, COALESCE(x.r,0) AS r FROM dw_dim_date d"
                + " LEFT JOIN (SELECT f.date_key, COUNT(*) AS n, SUM(f.revenue) AS r FROM dw_fact_session f"
                + "            JOIN dw_dim_station s ON s.station_key = f.station_key"
                + "            JOIN dw_dim_connector c ON c.connector_key = f.connector_key"
                + "            WHERE 1 = 1" + dimConditions(q, true) + " GROUP BY f.date_key) x ON x.date_key = d.date_key"
                + " WHERE d.full_date BETWEEN :from AND :to ORDER BY d.full_date", p,
                (rs, i) -> new DayRow(rs.getDate("dt").toLocalDate(), rs.getString("wl") == null ? "UNKNOWN" : rs.getString("wl"),
                        rs.getInt("hol") == 1, rs.getInt("wk") == 1, rs.getDouble("n"), rs.getDouble("r")));

        // index (%) of every reported day against its local baseline
        Map<String, List<Double>> idxByCondition = new LinkedHashMap<>();
        Map<String, double[]> sumByCondition = new LinkedHashMap<>(); // [days, sessions, revenue]
        for (String c : List.of("CLEAR", "CLOUDY", "RAIN", "HEAVY_RAIN")) {
            idxByCondition.put(c, new ArrayList<>());
            sumByCondition.put(c, new double[3]);
        }
        List<Double> holidayIdx = new ArrayList<>();
        double[] holSum = new double[3];
        double[] wkdaySum = new double[3];
        double[] wkendSum = new double[3];
        for (int i = 0; i < days.size(); i++) {
            DayRow d = days.get(i);
            if (d.date().isBefore(f.from()) || d.date().isAfter(to)) {
                continue;
            }
            double baseline = baseline(days, i);
            Double idx = baseline <= 0 ? null : (d.sessions() / baseline - 1) * 100;
            double[] cond = sumByCondition.get(d.weather());
            if (cond != null) {
                cond[0]++;
                cond[1] += d.sessions();
                cond[2] += d.revenue();
                if (idx != null) {
                    idxByCondition.get(d.weather()).add(idx);
                }
            }
            double[] type = d.holiday() ? holSum : (d.weekend() ? wkendSum : wkdaySum);
            type[0]++;
            type[1] += d.sessions();
            type[2] += d.revenue();
            if (d.holiday() && idx != null) {
                holidayIdx.add(idx);
            }
        }
        List<WeatherRow> byCondition = new ArrayList<>();
        for (Map.Entry<String, double[]> e : sumByCondition.entrySet()) {
            double[] s = e.getValue();
            byCondition.add(new WeatherRow(e.getKey(), (int) s[0], r1(s[0] == 0 ? 0 : s[1] / s[0]), r2(s[0] == 0 ? 0 : s[2] / s[0]),
                    r1(avg(idxByCondition.get(e.getKey())))));
        }
        double wkdayAvg = wkdaySum[0] == 0 ? 0 : wkdaySum[1] / wkdaySum[0];
        double wkendAvg = wkendSum[0] == 0 ? 0 : wkendSum[1] / wkendSum[0];
        double weekendImpact = wkdayAvg == 0 ? 0 : (wkendAvg / wkdayAvg - 1) * 100;
        double holidayImpact = avg(holidayIdx);
        List<WeatherRow> byDayType = List.of(
                new WeatherRow("WEEKDAY", (int) wkdaySum[0], r1(wkdayAvg), r2(wkdaySum[0] == 0 ? 0 : wkdaySum[2] / wkdaySum[0]), 0),
                new WeatherRow("WEEKEND", (int) wkendSum[0], r1(wkendAvg), r2(wkendSum[0] == 0 ? 0 : wkendSum[2] / wkendSum[0]), r1(weekendImpact)),
                new WeatherRow("PUBLIC_HOLIDAY", (int) holSum[0], r1(holSum[0] == 0 ? 0 : holSum[1] / holSum[0]),
                        r2(holSum[0] == 0 ? 0 : holSum[2] / holSum[0]), r1(holidayImpact)));

        List<Double> rainIdx = new ArrayList<>(idxByCondition.get("RAIN"));
        rainIdx.addAll(idxByCondition.get("HEAVY_RAIN"));
        return new WeatherImpactDto(byCondition, byDayType, r1(avg(rainIdx)), r1(avg(idxByCondition.get("HEAVY_RAIN"))),
                r1(holidayImpact), r1(weekendImpact),
                "adjustedImpactPct = mean of (sessions / local baseline - 1); baseline = average of normal days (CLEAR/CLOUDY, "
                        + "no holiday, same weekday/weekend type) within +-14 days. WEEKEND is compared with WEEKDAY.");
    }

    /** One calendar day with its weather / holiday flags and the filtered session totals. */
    private record DayRow(LocalDate date, String weather, boolean holiday, boolean weekend, double sessions, double revenue) { }

    /**
     * Average sessions of the "normal" comparable days (CLEAR/CLOUDY, no holiday, same weekday/weekend type) within
     * +-14 days of days[i]; 0 when fewer than 3 such days exist. {@code days} holds consecutive calendar days.
     */
    private static double baseline(List<DayRow> days, int i) {
        DayRow me = days.get(i);
        double sum = 0;
        int cnt = 0;
        for (int j = Math.max(0, i - 14); j <= Math.min(days.size() - 1, i + 14); j++) {
            if (j == i) {
                continue;
            }
            DayRow o = days.get(j);
            boolean normal = !o.holiday() && (o.weather().equals("CLEAR") || o.weather().equals("CLOUDY"));
            if (normal && o.weekend() == me.weekend()) {
                sum += o.sessions();
                cnt++;
            }
        }
        return cnt < 3 ? 0 : sum / cnt;
    }

    // ================================================================== cohorts

    private List<CohortCell> cohorts(Filter f) {
        Filter all = range(f, LocalDate.of(2020, 1, 1), f.to()); // activity of the whole history up to "to"
        MapSqlParameterSource p = params(all).addValue("fromMonth", f.from().toString().substring(0, 7));
        record Row(String cohort, int offset, long active) { }
        List<Row> rows = jdbc.query("WITH act AS (SELECT DISTINCT f.user_key AS user_key, d.month_key AS am" + SESSION_FROM
                + where(all, p, true) + "),"
                + " firsts AS (SELECT user_key, MIN(am) AS cm FROM act GROUP BY user_key)"
                + " SELECT fi.cm AS cohort,"
                + " TIMESTAMPDIFF(MONTH, STR_TO_DATE(CONCAT(fi.cm, '-01'), '%Y-%m-%d'), STR_TO_DATE(CONCAT(a.am, '-01'), '%Y-%m-%d')) AS mo,"
                + " COUNT(*) AS active"
                + " FROM firsts fi JOIN act a ON a.user_key = fi.user_key"
                + " WHERE fi.cm >= :fromMonth GROUP BY fi.cm, mo HAVING mo <= 12 ORDER BY fi.cm, mo", p,
                (rs, i) -> new Row(rs.getString("cohort"), rs.getInt("mo"), rs.getLong("active")));
        Map<String, Long> size = new HashMap<>();
        for (Row r : rows) {
            if (r.offset() == 0) {
                size.put(r.cohort(), r.active());
            }
        }
        List<CohortCell> out = new ArrayList<>();
        for (Row r : rows) {
            long s = size.getOrDefault(r.cohort(), 0L);
            out.add(new CohortCell(r.cohort(), s, r.offset(), r.active(), r1(s == 0 ? 0 : r.active() * 100.0 / s)));
        }
        return out;
    }

    // ================================================================== lead time

    private List<LeadTimeBucket> leadTime(Filter f) {
        MapSqlParameterSource p = params(f);
        String[] names = {"Walk-in (0 h)", "< 2 h", "2-6 h", "6-24 h", "1-3 days", "> 3 days"};
        record Row(int ord, long n, double rev, long can, long ns, long res) { }
        List<Row> rows = jdbc.query("SELECT CASE WHEN f.lead_time_hours = 0 THEN 0 WHEN f.lead_time_hours < 2 THEN 1"
                + " WHEN f.lead_time_hours < 6 THEN 2 WHEN f.lead_time_hours < 24 THEN 3 WHEN f.lead_time_hours < 72 THEN 4 ELSE 5 END AS bk,"
                + " COUNT(*) AS n, COALESCE(AVG(f.est_revenue),0) AS rev, COALESCE(SUM(f.status = 'CANCELLED'),0) AS can,"
                + " COALESCE(SUM(f.status = 'NO_SHOW'),0) AS ns,"
                + " COALESCE(SUM(f.status IN ('COMPLETED','CANCELLED','NO_SHOW')),0) AS res"
                + BOOKING_FROM + where(f, p, true) + " AND f.status <> 'EXPIRED' GROUP BY bk ORDER BY bk", p,
                (rs, i) -> new Row(rs.getInt("bk"), rs.getLong("n"), rs.getDouble("rev"), rs.getLong("can"), rs.getLong("ns"), rs.getLong("res")));
        Map<Integer, Row> byOrd = new HashMap<>();
        long total = 0;
        for (Row r : rows) {
            byOrd.put(r.ord(), r);
            total += r.n();
        }
        List<LeadTimeBucket> out = new ArrayList<>();
        for (int o = 0; o < names.length; o++) {
            Row r = byOrd.getOrDefault(o, new Row(o, 0, 0, 0, 0, 0));
            out.add(new LeadTimeBucket(o + 1, names[o], r.n(), r1(total == 0 ? 0 : r.n() * 100.0 / total), r2(r.rev()),
                    r1(r.res() == 0 ? 0 : r.can() * 100.0 / r.res()), r1(r.res() == 0 ? 0 : r.ns() * 100.0 / r.res())));
        }
        return out;
    }

    // ================================================================== insights (rule based text)

    /**
     * Turns the numbers of the other endpoints into plain-English sentences. Every rule only fires when its data
     * exists, so the list adapts to the selected filters (at most 10 sentences).
     */
    private List<Insight> insights(Filter f) {
        List<Insight> out = new ArrayList<>();
        OverviewDto ov = overview(f);
        Kpis k = ov.kpis();
        if (k.sessions() == 0) {
            out.add(new Insight("DATA", "No charging sessions were found for the selected period and filters."));
            return out;
        }

        // 1. revenue movement
        Double dRev = ov.deltaPct().get("revenue");
        out.add(new Insight("REVENUE", "Revenue was " + inr(k.revenue()) + " from " + fmt(k.sessions()) + " sessions"
                + (dRev == null ? "." : ", " + (dRev >= 0 ? "up " : "down ") + fmt1(Math.abs(dRev)) + "% on the previous period.")));

        // 2. busiest hour + weekday (heat-map)
        List<HeatCell> heat = heatmap(f, "sessions", null);
        double[] byHour = new double[24];
        double[] byDay = new double[8];
        double total = 0;
        for (HeatCell c : heat) {
            byHour[c.hour()] += c.value();
            byDay[c.dayOfWeek()] += c.value();
            total += c.value();
        }
        int peakHour = 0;
        for (int h = 1; h < 24; h++) {
            if (byHour[h] > byHour[peakHour]) {
                peakHour = h;
            }
        }
        int peakDay = 1;
        for (int d = 2; d <= 7; d++) {
            if (byDay[d] > byDay[peakDay]) {
                peakDay = d;
            }
        }
        if (total > 0) {
            out.add(new Insight("DEMAND", String.format(Locale.ROOT,
                    "The busiest hour is %02d:00-%02d:00 with %s%% of all sessions; %s is the busiest weekday (%s%%) and weekends carry %s%% of sessions.",
                    peakHour, (peakHour + 1) % 24, fmt1(byHour[peakHour] * 100 / total), DAY_NAMES[peakDay],
                    fmt1(byDay[peakDay] * 100 / total), fmt1((byDay[6] + byDay[7]) * 100 / total))));
        }

        // 3. best zone + fastest growing zone
        List<ZoneStat> zones = zones(f);
        if (!zones.isEmpty() && zones.get(0).sessions() > 0) {
            ZoneStat best = zones.get(0);
            out.add(new Insight("ZONE", best.zone() + " is the top-earning zone with " + inr(best.revenue()) + " ("
                    + fmt1(best.sharePct()) + "% of sessions) across " + best.stations() + " station" + (best.stations() == 1 ? "" : "s") + "."));
        }
        ZoneStat grower = null;
        for (ZoneStat z : zones) {
            if (z.growthPct() != null && (grower == null || z.growthPct() > grower.growthPct())) {
                grower = z;
            }
        }
        if (grower != null) {
            out.add(new Insight("GROWTH", grower.zone() + " is the fastest-growing zone: sessions in the last 30 days are "
                    + (grower.growthPct() >= 0 ? "up " : "down ") + fmt1(Math.abs(grower.growthPct())) + "% versus the 30 days before."));
        }

        // 4. weather
        WeatherImpactDto w = weatherImpact(f);
        // weather / holiday statistics are only meaningful over at least four weeks
        boolean longEnough = ChronoUnit.DAYS.between(f.from(), f.to()) + 1 >= 28;
        int rainDays = w.byCondition().stream()
                .filter(r -> r.condition().equals("RAIN") || r.condition().equals("HEAVY_RAIN")).mapToInt(WeatherRow::days).sum();
        int heavyDays = w.byCondition().stream().filter(r -> r.condition().equals("HEAVY_RAIN")).mapToInt(WeatherRow::days).sum();
        boolean haveRain = longEnough && rainDays >= 5;
        boolean haveHoliday = longEnough && w.byDayType().get(2).days() > 0;
        if (haveRain || haveHoliday) {
            String text = "";
            if (haveRain) {
                text = "Rainy days see " + fmt1(Math.abs(w.rainImpactPct())) + "% " + (w.rainImpactPct() <= 0 ? "fewer" : "more")
                        + " sessions than comparable dry days"
                        + (heavyDays >= 3 ? " (heavy rain: " + signed(w.heavyRainImpactPct()) + "%)" : "");
            }
            if (haveHoliday) {
                text += (haveRain ? "; public" : "Public") + " holidays shift demand by " + signed(w.holidayImpactPct())
                        + "% versus a normal day of the same type";
            }
            out.add(new Insight("WEATHER", text + "."));
        }

        // 5. booking behaviour: no-shows, cancellations, riskiest lead time
        if (k.bookings() > 0) {
            List<LeadTimeBucket> lt = leadTime(f);
            LeadTimeBucket worst = null;
            for (LeadTimeBucket b : lt) {
                if (b.bookings() >= 30 && (worst == null || b.noShowRatePct() > worst.noShowRatePct())) {
                    worst = b;
                }
            }
            out.add(new Insight("BOOKING", "No-shows are " + fmt1(k.noShowRatePct()) + "% and cancellations " + fmt1(k.cancellationRatePct())
                    + "% of resolved bookings" + (worst == null ? "." : "; bookings made " + worst.bucket()
                    + " ahead are the riskiest (" + fmt1(worst.noShowRatePct()) + "% no-show).")));
        }

        // 6. under-utilised stations
        List<StationStat> low = stations(f, "utilization", "asc", 100);
        double avgUtil = low.stream().mapToDouble(StationStat::utilizationPct).average().orElse(0);
        List<String> names = new ArrayList<>();
        for (StationStat s : low) {
            if (s.utilizationPct() < avgUtil * 0.5 && names.size() < 3) {
                names.add(s.name());
            }
        }
        if (!names.isEmpty()) {
            long cnt = low.stream().filter(s -> s.utilizationPct() < avgUtil * 0.5).count();
            out.add(new Insight("UTILISATION", cnt + " station" + (cnt == 1 ? " runs" : "s run") + " below half of the average utilisation ("
                    + fmt1(avgUtil) + "%), e.g. " + String.join(", ", names) + " - candidates for promotions or re-siting."));
        }

        // 7. connector mix
        List<MixSlice> mix = mix(f, "connector");
        if (!mix.isEmpty()) {
            MixSlice top = mix.get(0);
            out.add(new Insight("MIX", top.label() + " is the most used connector with " + fmt1(top.sharePct()) + "% of sessions and "
                    + inr(top.revenue()) + " revenue."));
        }

        // 8. funnel
        List<FunnelStage> fn = funnel(f);
        FunnelStage drop = null;
        for (FunnelStage s : fn) {
            if (s.stepConversionPct() != null && (drop == null || s.stepConversionPct() < drop.stepConversionPct())) {
                drop = s;
            }
        }
        if (drop != null) {
            String from = FUNNEL_STAGES.get(drop.stageNo() - 2);
            out.add(new Insight("FUNNEL", "The biggest drop-off in the booking funnel is " + from + " -> " + drop.stage() + ": only "
                    + fmt1(drop.stepConversionPct()) + "% continue."));
        }

        // 9. sentiment
        SentimentDto se = sentiment(f);
        if (se.reviews() > 0) {
            double neg = se.labels().stream().filter(l -> l.label().equals("NEGATIVE")).mapToDouble(LabelShare::pct).sum();
            out.add(new Insight("SENTIMENT", fmt1(neg) + "% of " + fmt(se.reviews()) + " reviews are negative (average rating "
                    + fmt2(se.avgRating()) + "/5)"
                    + (se.negativeKeywords().isEmpty() ? "." : "; the most frequent complaint keyword is \"" + se.negativeKeywords().get(0).word() + "\".")));
        }

        return out.size() > 10 ? new ArrayList<>(out.subList(0, 10)) : out;
    }

    // ================================================================== small helpers

    private static double avg(List<Double> l) {
        return l.isEmpty() ? 0 : l.stream().mapToDouble(Double::doubleValue).average().orElse(0);
    }

    private static Double pctChange(double cur, double prev) {
        return prev == 0 ? null : r1((cur - prev) / prev * 100);
    }

    private static double r1(double v) {
        return Double.isNaN(v) || Double.isInfinite(v) ? 0 : Math.round(v * 10.0) / 10.0;
    }

    private static double r2(double v) {
        return Double.isNaN(v) || Double.isInfinite(v) ? 0 : Math.round(v * 100.0) / 100.0;
    }

    private static double r4(double v) {
        return Double.isNaN(v) || Double.isInfinite(v) ? 0 : Math.round(v * 10000.0) / 10000.0;
    }

    private static String fmt(long v) {
        return String.format(Locale.ROOT, "%,d", v);
    }

    private static String fmt1(double v) {
        return String.format(Locale.ROOT, "%.1f", v);
    }

    private static String fmt2(double v) {
        return String.format(Locale.ROOT, "%.2f", v);
    }

    private static String signed(double v) {
        return (v >= 0 ? "+" : "-") + fmt1(Math.abs(v));
    }

    /** Rupees with Indian digit grouping, e.g. 1234567 -> "\u20B912,34,567". */
    static String inr(double amount) {
        long v = Math.round(amount);
        String digits = Long.toString(Math.abs(v));
        StringBuilder sb = new StringBuilder();
        int len = digits.length();
        if (len <= 3) {
            sb.append(digits);
        } else {
            String head = digits.substring(0, len - 3);
            String tail = digits.substring(len - 3);
            StringBuilder grouped = new StringBuilder();
            for (int i = head.length(); i > 0; i -= 2) {
                grouped.insert(0, head.substring(Math.max(0, i - 2), i));
                if (i - 2 > 0) {
                    grouped.insert(0, ',');
                }
            }
            sb.append(grouped).append(',').append(tail);
        }
        return "₹" + (v < 0 ? "-" : "") + sb;
    }

    private static String ts(Timestamp t) {
        return t == null ? "" : t.toLocalDateTime().toString().replace('T', ' ');
    }

    /** RFC 4180 quoting; also neutralises spreadsheet formula injection (cells starting with = + - @). */
    static String csv(String s) {
        if (s == null) {
            return "";
        }
        String v = s;
        if (!v.isEmpty() && "=+-@".indexOf(v.charAt(0)) >= 0) {
            v = "'" + v;
        }
        if (v.indexOf(',') >= 0 || v.indexOf('"') >= 0 || v.indexOf('\n') >= 0 || v.indexOf('\r') >= 0) {
            return '"' + v.replace("\"", "\"\"") + '"';
        }
        return v;
    }
}
