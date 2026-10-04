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

import com.chargeiq.dto.CommonDtos.PageResponse;
import com.chargeiq.dto.StationDtos.ReviewDto;
import com.chargeiq.dto.StationDtos.ReviewRequest;
import com.chargeiq.security.AuthUser;
import com.chargeiq.service.ReviewService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

/** Station reviews: reading is public, writing needs a login and a completed session at that station. */
@RestController
@RequestMapping("/api/stations/{stationId}/reviews")
@Tag(name = "Reviews", description = "Station reviews with automatic sentiment")
public class ReviewController {
    private final ReviewService reviewService;

    public ReviewController(ReviewService reviewService) {
        this.reviewService = reviewService;
    }

    @GetMapping
    @Operation(summary = "Paged reviews of a station, newest first")
    public ResponseEntity<PageResponse<ReviewDto>> list(@PathVariable("stationId") Long stationId,
                                                        @RequestParam(name = "page", defaultValue = "0") int page,
                                                        @RequestParam(name = "size", defaultValue = "10") int size) {
        return ResponseEntity.ok(reviewService.list(stationId, page, size));
    }

    @PostMapping
    @Operation(summary = "Add a review (403 unless the caller has charged at this station)")
    public ResponseEntity<ReviewDto> create(@AuthenticationPrincipal AuthUser actor,
                                            @PathVariable("stationId") Long stationId,
                                            @Valid @RequestBody ReviewRequest request) {
        ReviewDto created = reviewService.create(actor, stationId, request);
        return ResponseEntity.created(URI.create("/api/stations/" + stationId + "/reviews")).body(created);
    }
}
