package com.chargeiq.controller;

import java.net.URI;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.chargeiq.dto.BookingDtos.BookingDto;
import com.chargeiq.dto.BookingDtos.CancelRequest;
import com.chargeiq.dto.BookingDtos.CompleteRequest;
import com.chargeiq.dto.BookingDtos.ConfirmRequest;
import com.chargeiq.dto.BookingDtos.CreateBookingRequest;
import com.chargeiq.dto.BookingDtos.EstimateRequest;
import com.chargeiq.dto.BookingDtos.EstimateResponse;
import com.chargeiq.dto.BookingDtos.InvoiceDto;
import com.chargeiq.dto.CommonDtos.PageResponse;
import com.chargeiq.security.AuthUser;
import com.chargeiq.service.BookingService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

/** Thin REST layer for bookings: validates the request body, delegates to {@link BookingService}. */
@RestController
@RequestMapping("/api/bookings")
@Tag(name = "Bookings", description = "Estimate, hold, pay, cancel, check-in and complete charging bookings")
public class BookingController {

    private final BookingService bookingService;

    public BookingController(BookingService bookingService) {
        this.bookingService = bookingService;
    }

    @PostMapping("/estimate")
    @Operation(summary = "Estimate energy, duration, slots and cost of a charging session")
    public EstimateResponse estimate(@AuthenticationPrincipal AuthUser actor, @Valid @RequestBody EstimateRequest req) {
        return bookingService.estimate(actor, req);
    }

    @PostMapping
    @Operation(summary = "Create a 5-minute HOLD on a slot (409 with alternatives when the slot is taken)")
    public ResponseEntity<BookingDto> create(@AuthenticationPrincipal AuthUser actor,
                                             @Valid @RequestBody CreateBookingRequest req) {
        BookingDto created = bookingService.createHold(actor, req);
        return ResponseEntity.created(URI.create("/api/bookings/" + created.id())).body(created);
    }

    @PostMapping("/{id}/confirm")
    @Operation(summary = "Pay for a HOLD (WALLET, UPI or CARD) and confirm the booking")
    public BookingDto confirm(@AuthenticationPrincipal AuthUser actor, @PathVariable("id") Long id,
                              @Valid @RequestBody ConfirmRequest req) {
        return bookingService.confirm(actor, id, req.paymentMethod());
    }

    @PostMapping("/{id}/cancel")
    @Operation(summary = "Cancel a HOLD or CONFIRMED booking (100% refund if >= 60 min before start, else 50%)")
    public BookingDto cancel(@AuthenticationPrincipal AuthUser actor, @PathVariable("id") Long id,
                             @Valid @RequestBody(required = false) CancelRequest req) {
        return bookingService.cancel(actor, id, req == null ? null : req.reason());
    }

    @PostMapping("/{id}/check-in")
    @Operation(summary = "Check in at the station (15 min before to 15 min after the start time)")
    public BookingDto checkIn(@AuthenticationPrincipal AuthUser actor, @PathVariable("id") Long id) {
        return bookingService.checkIn(actor, id);
    }

    @PostMapping("/{id}/complete")
    @Operation(summary = "Finish the charging session (optional final state of charge)")
    public BookingDto complete(@AuthenticationPrincipal AuthUser actor, @PathVariable("id") Long id,
                               @Valid @RequestBody(required = false) CompleteRequest req) {
        return bookingService.complete(actor, id, req == null ? null : req.socEnd());
    }

    @GetMapping
    @Operation(summary = "List my bookings (filter by status, upcoming=true/false; paged)")
    public PageResponse<BookingDto> list(@AuthenticationPrincipal AuthUser actor,
                                         @RequestParam(name = "status", required = false) String status,
                                         @RequestParam(name = "upcoming", required = false) Boolean upcoming,
                                         @RequestParam(name = "page", defaultValue = "0") int page,
                                         @RequestParam(name = "size", defaultValue = "10") int size) {
        return bookingService.list(actor, status, upcoming, page, size);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get one booking")
    public BookingDto get(@AuthenticationPrincipal AuthUser actor, @PathVariable("id") Long id) {
        return bookingService.get(actor, id);
    }

    @GetMapping("/{id}/invoice")
    @Operation(summary = "Invoice of a paid booking")
    public InvoiceDto invoice(@AuthenticationPrincipal AuthUser actor, @PathVariable("id") Long id) {
        return bookingService.invoice(actor, id);
    }
}
