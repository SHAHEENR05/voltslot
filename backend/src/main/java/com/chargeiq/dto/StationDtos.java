package com.chargeiq.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import com.chargeiq.dto.ReferenceDtos.AmenityDto;
import com.chargeiq.entity.enums.CurrentType;
import com.chargeiq.entity.enums.PointStatus;
import com.chargeiq.entity.enums.SentimentLabel;
import com.chargeiq.entity.enums.StationTier;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Station locator, availability, forecast and review payloads. */
public final class StationDtos {
    private StationDtos() { }

    public record ConnectorSummary(String code, int count, double maxKw) { }

    public record StationSummaryDto(Long id, String name, String address, String zone, String city,
                                    double latitude, double longitude, StationTier tier, Long operatorId, String operatorName,
                                    Double distanceKm, List<ConnectorSummary> connectors, int totalPoints, int activePoints,
                                    BigDecimal minTariff, double avgRating, int reviewCount, double reliabilityScore,
                                    String sentimentLabel, boolean openNow, int openHour, int closeHour, int freeNowPoints,
                                    double crowdingIndexNow, String crowdingLevelNow) { }

    public record PointDto(Long id, String label, String connectorCode, String connectorName, CurrentType currentType,
                           double powerKw, BigDecimal tariffPerKwh, PointStatus status) { }

    public record SentimentSplit(int positivePct, int neutralPct, int negativePct) { }

    public record StationDetailDto(StationSummaryDto summary, List<AmenityDto> amenities, List<PointDto> points,
                                   Map<Integer, Long> ratingBreakdown, SentimentSplit sentiment, double uptimePct) { }

    public record SlotDto(LocalDateTime start, String state) { }

    public record PointAvailabilityDto(Long pointId, String label, String connectorCode, double powerKw,
                                       BigDecimal tariffPerKwh, boolean compatible, List<SlotDto> slots) { }

    public record AvailabilityDto(Long stationId, LocalDate date, int slotMinutes, int openHour, int closeHour,
                                  LocalDateTime now, List<PointAvailabilityDto> points, List<Integer> crowdingByHour) { }

    public record ForecastCell(int dayOfWeek, int hour, double expectedSessions, double crowdingIndex, String level) { }

    public record QuietWindow(LocalDateTime start, double crowdingIndex) { }

    public record ForecastDto(Long stationId, List<ForecastCell> grid, List<QuietWindow> quietestNext24h) { }

    public record ReviewDto(Long id, String userName, int rating, String comment, SentimentLabel sentimentLabel,
                            double sentimentScore, LocalDateTime createdAt) { }

    public record ReviewRequest(
            @NotNull(message = "Rating is required") @Min(1) @Max(5) Integer rating,
            @Size(max = 500) String comment,
            Long bookingId) { }
}
