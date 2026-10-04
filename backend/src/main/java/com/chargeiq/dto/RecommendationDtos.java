package com.chargeiq.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonProperty;

import com.chargeiq.dto.StationDtos.StationSummaryDto;
import com.chargeiq.entity.enums.Preset;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

/** The demand-aware recommendation engine (core USP of the PBL). */
public final class RecommendationDtos {
    private RecommendationDtos() { }

    /** Importance of each factor. All optional in a request - missing values fall back to the preset. */
    public record WeightsDto(Double distance, @JsonProperty("wait") Double waiting, Double crowding, Double price, Double reliability, Double speed) { }

    public record RecommendationRequest(
            @NotNull(message = "latitude is required") Double latitude,
            @NotNull(message = "longitude is required") Double longitude,
            Long vehicleId,
            List<String> connectorCodes,
            LocalDateTime arrivalTime,
            @Min(0) @Max(99) Integer socStart,
            @Min(1) @Max(100) Integer socTarget,
            Preset preset,
            WeightsDto weights,
            @Positive Double radiusKm,
            @Min(1) @Max(30) Integer limit) { }

    public record ComponentScore(double score, double weight, double contribution) { }

    public record PointRef(Long pointId, String label, String connectorCode, double powerKw, BigDecimal tariffPerKwh) { }

    public record RecommendedItem(int rank, double score, StationSummaryDto station, PointRef point, int etaMinutes,
                                  LocalDateTime arrivalTime, LocalDateTime slotStart, LocalDateTime slotEnd, int slots,
                                  int waitMinutes, int chargeMinutes, BigDecimal estimatedCost, BigDecimal effectiveTariff,
                                  double crowdingIndex, String crowdingLevel, Map<String, ComponentScore> breakdown,
                                  List<String> reasons, List<String> tags) { }

    public record Baseline(Long stationId, String stationName, double distanceKm, int etaMinutes, int waitMinutes,
                           double crowdingIndex, BigDecimal estimatedCost) { }

    public record Savings(int minutesSaved, BigDecimal rupeesSaved, String summary) { }

    public record RecommendationResponse(LocalDateTime generatedAt, Preset preset, WeightsDto weights, double energyKwhNeeded,
                                         List<RecommendedItem> items, Baseline nearestBaseline, Savings savings) { }
}
