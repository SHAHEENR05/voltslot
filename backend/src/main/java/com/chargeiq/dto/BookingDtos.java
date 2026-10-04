package com.chargeiq.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

import com.chargeiq.dto.RecommendationDtos.RecommendedItem;
import com.chargeiq.entity.enums.BookingSource;
import com.chargeiq.entity.enums.BookingStatus;
import com.chargeiq.entity.enums.PaymentMethod;
import com.chargeiq.entity.enums.PaymentStatus;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public final class BookingDtos {
    private BookingDtos() { }

    public record EstimateRequest(
            @NotNull Long vehicleId,
            @NotNull Long chargingPointId,
            LocalDateTime startTime,
            @NotNull @Min(0) @Max(99) Integer socStart,
            @NotNull @Min(1) @Max(100) Integer socTarget) { }

    public record EstimateResponse(double energyKwh, double acceptedKw, int durationMinutes, int slots,
                                   BigDecimal effectiveTariff, BigDecimal estimatedCost, double co2AvoidedKg, double kmAdded,
                                   String bandName, BigDecimal multiplier) { }

    public record CreateBookingRequest(
            @NotNull(message = "vehicleId is required") Long vehicleId,
            Long chargingPointId,
            Long stationId,
            @NotNull(message = "startTime is required") LocalDateTime startTime,
            @NotNull @Min(0) @Max(99) Integer socStart,
            @NotNull @Min(1) @Max(100) Integer socTarget,
            BookingSource source) { }

    public record ConfirmRequest(@NotNull(message = "paymentMethod is required") PaymentMethod paymentMethod) { }

    public record CancelRequest(@Size(max = 100) String reason) { }

    public record CompleteRequest(@Min(1) @Max(100) Integer socEnd) { }

    public record StationRef(Long id, String name, String zone, String address, double latitude, double longitude) { }

    public record BookingPointRef(Long id, String label, String connectorCode, double powerKw, BigDecimal tariffPerKwh) { }

    public record VehicleRef(Long id, String nickname, String regNumber, String make, String model) { }

    public record PaymentDto(BigDecimal amount, PaymentMethod method, PaymentStatus status, String invoiceNo,
                             BigDecimal refundedAmount) { }

    public record SessionDto(LocalDateTime startedAt, LocalDateTime endedAt, double energyKwh, int socEnd,
                             BigDecimal amount, double co2AvoidedKg) { }

    public record BookingDto(Long id, String bookingCode, BookingStatus status, BookingSource source,
                             LocalDateTime startTime, LocalDateTime endTime, int slots, StationRef station,
                             BookingPointRef point, VehicleRef vehicle, int socStart, int socTarget, double estEnergyKwh,
                             BigDecimal estCost, LocalDateTime holdExpiresAt, LocalDateTime checkedInAt,
                             LocalDateTime cancelledAt, String cancelReason, LocalDateTime createdAt, PaymentDto payment,
                             SessionDto session, boolean canCancel, boolean canCheckIn, BigDecimal refundIfCancelled,
                             String qrPayload) { }

    public record SlotOption(Long pointId, String label, LocalDateTime start) { }

    /** Returned inside the 409 body when a slot is taken: how to recover. */
    public record Alternatives(List<SlotOption> sameStation, List<RecommendedItem> otherStations) { }

    public record InvoiceDto(String invoiceNo, String bookingCode, LocalDateTime issuedAt, String customerName,
                             String stationName, String stationAddress, String vehicle, String connector,
                             double energyKwh, BigDecimal effectiveTariff, BigDecimal amount, BigDecimal refundedAmount,
                             PaymentMethod method, PaymentStatus status) { }
}
