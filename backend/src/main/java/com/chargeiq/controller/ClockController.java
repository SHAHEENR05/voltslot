package com.chargeiq.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.chargeiq.clock.AppClock;
import com.chargeiq.dto.AdminDtos.ClockDto;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

/** Public read-only view of the application clock (the demo "time machine"); advancing it is an admin endpoint. */
@RestController
@RequestMapping("/api/clock")
@Tag(name = "Clock", description = "Application clock used by every time-dependent rule")
public class ClockController {

    private final AppClock clock;

    public ClockController(AppClock clock) {
        this.clock = clock;
    }

    @GetMapping
    @Operation(summary = "Current application time, mode, anchor and manual offset")
    public ResponseEntity<ClockDto> now() {
        return ResponseEntity.ok(new ClockDto(clock.now(), clock.getMode(), clock.getAnchor(), clock.getOffsetSeconds()));
    }
}
