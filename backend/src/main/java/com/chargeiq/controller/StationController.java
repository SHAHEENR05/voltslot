package com.chargeiq.controller;

import java.time.LocalDate;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.chargeiq.dto.CommonDtos.PageResponse;
import com.chargeiq.dto.StationDtos.AvailabilityDto;
import com.chargeiq.dto.StationDtos.ForecastDto;
import com.chargeiq.dto.StationDtos.StationDetailDto;
import com.chargeiq.dto.StationDtos.StationSummaryDto;
import com.chargeiq.service.AvailabilityService;
import com.chargeiq.service.ForecastService;
import com.chargeiq.service.StationService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

/** Public station locator endpoints (search, detail, slot availability, demand forecast). Reviews live in ReviewController. */
@RestController
@RequestMapping("/api/stations")
@Tag(name = "Stations", description = "Station locator, availability and demand forecast (public)")
public class StationController {

    private final StationService stationService;
    private final AvailabilityService availabilityService;
    private final ForecastService forecastService;

    public StationController(StationService stationService, AvailabilityService availabilityService,
                             ForecastService forecastService) {
        this.stationService = stationService;
        this.availabilityService = availabilityService;
        this.forecastService = forecastService;
    }

    @GetMapping
    @Operation(summary = "Search stations (filters, sorting, pagination)")
    public ResponseEntity<PageResponse<StationSummaryDto>> search(
            @RequestParam(name = "lat", required = false) Double lat,
            @RequestParam(name = "lon", required = false) Double lon,
            @RequestParam(name = "radiusKm", required = false) Double radiusKm,
            @RequestParam(name = "connector", required = false) String connector,
            @RequestParam(name = "minKw", required = false) Double minKw,
            @RequestParam(name = "amenity", required = false) String amenity,
            @RequestParam(name = "zone", required = false) String zone,
            @RequestParam(name = "q", required = false) String q,
            @RequestParam(name = "openNow", required = false) Boolean openNow,
            @RequestParam(name = "sort", required = false) String sort,
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "12") int size) {
        return ResponseEntity.ok(stationService.search(lat, lon, radiusKm, connector, minKw, amenity, zone, q, openNow,
                sort, page, Math.min(Math.max(size, 1), 100)));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Station detail with points, amenities, rating histogram and sentiment")
    public ResponseEntity<StationDetailDto> detail(@PathVariable("id") Long id) {
        return ResponseEntity.ok(stationService.detail(id));
    }

    @GetMapping("/{id}/availability")
    @Operation(summary = "30-minute slot grid per charging point for a day (default today)")
    public ResponseEntity<AvailabilityDto> availability(
            @PathVariable("id") Long id,
            @RequestParam(name = "date", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(name = "vehicleId", required = false) Long vehicleId) {
        return ResponseEntity.ok(availabilityService.availability(id, date, vehicleId));
    }

    @GetMapping("/{id}/forecast")
    @Operation(summary = "Predicted crowding grid (7x24) and the quietest hours of the next 24 h")
    public ResponseEntity<ForecastDto> forecast(@PathVariable("id") Long id) {
        return ResponseEntity.ok(forecastService.forecast(id));
    }
}
