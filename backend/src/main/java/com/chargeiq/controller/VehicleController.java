package com.chargeiq.controller;

import java.net.URI;
import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.chargeiq.dto.VehicleDtos.VehicleDto;
import com.chargeiq.dto.VehicleDtos.VehicleRequest;
import com.chargeiq.security.AuthUser;
import com.chargeiq.service.VehicleService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

/** CRUD for the caller's vehicles (a fleet manager manages the whole fleet). */
@RestController
@RequestMapping("/api/vehicles")
@Tag(name = "Vehicles", description = "Manage registered electric vehicles")
public class VehicleController {
    private final VehicleService vehicleService;

    public VehicleController(VehicleService vehicleService) {
        this.vehicleService = vehicleService;
    }

    @GetMapping
    @Operation(summary = "List my vehicles (fleet manager: all vehicles of the fleet)")
    public ResponseEntity<List<VehicleDto>> list(@AuthenticationPrincipal AuthUser actor) {
        return ResponseEntity.ok(vehicleService.list(actor));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get one vehicle")
    public ResponseEntity<VehicleDto> get(@AuthenticationPrincipal AuthUser actor, @PathVariable("id") Long id) {
        return ResponseEntity.ok(vehicleService.get(actor, id));
    }

    @PostMapping
    @Operation(summary = "Register a vehicle (409 when the registration number already exists)")
    public ResponseEntity<VehicleDto> create(@AuthenticationPrincipal AuthUser actor,
                                             @Valid @RequestBody VehicleRequest request) {
        VehicleDto created = vehicleService.create(actor, request);
        return ResponseEntity.created(URI.create("/api/vehicles/" + created.id())).body(created);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update a vehicle")
    public ResponseEntity<VehicleDto> update(@AuthenticationPrincipal AuthUser actor, @PathVariable("id") Long id,
                                             @Valid @RequestBody VehicleRequest request) {
        return ResponseEntity.ok(vehicleService.update(actor, id, request));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete a vehicle (409 when it has upcoming bookings)")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal AuthUser actor, @PathVariable("id") Long id) {
        vehicleService.delete(actor, id);
        return ResponseEntity.noContent().build();
    }
}
