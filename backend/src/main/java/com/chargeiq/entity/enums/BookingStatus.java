package com.chargeiq.entity.enums;

import java.util.List;

/** Life-cycle of a booking: HOLD -> CONFIRMED -> CHECKED_IN -> COMPLETED (or CANCELLED / NO_SHOW / EXPIRED). */
public enum BookingStatus {
    HOLD, CONFIRMED, CHECKED_IN, COMPLETED, CANCELLED, NO_SHOW, EXPIRED;

    /** Statuses that still block the vehicle / the charging point in the future. */
    public static final List<BookingStatus> LIVE = List.of(HOLD, CONFIRMED, CHECKED_IN);

    /** Statuses whose 30-minute slots stay in booking_slots (everything except CANCELLED and EXPIRED). */
    public boolean occupiesSlots() {
        return this != CANCELLED && this != EXPIRED;
    }
}
