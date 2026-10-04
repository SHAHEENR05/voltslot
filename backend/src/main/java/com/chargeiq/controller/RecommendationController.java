package com.chargeiq.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.chargeiq.dto.RecommendationDtos.RecommendationRequest;
import com.chargeiq.dto.RecommendationDtos.RecommendationResponse;
import com.chargeiq.security.AuthUser;
import com.chargeiq.service.RecommendationService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

/** The smart recommendation endpoint. Public: anonymous callers pass connectors, logged-in users may pass a vehicleId. */
@RestController
@RequestMapping("/api/recommendations")
@Tag(name = "Recommendations", description = "Demand-aware, explainable charging station ranking")
public class RecommendationController {

    private final RecommendationService recommendationService;

    public RecommendationController(RecommendationService recommendationService) {
        this.recommendationService = recommendationService;
    }

    @PostMapping
    @Operation(summary = "Rank stations by distance, wait, crowding, price, reliability and speed (with reasons and savings)")
    public ResponseEntity<RecommendationResponse> recommend(@Valid @RequestBody RecommendationRequest request,
                                                            @AuthenticationPrincipal AuthUser actor) {
        return ResponseEntity.ok(recommendationService.recommend(request, actor));
    }
}
