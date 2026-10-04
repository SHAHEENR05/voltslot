package com.chargeiq.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import com.chargeiq.entity.enums.BookingSource;
import com.chargeiq.entity.enums.BookingStatus;
import com.chargeiq.entity.enums.PointStatus;
import com.chargeiq.entity.enums.StationStatus;
import com.chargeiq.entity.enums.StationTier;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/** Station-operator console. */
public final class OperatorDtos {
    private OperatorDtos() { }

    public record StationRequest(
            @NotBlank(message = "Name is required") @Size(max = 100) String name,
            @NotBlank(message = "Address is required") @Size(max = 200) String address,
            @NotBlank @Size(max = 40) String zone,
            @NotBlank @Size(max = 40) String city,
            @NotNull @DecimalMin("-90") @DecimalMax("90") Double latitude,
            @NotNull @DecimalMin("-180") @DecimalMax("180") Double longitude,
            StationTier tier,
            @Min(0) @Max(24) Integer openHour,
            @Min(0) @Max(24) Integer closeHour,
            StationStatus status,
            List<Long> amenityIds,
            Long operatorId) { }

    public record PointRequest(
            @NotBlank @Size(max = 20) String label,
            @NotNull Long connectorTypeId,
            @NotNull @Positive Double powerKw,
            @NotNull @DecimalMin(value = "1.00", message = "Tariff must be at least 1.00")
            @DecimalMax(value = "2000.00", message = "Tariff must be at most 2000.00") BigDecimal tariffPerKwh,
            PointStatus status) { }

    public record PointStatusRequest(@NotNull PointStatus status) { }

    public record WalkInRequest(
            @NotNull Long chargingPointId,
            @NotBlank String vehicleRegNumber,
            @NotNull LocalDateTime startTime,
            @NotNull @Min(30) @Max(720) Integer durationMinutes,
            @Positive Double energyKwh) { }

    public record ScheduleBookingRow(Long bookingId, String bookingCode, BookingStatus status, LocalDateTime start,
                                     LocalDateTime end, String vehicle, String userName, BookingSource source) { }

    public record PointSchedule(Long pointId, String label, String connectorCode, double powerKw, PointStatus status,
                                List<ScheduleBookingRow> bookings) { }

    public record StationScheduleDto(Long stationId, String stationName, LocalDate date, List<PointSchedule> points) { }

    public record StationLive(Long stationId, String name, int totalPoints, int activePoints, int busyNow,
                              double crowdingIndexNow, String crowdingLevelNow) { }

    public record OperatorDashboardDto(String operatorName, int stations, int points, int activePoints, int bookingsToday,
                                       int inProgress, int upcomingToday, BigDecimal revenueToday, double energyTodayKwh,
                                       List<StationLive> stationsLive) { }
}
