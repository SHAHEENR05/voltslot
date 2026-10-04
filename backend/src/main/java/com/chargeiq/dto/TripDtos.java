package com.chargeiq.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

import com.chargeiq.dto.StationDtos.StationSummaryDto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public final class TripDtos {
    private TripDtos() { }

    public record TripRequest(
            @NotNull Double originLat, @NotNull Double originLon,
            @NotNull Double destLat, @NotNull Double destLon,
            Long vehicleId,
            @NotNull @Min(5) @Max(100) Integer startSocPercent,
            LocalDateTime departAt,
            @Min(0) @Max(40) Integer reserveSocPercent) { }

    /** type is DRIVE or CHARGE. Station/point fields are only filled for CHARGE legs. */
    public record TripLeg(String type, double fromLat, double fromLon, double toLat, double toLon, double distanceKm,
                          int durationMin, int socStart, int socEnd, LocalDateTime startTime, LocalDateTime endTime,
                          StationSummaryDto station, Long pointId, String pointLabel, String connectorCode,
                          LocalDateTime slotStart, LocalDateTime slotEnd, String crowdingLevel, BigDecimal estimatedCost) { }

    public record TripResponse(double distanceKm, int drivingMinutes, boolean needsCharging, boolean feasible,
                               int arrivalSocPercent, LocalDateTime departAt, LocalDateTime arriveAt, List<TripLeg> legs,
                               List<double[]> polyline, List<String> notes) { }
}
