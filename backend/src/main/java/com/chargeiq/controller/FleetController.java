package com.chargeiq.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.chargeiq.dto.FleetDtos.ApplyRequest;
import com.chargeiq.dto.FleetDtos.ApplyResponse;
import com.chargeiq.dto.FleetDtos.FleetOverviewDto;
import com.chargeiq.dto.FleetDtos.ScheduleRequest;
import com.chargeiq.dto.FleetDtos.ScheduleResponse;
import com.chargeiq.security.AuthUser;
import com.chargeiq.service.FleetService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

/** Fleet manager endpoints (role FLEET_MANAGER or ADMIN, see SecurityConfig). Thin: all logic is in FleetService. */
@RestController
@RequestMapping("/api/fleet")
@Tag(name = "Fleet", description = "Fleet overview and smart charging scheduler")
public class FleetController {

    private final FleetService fleetService;

    public FleetController(FleetService fleetService) {
        this.fleetService = fleetService;
    }

    @GetMapping("/overview")
    @Operation(summary = "Fleet overview: vehicles, predicted due dates, upcoming bookings and 30-day totals")
    public ResponseEntity<FleetOverviewDto> overview(@AuthenticationPrincipal AuthUser actor) {
        return ResponseEntity.ok(fleetService.overview(actor));
    }

    @PostMapping("/schedule")
    @Operation(summary = "Propose a charging schedule for selected vehicles inside a time window (nothing is booked)")
    public ResponseEntity<ScheduleResponse> schedule(@AuthenticationPrincipal AuthUser actor,
                                                     @Valid @RequestBody ScheduleRequest request) {
        return ResponseEntity.ok(fleetService.schedule(actor, request));
    }

    @PostMapping("/schedule/apply")
    @Operation(summary = "Book the proposed plan (hold + wallet payment per item); failures are reported per item")
    public ResponseEntity<ApplyResponse> apply(@AuthenticationPrincipal AuthUser actor,
                                               @Valid @RequestBody ApplyRequest request) {
        return ResponseEntity.ok(fleetService.apply(actor, request));
    }
}
