package com.chargeiq.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.chargeiq.dto.ReferenceDtos.AmenityDto;
import com.chargeiq.dto.ReferenceDtos.ConnectorDto;
import com.chargeiq.dto.ReferenceDtos.PricingBandDto;
import com.chargeiq.dto.ReferenceDtos.VehicleModelDto;
import com.chargeiq.dto.ReferenceDtos.ZoneDto;
import com.chargeiq.service.ReferenceService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

/** Public lookup data for UI drop-downs. */
@RestController
@RequestMapping("/api/reference")
@Tag(name = "Reference", description = "Lookup data: connectors, vehicle models, amenities, zones, pricing bands")
public class ReferenceController {

    private final ReferenceService referenceService;

    public ReferenceController(ReferenceService referenceService) {
        this.referenceService = referenceService;
    }

    @GetMapping("/connectors")
    @Operation(summary = "Connector types")
    public ResponseEntity<List<ConnectorDto>> connectors() {
        return ResponseEntity.ok(referenceService.connectors());
    }

    @GetMapping("/vehicle-models")
    @Operation(summary = "Vehicle catalogue with supported connector codes")
    public ResponseEntity<List<VehicleModelDto>> vehicleModels() {
        return ResponseEntity.ok(referenceService.vehicleModels());
    }

    @GetMapping("/amenities")
    @Operation(summary = "Station amenities")
    public ResponseEntity<List<AmenityDto>> amenities() {
        return ResponseEntity.ok(referenceService.amenities());
    }

    @GetMapping("/zones")
    @Operation(summary = "City zones with station counts and centre coordinates")
    public ResponseEntity<List<ZoneDto>> zones() {
        return ResponseEntity.ok(referenceService.zones());
    }

    @GetMapping("/pricing-bands")
    @Operation(summary = "Time-of-day tariff multipliers (24 hours)")
    public ResponseEntity<List<PricingBandDto>> pricingBands() {
        return ResponseEntity.ok(referenceService.pricingBands());
    }
}
