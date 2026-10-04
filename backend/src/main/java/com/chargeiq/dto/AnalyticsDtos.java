package com.chargeiq.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * Response records of the analytics module. JSON shape: flat objects / arrays of flat objects with camelCase names,
 * ready to be plotted. Money is INR (plain numbers, rounded to 2 decimals), energy in kWh, percentages are 0..100.
 */
public final class AnalyticsDtos {
    private AnalyticsDtos() { }

    /** Common filters (all optional). Resolved defaults: to = app "today", from = to - 89 days. */
    public record Filter(LocalDate from, LocalDate to, String zone, String connector, String tier, Long operatorId) { }

    // ---------------------------------------------------------------- overview
    /** Headline KPIs for one period. {@code peakHour} is null when the period has no sessions. */
    public record Kpis(long sessions, double energyKwh, double revenue, double avgSessionKwh, double avgDurationMin,
                       double utilizationPct, long uniqueUsers, long bookings, double cancellationRatePct,
                       double noShowRatePct, double co2AvoidedKg, double avgLeadHours, Integer peakHour) { }

    public record SparkPoint(LocalDate date, long sessions, double revenue, double energyKwh) { }

    /** {@code previous} = the immediately preceding period of equal length; {@code deltaPct} has one entry per KPI key (null when previous is 0). */
    public record OverviewDto(LocalDate from, LocalDate to, Kpis kpis, Kpis previous, Map<String, Double> deltaPct,
                              List<SparkPoint> sparkline) { }

    // ---------------------------------------------------------------- trend
    /** {@code period}: DAY -> yyyy-MM-dd, WEEK -> Monday of the week (yyyy-MM-dd), MONTH -> yyyy-MM. */
    public record TrendPoint(String period, long sessions, double energyKwh, double revenue, double avgTariff) { }

    public record ForecastPoint(LocalDate date, double predicted, double lower, double upper) { }

    public record AnomalyPoint(LocalDate date, double value, double expected, double zScore, String reason) { }

    public record TrendDto(String granularity, String forecastMethod, List<TrendPoint> series, List<ForecastPoint> forecast,
                           List<AnomalyPoint> anomalies) { }

    // ---------------------------------------------------------------- heatmap / zones / mix
    /** dayOfWeek 1=Monday .. 7=Sunday, hour 0..23. All 168 cells are always returned. */
    public record HeatCell(int dayOfWeek, int hour, double value) { }

    public record ZoneStat(String zone, int stations, int points, double latitude, double longitude, long sessions,
                           double energyKwh, double revenue, double avgRevenuePerSession, double sharePct,
                           double utilizationPct, Double growthPct) { }

    public record MixSlice(String label, long sessions, double sharePct, double energyKwh, double revenue) { }

    // ---------------------------------------------------------------- funnel / segments
    public record FunnelStage(int stageNo, String stage, long sessions, double pctOfFirst, Double stepConversionPct,
                              double dropOffPct) { }

    public record SegmentStat(String segment, long users, long sessions, double energyKwh, double revenue,
                              double revenuePerUser, double sharePct, double avgSessionsPerUser, double nightSharePct,
                              double weekendSharePct) { }

    // ---------------------------------------------------------------- stations
    public record StationStat(long stationId, String name, String zone, String operatorName, String tier, int points,
                              long sessions, double energyKwh, double revenue, double avgDurationMin,
                              double utilizationPct, double sessionsPerPoint, double avgRating, double reliabilityScore,
                              double uptimePct, String clusterLabel, String recommendation) { }

    // ---------------------------------------------------------------- sentiment
    public record LabelShare(String label, long count, double pct) { }

    public record Keyword(String word, int freq) { }

    public record StationSentiment(long stationId, String name, String zone, long reviews, double avgRating,
                                   double avgSentiment, double negativePct) { }

    public record MonthSentiment(String month, long reviews, double avgRating, double avgSentiment) { }

    public record SentimentDto(long reviews, double avgRating, double avgSentiment, List<LabelShare> labels,
                               List<Keyword> positiveKeywords, List<Keyword> negativeKeywords,
                               List<StationSentiment> worstStations, List<StationSentiment> bestStations,
                               List<MonthSentiment> monthly) { }

    // ---------------------------------------------------------------- weather
    /** Per weather condition / day type: {@code adjustedImpactPct} = average of (sessions / local baseline) - 1, in %. */
    public record WeatherRow(String condition, int days, double avgSessionsPerDay, double avgRevenuePerDay,
                             double adjustedImpactPct) { }

    public record WeatherImpactDto(List<WeatherRow> byCondition, List<WeatherRow> byDayType, double rainImpactPct,
                                   double heavyRainImpactPct, double holidayImpactPct, double weekendImpactPct,
                                   String method) { }

    // ---------------------------------------------------------------- cohorts / lead time
    /** One heat-map cell: users whose first session was in {@code cohort} (yyyy-MM) and who charged again {@code monthOffset} months later. */
    public record CohortCell(String cohort, long cohortSize, int monthOffset, long activeUsers, double retentionPct) { }

    public record LeadTimeBucket(int order, String bucket, long bookings, double sharePct, double avgRevenue,
                                 double cancellationRatePct, double noShowRatePct) { }

    // ---------------------------------------------------------------- insights
    public record Insight(String category, String text) { }
}
