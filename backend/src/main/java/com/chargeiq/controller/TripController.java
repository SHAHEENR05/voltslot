package com.chargeiq.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.chargeiq.dto.TripDtos.TripRequest;
import com.chargeiq.dto.TripDtos.TripResponse;
import com.chargeiq.security.AuthUser;
import com.chargeiq.service.TripPlannerService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

/** Public trip planner. The caller may be anonymous, so {@code actor} can be null. */
@RestController
@RequestMapping("/api/trips")
@Tag(name = "Trips", description = "Long-trip charging planner")
public class TripController {

    private final TripPlannerService tripPlanner;

    public TripController(TripPlannerService tripPlanner) {
        this.tripPlanner = tripPlanner;
    }

    @PostMapping("/plan")
    @Operation(summary = "Plan charging stops along a straight-line corridor from origin to destination")
    public ResponseEntity<TripResponse> plan(@AuthenticationPrincipal AuthUser actor, @Valid @RequestBody TripRequest request) {
        return ResponseEntity.ok(tripPlanner.plan(request, actor));
    }
}
