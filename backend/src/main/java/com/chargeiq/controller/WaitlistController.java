package com.chargeiq.controller;

import java.net.URI;
import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.chargeiq.dto.WaitlistDtos.WaitlistDto;
import com.chargeiq.dto.WaitlistDtos.WaitlistRequest;
import com.chargeiq.security.AuthUser;
import com.chargeiq.service.WaitlistService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

/** REST layer of the waiting list. */
@RestController
@RequestMapping("/api/waitlist")
@Tag(name = "Waitlist", description = "Get a slot automatically when someone cancels")
public class WaitlistController {

    private final WaitlistService waitlistService;

    public WaitlistController(WaitlistService waitlistService) {
        this.waitlistService = waitlistService;
    }

    @PostMapping
    @Operation(summary = "Join the waiting list for a station and time window")
    public ResponseEntity<WaitlistDto> join(@AuthenticationPrincipal AuthUser actor, @Valid @RequestBody WaitlistRequest req) {
        WaitlistDto dto = waitlistService.join(actor, req);
        return ResponseEntity.created(URI.create("/api/waitlist/" + dto.id())).body(dto);
    }

    @GetMapping
    @Operation(summary = "My waiting-list entries")
    public List<WaitlistDto> mine(@AuthenticationPrincipal AuthUser actor) {
        return waitlistService.mine(actor);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Leave the waiting list")
    public ResponseEntity<Void> cancel(@AuthenticationPrincipal AuthUser actor, @PathVariable("id") Long id) {
        waitlistService.cancel(actor, id);
        return ResponseEntity.noContent().build();
    }
}
