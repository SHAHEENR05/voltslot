package com.chargeiq.controller;

import java.net.URI;
import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.chargeiq.dto.BookingDtos.BookingDto;
import com.chargeiq.dto.CommonDtos.MessageResponse;
import com.chargeiq.dto.ReminderDtos.DemoTriggerRequest;
import com.chargeiq.dto.ReminderDtos.PredictionDto;
import com.chargeiq.dto.ReminderDtos.ReminderDto;
import com.chargeiq.dto.ReminderDtos.SnoozeRequest;
import com.chargeiq.security.AuthUser;
import com.chargeiq.service.RechargePredictionService;
import com.chargeiq.service.ReminderService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

/** Smart "time to recharge" reminders: predictions, active pop-ups and the snooze / dismiss / book actions. */
@RestController
@RequestMapping("/api/reminders")
@Tag(name = "Reminders", description = "Predicted recharge time and reminder actions")
public class ReminderController {
    private final ReminderService reminderService;
    private final RechargePredictionService predictionService;

    public ReminderController(ReminderService reminderService, RechargePredictionService predictionService) {
        this.reminderService = reminderService;
        this.predictionService = predictionService;
    }

    @GetMapping("/predictions")
    @Operation(summary = "Predicted next charging time of each vehicle (UPCOMING | DUE_SOON | OVERDUE | NO_DATA)")
    public ResponseEntity<List<PredictionDto>> predictions(@AuthenticationPrincipal AuthUser actor) {
        return ResponseEntity.ok(predictionService.predictionsFor(actor));
    }

    @GetMapping("/active")
    @Operation(summary = "Active recharge reminders with a fresh slot suggestion")
    public ResponseEntity<List<ReminderDto>> active(@AuthenticationPrincipal AuthUser actor) {
        return ResponseEntity.ok(reminderService.active(actor));
    }

    @PostMapping("/{notificationId}/snooze")
    @Operation(summary = "Snooze a reminder for N hours")
    public ResponseEntity<MessageResponse> snooze(@AuthenticationPrincipal AuthUser actor,
                                                  @PathVariable("notificationId") Long notificationId,
                                                  @Valid @RequestBody SnoozeRequest request) {
        reminderService.snooze(actor, notificationId, request.hours());
        return ResponseEntity.ok(new MessageResponse("Reminder snoozed for " + request.hours() + " hours"));
    }

    @PostMapping("/{notificationId}/dismiss")
    @Operation(summary = "Dismiss a reminder (no new one until the next completed charge)")
    public ResponseEntity<MessageResponse> dismiss(@AuthenticationPrincipal AuthUser actor,
                                                   @PathVariable("notificationId") Long notificationId) {
        reminderService.dismiss(actor, notificationId);
        return ResponseEntity.ok(new MessageResponse("Reminder dismissed"));
    }

    @PostMapping("/{notificationId}/book")
    @Operation(summary = "Book the suggested slot (creates a HOLD with source REMINDER)")
    public ResponseEntity<BookingDto> book(@AuthenticationPrincipal AuthUser actor,
                                           @PathVariable("notificationId") Long notificationId) {
        BookingDto booking = reminderService.book(actor, notificationId);
        return ResponseEntity.created(URI.create("/api/bookings/" + booking.id())).body(booking);
    }

    @PostMapping("/refresh")
    @Operation(summary = "Re-check my vehicles now and return the number of active reminders")
    public ResponseEntity<Map<String, Integer>> refresh(@AuthenticationPrincipal AuthUser actor) {
        return ResponseEntity.ok(Map.of("active", reminderService.refresh(actor)));
    }

    @PostMapping("/demo-trigger")
    @Operation(summary = "DEMO ONLY: make a vehicle due right now (404 unless app.demo-mode=true)")
    public ResponseEntity<MessageResponse> demoTrigger(@AuthenticationPrincipal AuthUser actor,
                                                       @Valid @RequestBody DemoTriggerRequest request) {
        reminderService.demoTrigger(actor, request.vehicleId());
        return ResponseEntity.ok(new MessageResponse("Reminder triggered"));
    }
}
