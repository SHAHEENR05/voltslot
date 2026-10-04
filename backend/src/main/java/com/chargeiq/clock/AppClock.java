package com.chargeiq.clock;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Single source of "now" for the whole application (the demo "time machine").
 * <ul>
 *   <li>FIXED  - the clock starts at {@code app.clock.anchor} (the date the synthetic data ends) and then ticks in real time.</li>
 *   <li>SYSTEM - the real wall-clock time.</li>
 * </ul>
 * An administrator can move the clock forward (advance) to demonstrate reminders, hold expiry and no-shows.
 */
@Component
public class AppClock {
    public static final ZoneId ZONE = ZoneId.of("Asia/Kolkata");

    private final String mode;
    private final LocalDateTime anchor;
    private final Instant startedAt = Instant.now();
    private volatile long offsetSeconds = 0;

    public AppClock(@Value("${app.clock.mode:FIXED}") String mode,
                    @Value("${app.clock.anchor:2026-10-03T09:30:00}") String anchor) {
        this.mode = mode == null ? "FIXED" : mode.trim().toUpperCase();
        this.anchor = LocalDateTime.parse(anchor);
    }

    public LocalDateTime now() {
        LocalDateTime base;
        if ("SYSTEM".equals(mode)) {
            base = LocalDateTime.now(ZONE);
        } else {
            long elapsedMillis = Duration.between(startedAt, Instant.now()).toMillis();
            base = anchor.plusNanos(elapsedMillis * 1_000_000L);
        }
        return base.plusSeconds(offsetSeconds).withNano(0);
    }

    public LocalDate today() {
        return now().toLocalDate();
    }

    public void advance(Duration d) {
        offsetSeconds += d.getSeconds();
    }

    public void reset() {
        offsetSeconds = 0;
    }

    /** Sets the offset so that now() equals the real wall-clock time (India time). Lost on restart, like any offset. */
    public void syncToReal() {
        LocalDateTime base;
        if ("SYSTEM".equals(mode)) {
            base = LocalDateTime.now(ZONE);
        } else {
            long elapsedMillis = Duration.between(startedAt, Instant.now()).toMillis();
            base = anchor.plusNanos(elapsedMillis * 1_000_000L);
        }
        offsetSeconds = Duration.between(base, LocalDateTime.now(ZONE)).getSeconds();
    }

    public String getMode() { return mode; }

    public LocalDateTime getAnchor() { return anchor; }

    public long getOffsetSeconds() { return offsetSeconds; }
}
