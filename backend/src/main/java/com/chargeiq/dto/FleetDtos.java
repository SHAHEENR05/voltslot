package com.chargeiq.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

import com.chargeiq.dto.BookingDtos.BookingDto;
import com.chargeiq.dto.VehicleDtos.VehicleDto;
import com.chargeiq.entity.enums.Preset;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

/** Fleet manager console: overview and the smart charging scheduler. */
public final class FleetDtos {
    private FleetDtos() { }

    public record FleetVehicleRow(VehicleDto vehicle, LocalDateTime lastChargeAt, LocalDateTime nextDueAt,
                                  String predictionState, String upcomingBookingCode, LocalDateTime upcomingStart,
                                  String upcomingStation) { }

    public record FleetOverviewDto(Long fleetId, String fleetName, int vehicleCount, int upcomingBookings, int sessions30d,
                                   double energy30dKwh, BigDecimal spend30d, List<FleetVehicleRow> vehicles) { }

    public record ScheduleRequest(
            @NotEmpty(message = "Select at least one vehicle") List<Long> vehicleIds,
            @NotNull LocalDateTime windowStart,
            @NotNull LocalDateTime windowEnd,
            Double startLat,
            Double startLon,
            Integer socStart,
            Integer socTarget,
            Preset preset,
            Integer maxPerStation) { }

    public record ScheduleItem(Long vehicleId, String vehicleLabel, Long stationId, String stationName, Long pointId,
                               String pointLabel, String connectorCode, LocalDateTime slotStart, LocalDateTime slotEnd,
                               int socStart, int socTarget, BigDecimal estimatedCost, int waitMinutes, String reason) { }

    public record Unassigned(Long vehicleId, String vehicleLabel, String reason) { }

    public record ScheduleResponse(List<ScheduleItem> plan, List<Unassigned> unassigned, BigDecimal totalCost,
                                   double avgWaitMinutes, int stationsUsed) { }

    public record ApplyItem(@NotNull Long vehicleId, @NotNull Long pointId, @NotNull LocalDateTime slotStart,
                            @NotNull Integer socStart, @NotNull Integer socTarget) { }

    public record ApplyRequest(@NotEmpty List<@Valid ApplyItem> items) { }

    public record ApplyFailure(Long vehicleId, String reason) { }

    public record ApplyResponse(List<BookingDto> created, List<ApplyFailure> failures) { }
}
