package com.chargeiq.service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.chargeiq.clock.AppClock;
import com.chargeiq.dto.StationDtos.ForecastCell;
import com.chargeiq.dto.StationDtos.ForecastDto;
import com.chargeiq.dto.StationDtos.QuietWindow;
import com.chargeiq.exception.ResourceNotFoundException;
import com.chargeiq.repository.DemandForecastRepository;
import com.chargeiq.repository.StationRepository;

/**
 * Serves the predicted demand ("how crowded will this station be at that hour?").
 * <p>
 * The table {@code demand_forecast} holds one row per (station, day-of-week, hour) = 7 x 24 cells per station,
 * produced offline by the analytics pipeline. It is small (a few thousand rows) and read very often by the
 * recommendation engine, so it is loaded once into memory and cached until {@link #refresh()} is called.
 * Missing cells read as 0 (quiet).
 */
@Service
@Transactional
public class ForecastService {

    private static final int CELLS = 7 * 24;

    private final DemandForecastRepository repo;
    private final StationRepository stations;
    private final AppClock clock;

    /** stationId -> [0] crowding index per cell, [1] expected sessions per cell; cell = (dayOfWeek-1)*24 + hour. */
    private volatile Map<Long, double[][]> cache;

    public ForecastService(DemandForecastRepository repo, StationRepository stations, AppClock clock) {
        this.repo = repo;
        this.stations = stations;
        this.clock = clock;
    }

    /** Crowding index 0..100 for the station at the day-of-week/hour of {@code t}; 0 when unknown. */
    public double crowdingIndex(Long stationId, LocalDateTime t) {
        double[][] cells = load().get(stationId);
        return cells == null ? 0.0 : cells[0][cell(t)];
    }

    /** Expected number of sessions for the station at the day-of-week/hour of {@code t}; 0 when unknown. */
    public double expectedSessions(Long stationId, LocalDateTime t) {
        double[][] cells = load().get(stationId);
        return cells == null ? 0.0 : cells[1][cell(t)];
    }

    /** LOW (&lt;35), MEDIUM (&lt;65) or HIGH. */
    public static String level(double crowdingIndex) {
        if (crowdingIndex < 35) {
            return "LOW";
        }
        if (crowdingIndex < 65) {
            return "MEDIUM";
        }
        return "HIGH";
    }

    /** The 24 hourly crowding values (rounded to int) of the weekday that {@code date} falls on. */
    public List<Integer> crowdingByHour(Long stationId, LocalDate date) {
        List<Integer> out = new ArrayList<>(24);
        for (int h = 0; h < 24; h++) {
            out.add((int) Math.round(crowdingIndex(stationId, date.atTime(h, 0))));
        }
        return out;
    }

    /** Full 7x24 grid plus the three quietest hour-starts in the next 24 hours. */
    @Transactional(readOnly = true)
    public ForecastDto forecast(Long stationId) {
        if (!stations.existsById(stationId)) {
            throw new ResourceNotFoundException("Station", stationId);
        }
        double[][] cells = load().get(stationId);
        List<ForecastCell> grid = new ArrayList<>(CELLS);
        for (int dow = 1; dow <= 7; dow++) {
            for (int h = 0; h < 24; h++) {
                int idx = (dow - 1) * 24 + h;
                double crowd = cells == null ? 0.0 : cells[0][idx];
                double sessions = cells == null ? 0.0 : cells[1][idx];
                grid.add(new ForecastCell(dow, h, sessions, crowd, level(crowd)));
            }
        }

        // Next 24 hour-aligned starts, strictly after (or exactly at) now; pick the 3 least crowded, ties -> earlier.
        LocalDateTime now = clock.now();
        LocalDateTime first = now.truncatedTo(ChronoUnit.HOURS);
        if (first.isBefore(now)) {
            first = first.plusHours(1);
        }
        List<QuietWindow> windows = new ArrayList<>(24);
        for (int i = 0; i < 24; i++) {
            LocalDateTime start = first.plusHours(i);
            windows.add(new QuietWindow(start, crowdingIndex(stationId, start)));
        }
        windows.sort(Comparator.comparingDouble(QuietWindow::crowdingIndex).thenComparing(QuietWindow::start));
        return new ForecastDto(stationId, grid, new ArrayList<>(windows.subList(0, 3)));
    }

    /** Drops the in-memory copy so the next read reloads it (call after the pipeline reloads the table). */
    public void refresh() {
        cache = null;
    }

    // ------------------------------------------------------------------ helpers

    private static int cell(LocalDateTime t) {
        return (t.getDayOfWeek().getValue() - 1) * 24 + t.getHour();
    }

    private Map<Long, double[][]> load() {
        Map<Long, double[][]> c = cache;
        if (c != null) {
            return c;
        }
        synchronized (this) {
            if (cache != null) {
                return cache;
            }
            Map<Long, double[][]> m = new HashMap<>();
            // row = [stationId, dayOfWeek, hourOfDay, expectedSessions, crowdingIndex]
            for (Object[] r : repo.findAllCells()) {
                long sid = ((Number) r[0]).longValue();
                int dow = ((Number) r[1]).intValue();
                int hour = ((Number) r[2]).intValue();
                if (dow < 1 || dow > 7 || hour < 0 || hour > 23) {
                    continue;
                }
                double[][] cells = m.computeIfAbsent(sid, k -> new double[2][CELLS]);
                int idx = (dow - 1) * 24 + hour;
                cells[1][idx] = ((Number) r[3]).doubleValue();
                cells[0][idx] = ((Number) r[4]).doubleValue();
            }
            cache = m;
            return m;
        }
    }
}
