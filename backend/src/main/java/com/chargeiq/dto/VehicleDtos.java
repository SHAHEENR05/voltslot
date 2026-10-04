package com.chargeiq.dto;

import java.util.List;

import com.chargeiq.entity.enums.VehicleCategory;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public final class VehicleDtos {
    private VehicleDtos() { }

    public record VehicleRequest(
            @NotNull(message = "Vehicle model is required") Long modelId,
            @NotBlank(message = "Registration number is required") @Size(max = 20) String regNumber,
            @Size(max = 40) String nickname,
            @Min(1) @Max(500) Integer avgDailyKm) { }

    public record VehicleDto(Long id, Long modelId, String make, String model, String variant, VehicleCategory category,
                             double batteryKwh, double acMaxKw, double dcMaxKw, int rangeKm, double kmPerKwh,
                             List<String> connectorCodes, String regNumber, String nickname, int avgDailyKm, Long fleetId) { }
}
