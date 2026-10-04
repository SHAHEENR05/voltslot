package com.chargeiq.dto;

import java.time.LocalDateTime;

import com.chargeiq.entity.enums.WaitlistStatus;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/** Request / response payloads of the waiting list ("notify me when a slot frees up"). */
public final class WaitlistDtos {
    private WaitlistDtos() { }

    public record WaitlistRequest(
            @NotNull(message = "vehicleId is required") Long vehicleId,
            @NotNull(message = "stationId is required") Long stationId,
            @NotNull(message = "desiredStart is required") LocalDateTime desiredStart,
            @NotNull(message = "slots is required") @Min(value = 1, message = "slots must be at least 1")
            @Max(value = 16, message = "slots must be at most 16") Integer slots) { }

    public record WaitlistStationRef(Long id, String name) { }

    public record WaitlistDto(Long id, WaitlistStationRef station, String vehicleLabel, LocalDateTime desiredStart,
                              int slots, WaitlistStatus status, Long promotedBookingId, LocalDateTime createdAt) { }
}
