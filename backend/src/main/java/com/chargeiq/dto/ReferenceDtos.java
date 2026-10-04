package com.chargeiq.dto;

import java.math.BigDecimal;
import java.util.List;

import com.chargeiq.entity.enums.CurrentType;
import com.chargeiq.entity.enums.VehicleCategory;

/** Lookup data used by drop-downs in the UI. */
public final class ReferenceDtos {
    private ReferenceDtos() { }

    public record ConnectorDto(Long id, String code, String displayName, CurrentType currentType, double typicalKw) { }

    public record VehicleModelDto(Long id, String make, String model, String variant, VehicleCategory category,
                                  double batteryKwh, double acMaxKw, double dcMaxKw, int rangeKm, double kmPerKwh,
                                  List<String> connectorCodes) { }

    public record AmenityDto(Long id, String name, String icon) { }

    public record ZoneDto(String zone, long stations, double latitude, double longitude) { }

    public record PricingBandDto(int hourOfDay, String bandName, BigDecimal multiplier) { }
}
