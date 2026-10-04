package com.chargeiq.util;

import java.time.LocalDateTime;

/** Helpers for the 30-minute slot grid used by the booking engine. */
public final class TimeUtil {
    public static final int SLOT_MINUTES = 30;

    private TimeUtil() { }

    /** Truncates to seconds=0 and rounds DOWN to the previous :00 / :30 boundary. */
    public static LocalDateTime floorToSlot(LocalDateTime t) {
        LocalDateTime x = t.withSecond(0).withNano(0);
        return x.withMinute(x.getMinute() < 30 ? 0 : 30);
    }

    /** Rounds UP to the next :00 / :30 boundary (unchanged when already on the grid). */
    public static LocalDateTime ceilToSlot(LocalDateTime t) {
        LocalDateTime f = floorToSlot(t);
        boolean exact = f.equals(t);
        return exact ? f : f.plusMinutes(SLOT_MINUTES);
    }

    public static boolean onGrid(LocalDateTime t) {
        return t.getSecond() == 0 && t.getNano() == 0 && (t.getMinute() == 0 || t.getMinute() == 30);
    }
}
