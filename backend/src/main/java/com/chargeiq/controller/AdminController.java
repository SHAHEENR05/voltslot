package com.chargeiq.controller;

import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.chargeiq.dto.AdminDtos.AdminStatsDto;
import com.chargeiq.dto.AdminDtos.AdminUserDto;
import com.chargeiq.dto.AdminDtos.AdvanceClockRequest;
import com.chargeiq.dto.AdminDtos.ClockDto;
import com.chargeiq.dto.AdminDtos.RoleRequest;
import com.chargeiq.dto.AdminDtos.StatusRequest;
import com.chargeiq.dto.AdminDtos.WarehouseRefreshDto;
import com.chargeiq.dto.CommonDtos.PageResponse;
import com.chargeiq.security.AuthUser;
import com.chargeiq.service.AdminService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

/** Admin-only endpoints (the URL prefix /api/admin/** is protected in SecurityConfig). Thin: delegates to AdminService. */
@RestController
@RequestMapping("/api/admin")
@Tag(name = "Admin", description = "User management, platform statistics, warehouse refresh and the demo clock (ADMIN only)")
public class AdminController {

    private final AdminService service;

    public AdminController(AdminService service) {
        this.service = service;
    }

    @GetMapping("/users")
    @Operation(summary = "List / search users (page)")
    public ResponseEntity<PageResponse<AdminUserDto>> users(
            @RequestParam(name = "q", required = false) String q,
            @RequestParam(name = "role", required = false) String role,
            @RequestParam(name = "status", required = false) String status,
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "20") int size) {
        return ResponseEntity.ok(service.users(q, role, status, page, size));
    }

    @PutMapping("/users/{id}/role")
    @Operation(summary = "Change a user's role (OPERATOR needs operatorId, FLEET_MANAGER needs fleetId)")
    public ResponseEntity<AdminUserDto> changeRole(@AuthenticationPrincipal AuthUser actor,
                                                   @PathVariable("id") Long id, @Valid @RequestBody RoleRequest body) {
        return ResponseEntity.ok(service.changeRole(actor, id, body));
    }

    @PutMapping("/users/{id}/status")
    @Operation(summary = "Block or unblock a user")
    public ResponseEntity<AdminUserDto> changeStatus(@AuthenticationPrincipal AuthUser actor,
                                                     @PathVariable("id") Long id, @Valid @RequestBody StatusRequest body) {
        return ResponseEntity.ok(service.changeStatus(actor, id, body));
    }

    @GetMapping("/stats")
    @Operation(summary = "Platform statistics (row counts, live bookings, clock)")
    public ResponseEntity<AdminStatsDto> stats() {
        return ResponseEntity.ok(service.stats());
    }

    @PostMapping("/warehouse/refresh")
    @Operation(summary = "Rebuild the data warehouse (CALL sp_refresh_warehouse())")
    public ResponseEntity<WarehouseRefreshDto> refreshWarehouse() {
        return ResponseEntity.ok(service.refreshWarehouse());
    }

    @GetMapping("/clock")
    @Operation(summary = "Current demo clock state")
    public ResponseEntity<ClockDto> clock() {
        return ResponseEntity.ok(service.clock());
    }

    @PostMapping("/clock/advance")
    @Operation(summary = "Advance the demo clock and run the background jobs once")
    public ResponseEntity<ClockDto> advance(@RequestBody(required = false) AdvanceClockRequest body) {
        return ResponseEntity.ok(service.advanceClock(body));
    }

    @PostMapping("/clock/reset")
    @Operation(summary = "Reset the demo clock to its anchor")
    public ResponseEntity<ClockDto> reset() {
        return ResponseEntity.ok(service.resetClock());
    }

    @PostMapping("/reminders/run-now")
    @Operation(summary = "Evaluate recharge reminders immediately")
    public ResponseEntity<Map<String, Integer>> runRemindersNow() {
        return ResponseEntity.ok(Map.of("created", service.runRemindersNow()));
    }
}
