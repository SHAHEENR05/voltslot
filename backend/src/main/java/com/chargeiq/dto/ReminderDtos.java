package com.chargeiq.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/** Smart recharge reminders ("time to charge again") and the prediction behind them. */
public final class ReminderDtos {
    private ReminderDtos() { }

    public record ReminderVehicle(Long id, String label, String make, String model) { }

    public record SuggestionDto(Long stationId, String stationName, String zone, Long pointId, String connectorCode,
                                LocalDateTime slotStart, LocalDateTime slotEnd, String crowdingLevel, double crowdingIndex,
                                BigDecimal estimatedCost, int chargeMinutes, double distanceKm, String reason) { }

    public record ReminderDto(Long notificationId, ReminderVehicle vehicle, LocalDateTime dueAt, double hoursUntilDue,
                              boolean overdue, String headline, String message, double confidence,
                              double medianIntervalDays, LocalDateTime lastChargeAt, SuggestionDto suggestion) { }

    public record CadencePoint(LocalDate date, double intervalDays) { }

    public record PredictionDto(Long vehicleId, String vehicleLabel, String state, LocalDateTime lastChargeAt,
                                double medianIntervalDays, double avgEnergyKwh, int preferredHour, Long preferredStationId,
                                String preferredStationName, int sessionsUsed, double confidence, LocalDateTime nextDueAt,
                                double hoursUntilDue, List<CadencePoint> cadenceHistory, SuggestionDto suggestion) { }

    public record SnoozeRequest(@NotNull @Min(1) @Max(168) Integer hours) { }

    public record DemoTriggerRequest(@NotNull Long vehicleId) { }
}
