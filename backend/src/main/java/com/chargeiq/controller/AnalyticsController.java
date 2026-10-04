package com.chargeiq.controller;

import java.io.IOException;
import java.time.LocalDate;
import java.util.List;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.format.annotation.DateTimeFormat.ISO;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.chargeiq.dto.AnalyticsDtos.CohortCell;
import com.chargeiq.dto.AnalyticsDtos.Filter;
import com.chargeiq.dto.AnalyticsDtos.FunnelStage;
import com.chargeiq.dto.AnalyticsDtos.HeatCell;
import com.chargeiq.dto.AnalyticsDtos.Insight;
import com.chargeiq.dto.AnalyticsDtos.LeadTimeBucket;
import com.chargeiq.dto.AnalyticsDtos.MixSlice;
import com.chargeiq.dto.AnalyticsDtos.OverviewDto;
import com.chargeiq.dto.AnalyticsDtos.SegmentStat;
import com.chargeiq.dto.AnalyticsDtos.SentimentDto;
import com.chargeiq.dto.AnalyticsDtos.StationStat;
import com.chargeiq.dto.AnalyticsDtos.TrendDto;
import com.chargeiq.dto.AnalyticsDtos.WeatherImpactDto;
import com.chargeiq.dto.AnalyticsDtos.ZoneStat;
import com.chargeiq.security.AuthUser;
import com.chargeiq.service.AnalyticsService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Read-only BI endpoints for ADMIN and OPERATOR (rule in SecurityConfig). Every endpoint accepts the same optional
 * filters; an OPERATOR is silently restricted to its own operator by {@link AnalyticsService}.
 */
@RestController
@RequestMapping("/api/analytics")
@Tag(name = "Analytics", description = "Network KPIs, trends + forecast, heat-map, zones, segments, funnel, sentiment, cohorts, insights, CSV export")
public class AnalyticsController {

    private final AnalyticsService service;

    public AnalyticsController(AnalyticsService service) {
        this.service = service;
    }

    private static Filter filter(LocalDate from, LocalDate to, String zone, String connector, String tier, Long operatorId) {
        return new Filter(from, to, zone, connector, tier, operatorId);
    }

    @GetMapping("/overview")
    @Operation(summary = "KPI cards, previous-period comparison, % change and 30-day sparkline")
    public ResponseEntity<OverviewDto> overview(
            @AuthenticationPrincipal AuthUser actor,
            @RequestParam(name = "from", required = false) @DateTimeFormat(iso = ISO.DATE) LocalDate from,
            @RequestParam(name = "to", required = false) @DateTimeFormat(iso = ISO.DATE) LocalDate to,
            @RequestParam(name = "zone", required = false) String zone,
            @RequestParam(name = "connector", required = false) String connector,
            @RequestParam(name = "tier", required = false) String tier,
            @RequestParam(name = "operatorId", required = false) Long operatorId) {
        return ResponseEntity.ok(service.overview(actor, filter(from, to, zone, connector, tier, operatorId)));
    }

    @GetMapping("/trend")
    @Operation(summary = "Sessions / energy / revenue over time + 14-day Holt-Winters forecast + anomalies")
    public ResponseEntity<TrendDto> trend(
            @AuthenticationPrincipal AuthUser actor,
            @RequestParam(name = "from", required = false) @DateTimeFormat(iso = ISO.DATE) LocalDate from,
            @RequestParam(name = "to", required = false) @DateTimeFormat(iso = ISO.DATE) LocalDate to,
            @RequestParam(name = "zone", required = false) String zone,
            @RequestParam(name = "connector", required = false) String connector,
            @RequestParam(name = "tier", required = false) String tier,
            @RequestParam(name = "operatorId", required = false) Long operatorId,
            @Parameter(description = "DAY | WEEK | MONTH") @RequestParam(name = "granularity", defaultValue = "DAY") String granularity) {
        return ResponseEntity.ok(service.trend(actor, filter(from, to, zone, connector, tier, operatorId), granularity));
    }

    @GetMapping("/heatmap")
    @Operation(summary = "Weekday x hour heat-map (168 cells) of sessions or revenue")
    public ResponseEntity<List<HeatCell>> heatmap(
            @AuthenticationPrincipal AuthUser actor,
            @RequestParam(name = "from", required = false) @DateTimeFormat(iso = ISO.DATE) LocalDate from,
            @RequestParam(name = "to", required = false) @DateTimeFormat(iso = ISO.DATE) LocalDate to,
            @RequestParam(name = "zone", required = false) String zone,
            @RequestParam(name = "connector", required = false) String connector,
            @RequestParam(name = "tier", required = false) String tier,
            @RequestParam(name = "operatorId", required = false) Long operatorId,
            @Parameter(description = "sessions | revenue") @RequestParam(name = "metric", defaultValue = "sessions") String metric,
            @RequestParam(name = "stationId", required = false) Long stationId) {
        return ResponseEntity.ok(service.heatmap(actor, filter(from, to, zone, connector, tier, operatorId), metric, stationId));
    }

    @GetMapping("/zones")
    @Operation(summary = "Per-zone sessions, revenue, utilisation and 30-day growth")
    public ResponseEntity<List<ZoneStat>> zones(
            @AuthenticationPrincipal AuthUser actor,
            @RequestParam(name = "from", required = false) @DateTimeFormat(iso = ISO.DATE) LocalDate from,
            @RequestParam(name = "to", required = false) @DateTimeFormat(iso = ISO.DATE) LocalDate to,
            @RequestParam(name = "zone", required = false) String zone,
            @RequestParam(name = "connector", required = false) String connector,
            @RequestParam(name = "tier", required = false) String tier,
            @RequestParam(name = "operatorId", required = false) Long operatorId) {
        return ResponseEntity.ok(service.zones(actor, filter(from, to, zone, connector, tier, operatorId)));
    }

    @GetMapping("/mix")
    @Operation(summary = "Share of sessions by connector | vehicleCategory | payment | source | tier | dayPart")
    public ResponseEntity<List<MixSlice>> mix(
            @AuthenticationPrincipal AuthUser actor,
            @RequestParam(name = "from", required = false) @DateTimeFormat(iso = ISO.DATE) LocalDate from,
            @RequestParam(name = "to", required = false) @DateTimeFormat(iso = ISO.DATE) LocalDate to,
            @RequestParam(name = "zone", required = false) String zone,
            @RequestParam(name = "connector", required = false) String connector,
            @RequestParam(name = "tier", required = false) String tier,
            @RequestParam(name = "operatorId", required = false) Long operatorId,
            @RequestParam(name = "by", defaultValue = "connector") String by) {
        return ResponseEntity.ok(service.mix(actor, filter(from, to, zone, connector, tier, operatorId), by));
    }

    @GetMapping("/funnel")
    @Operation(summary = "Booking funnel SEARCH -> VIEW_STATION -> SELECT_SLOT -> BOOK -> CHECK_IN -> COMPLETE")
    public ResponseEntity<List<FunnelStage>> funnel(
            @AuthenticationPrincipal AuthUser actor,
            @RequestParam(name = "from", required = false) @DateTimeFormat(iso = ISO.DATE) LocalDate from,
            @RequestParam(name = "to", required = false) @DateTimeFormat(iso = ISO.DATE) LocalDate to,
            @RequestParam(name = "zone", required = false) String zone,
            @RequestParam(name = "connector", required = false) String connector,
            @RequestParam(name = "tier", required = false) String tier,
            @RequestParam(name = "operatorId", required = false) Long operatorId) {
        return ResponseEntity.ok(service.funnel(actor, filter(from, to, zone, connector, tier, operatorId)));
    }

    @GetMapping("/segments")
    @Operation(summary = "Customer segments (K-Means labels): users, sessions, revenue, night / weekend share")
    public ResponseEntity<List<SegmentStat>> segments(
            @AuthenticationPrincipal AuthUser actor,
            @RequestParam(name = "from", required = false) @DateTimeFormat(iso = ISO.DATE) LocalDate from,
            @RequestParam(name = "to", required = false) @DateTimeFormat(iso = ISO.DATE) LocalDate to,
            @RequestParam(name = "zone", required = false) String zone,
            @RequestParam(name = "connector", required = false) String connector,
            @RequestParam(name = "tier", required = false) String tier,
            @RequestParam(name = "operatorId", required = false) Long operatorId) {
        return ResponseEntity.ok(service.segments(actor, filter(from, to, zone, connector, tier, operatorId)));
    }

    @GetMapping("/stations")
    @Operation(summary = "Station leaderboard")
    public ResponseEntity<List<StationStat>> stations(
            @AuthenticationPrincipal AuthUser actor,
            @RequestParam(name = "from", required = false) @DateTimeFormat(iso = ISO.DATE) LocalDate from,
            @RequestParam(name = "to", required = false) @DateTimeFormat(iso = ISO.DATE) LocalDate to,
            @RequestParam(name = "zone", required = false) String zone,
            @RequestParam(name = "connector", required = false) String connector,
            @RequestParam(name = "tier", required = false) String tier,
            @RequestParam(name = "operatorId", required = false) Long operatorId,
            @Parameter(description = "sessions | revenue | energy | utilization | sessionsPerPoint | rating | reliability")
            @RequestParam(name = "sort", defaultValue = "sessions") String sort,
            @Parameter(description = "desc (default) | asc") @RequestParam(name = "order", defaultValue = "desc") String order,
            @RequestParam(name = "limit", defaultValue = "10") int limit) {
        return ResponseEntity.ok(service.stations(actor, filter(from, to, zone, connector, tier, operatorId), sort, order, limit));
    }

    @GetMapping("/sentiment")
    @Operation(summary = "Review sentiment: label split, keywords, best / worst stations, monthly trend")
    public ResponseEntity<SentimentDto> sentiment(
            @AuthenticationPrincipal AuthUser actor,
            @RequestParam(name = "from", required = false) @DateTimeFormat(iso = ISO.DATE) LocalDate from,
            @RequestParam(name = "to", required = false) @DateTimeFormat(iso = ISO.DATE) LocalDate to,
            @RequestParam(name = "zone", required = false) String zone,
            @RequestParam(name = "connector", required = false) String connector,
            @RequestParam(name = "tier", required = false) String tier,
            @RequestParam(name = "operatorId", required = false) Long operatorId) {
        return ResponseEntity.ok(service.sentiment(actor, filter(from, to, zone, connector, tier, operatorId)));
    }

    @GetMapping("/weather-impact")
    @Operation(summary = "Effect of rain, holidays and weekends on daily sessions")
    public ResponseEntity<WeatherImpactDto> weatherImpact(
            @AuthenticationPrincipal AuthUser actor,
            @RequestParam(name = "from", required = false) @DateTimeFormat(iso = ISO.DATE) LocalDate from,
            @RequestParam(name = "to", required = false) @DateTimeFormat(iso = ISO.DATE) LocalDate to,
            @RequestParam(name = "zone", required = false) String zone,
            @RequestParam(name = "connector", required = false) String connector,
            @RequestParam(name = "tier", required = false) String tier,
            @RequestParam(name = "operatorId", required = false) Long operatorId) {
        return ResponseEntity.ok(service.weatherImpact(actor, filter(from, to, zone, connector, tier, operatorId)));
    }

    @GetMapping("/cohorts")
    @Operation(summary = "Retention cohorts by month of first charging session (flat heat-map cells)")
    public ResponseEntity<List<CohortCell>> cohorts(
            @AuthenticationPrincipal AuthUser actor,
            @RequestParam(name = "from", required = false) @DateTimeFormat(iso = ISO.DATE) LocalDate from,
            @RequestParam(name = "to", required = false) @DateTimeFormat(iso = ISO.DATE) LocalDate to,
            @RequestParam(name = "zone", required = false) String zone,
            @RequestParam(name = "connector", required = false) String connector,
            @RequestParam(name = "tier", required = false) String tier,
            @RequestParam(name = "operatorId", required = false) Long operatorId) {
        return ResponseEntity.ok(service.cohorts(actor, filter(from, to, zone, connector, tier, operatorId)));
    }

    @GetMapping("/lead-time")
    @Operation(summary = "Booking lead-time distribution with cancellation / no-show rate per bucket")
    public ResponseEntity<List<LeadTimeBucket>> leadTime(
            @AuthenticationPrincipal AuthUser actor,
            @RequestParam(name = "from", required = false) @DateTimeFormat(iso = ISO.DATE) LocalDate from,
            @RequestParam(name = "to", required = false) @DateTimeFormat(iso = ISO.DATE) LocalDate to,
            @RequestParam(name = "zone", required = false) String zone,
            @RequestParam(name = "connector", required = false) String connector,
            @RequestParam(name = "tier", required = false) String tier,
            @RequestParam(name = "operatorId", required = false) Long operatorId) {
        return ResponseEntity.ok(service.leadTime(actor, filter(from, to, zone, connector, tier, operatorId)));
    }

    @GetMapping("/insights")
    @Operation(summary = "Auto-generated plain-English insights (rule based, from the same data)")
    public ResponseEntity<List<Insight>> insights(
            @AuthenticationPrincipal AuthUser actor,
            @RequestParam(name = "from", required = false) @DateTimeFormat(iso = ISO.DATE) LocalDate from,
            @RequestParam(name = "to", required = false) @DateTimeFormat(iso = ISO.DATE) LocalDate to,
            @RequestParam(name = "zone", required = false) String zone,
            @RequestParam(name = "connector", required = false) String connector,
            @RequestParam(name = "tier", required = false) String tier,
            @RequestParam(name = "operatorId", required = false) Long operatorId) {
        return ResponseEntity.ok(service.insights(actor, filter(from, to, zone, connector, tier, operatorId)));
    }

    /**
     * CSV download. Written straight to the servlet response (synchronously) instead of a StreamingResponseBody so
     * that the security context of the JWT request is still available while the rows are produced.
     */
    @GetMapping("/export/sessions.csv")
    @Operation(summary = "Download the filtered charging sessions as CSV")
    public void exportSessions(
            @AuthenticationPrincipal AuthUser actor,
            @RequestParam(name = "from", required = false) @DateTimeFormat(iso = ISO.DATE) LocalDate from,
            @RequestParam(name = "to", required = false) @DateTimeFormat(iso = ISO.DATE) LocalDate to,
            @RequestParam(name = "zone", required = false) String zone,
            @RequestParam(name = "connector", required = false) String connector,
            @RequestParam(name = "tier", required = false) String tier,
            @RequestParam(name = "operatorId", required = false) Long operatorId,
            HttpServletResponse response) throws IOException {
        // validate + apply the operator restriction first, so a bad request still gets the normal JSON error body
        Filter resolved = service.resolve(actor, filter(from, to, zone, connector, tier, operatorId));
        response.setContentType("text/csv");
        response.setCharacterEncoding("UTF-8");
        response.setHeader(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"chargeiq-sessions.csv\"");
        service.exportSessionsCsv(resolved, response.getWriter());
        response.getWriter().flush();
    }
}
