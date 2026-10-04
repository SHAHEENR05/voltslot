package com.chargeiq.controller;

import java.net.URI;
import java.time.LocalDate;
import java.util.List;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.chargeiq.dto.BookingDtos.BookingDto;
import com.chargeiq.dto.OperatorDtos.OperatorDashboardDto;
import com.chargeiq.dto.OperatorDtos.PointRequest;
import com.chargeiq.dto.OperatorDtos.PointStatusRequest;
import com.chargeiq.dto.OperatorDtos.StationRequest;
import com.chargeiq.dto.OperatorDtos.StationScheduleDto;
import com.chargeiq.dto.OperatorDtos.WalkInRequest;
import com.chargeiq.dto.StationDtos.PointDto;
import com.chargeiq.dto.StationDtos.StationDetailDto;
import com.chargeiq.dto.StationDtos.StationSummaryDto;
import com.chargeiq.security.AuthUser;
import com.chargeiq.service.OperatorService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

/** Station-operator console (role OPERATOR or ADMIN). Ownership checks live in OperatorService. */
@RestController
@RequestMapping("/api/operator")
@Tag(name = "Operator", description = "Stations, charging points, schedule and walk-ins of an operator")
public class OperatorController {

    private final OperatorService operatorService;

    public OperatorController(OperatorService operatorService) {
        this.operatorService = operatorService;
    }

    @GetMapping("/dashboard")
    @Operation(summary = "Today's KPIs and live status of the operator's stations")
    public ResponseEntity<OperatorDashboardDto> dashboard(@AuthenticationPrincipal AuthUser actor) {
        return ResponseEntity.ok(operatorService.dashboard(actor));
    }

    @GetMapping("/stations")
    @Operation(summary = "List the operator's stations (ADMIN: all stations)")
    public ResponseEntity<List<StationSummaryDto>> stations(@AuthenticationPrincipal AuthUser actor) {
        return ResponseEntity.ok(operatorService.myStations(actor));
    }

    @PostMapping("/stations")
    @Operation(summary = "Create a station")
    public ResponseEntity<StationDetailDto> createStation(@AuthenticationPrincipal AuthUser actor,
                                                          @Valid @RequestBody StationRequest request) {
        StationDetailDto created = operatorService.createStation(actor, request);
        return ResponseEntity.created(URI.create("/api/stations/" + created.summary().id())).body(created);
    }

    @PutMapping("/stations/{id}")
    @Operation(summary = "Update a station (own stations only)")
    public ResponseEntity<StationDetailDto> updateStation(@AuthenticationPrincipal AuthUser actor,
                                                          @PathVariable("id") Long id,
                                                          @Valid @RequestBody StationRequest request) {
        return ResponseEntity.ok(operatorService.updateStation(actor, id, request));
    }

    @DeleteMapping("/stations/{id}")
    @Operation(summary = "Soft-delete a station (INACTIVE); 409 while future bookings exist")
    public ResponseEntity<Void> deleteStation(@AuthenticationPrincipal AuthUser actor, @PathVariable("id") Long id) {
        operatorService.deleteStation(actor, id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/stations/{id}/points")
    @Operation(summary = "Add a charging point to a station")
    public ResponseEntity<PointDto> addPoint(@AuthenticationPrincipal AuthUser actor, @PathVariable("id") Long stationId,
                                             @Valid @RequestBody PointRequest request) {
        PointDto created = operatorService.addPoint(actor, stationId, request);
        return ResponseEntity.created(URI.create("/api/operator/points/" + created.id())).body(created);
    }

    @PutMapping("/points/{id}")
    @Operation(summary = "Update a charging point")
    public ResponseEntity<PointDto> updatePoint(@AuthenticationPrincipal AuthUser actor, @PathVariable("id") Long id,
                                                @Valid @RequestBody PointRequest request) {
        return ResponseEntity.ok(operatorService.updatePoint(actor, id, request));
    }

    @DeleteMapping("/points/{id}")
    @Operation(summary = "Delete a charging point (409 when it has bookings)")
    public ResponseEntity<Void> deletePoint(@AuthenticationPrincipal AuthUser actor, @PathVariable("id") Long id) {
        operatorService.deletePoint(actor, id);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/points/{id}/status")
    @Operation(summary = "Set a charging point ACTIVE / MAINTENANCE / OFFLINE")
    public ResponseEntity<PointDto> setPointStatus(@AuthenticationPrincipal AuthUser actor, @PathVariable("id") Long id,
                                                   @Valid @RequestBody PointStatusRequest request) {
        return ResponseEntity.ok(operatorService.setPointStatus(actor, id, request));
    }

    @GetMapping("/stations/{id}/schedule")
    @Operation(summary = "Bookings of one day grouped per charging point (default: today)")
    public ResponseEntity<StationScheduleDto> schedule(@AuthenticationPrincipal AuthUser actor, @PathVariable("id") Long id,
                                                       @RequestParam(name = "date", required = false)
                                                       @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return ResponseEntity.ok(operatorService.schedule(actor, id, date));
    }

    @PostMapping("/walk-ins")
    @Operation(summary = "Log a walk-in customer (creates a COMPLETED booking with session and payment)")
    public ResponseEntity<BookingDto> logWalkIn(@AuthenticationPrincipal AuthUser actor, @Valid @RequestBody WalkInRequest request) {
        BookingDto created = operatorService.logWalkIn(actor, request);
        return ResponseEntity.created(URI.create("/api/bookings/" + created.id())).body(created);
    }
}
