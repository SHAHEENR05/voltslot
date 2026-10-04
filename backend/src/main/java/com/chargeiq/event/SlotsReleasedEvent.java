package com.chargeiq.event;

import java.time.LocalDateTime;

/**
 * Application event published when charging slots become free again (booking cancelled or hold expired).
 * <p>
 * Why an event? {@code BookingService} should not know about the waiting list. It only announces
 * "these slots are free now"; {@code WaitlistService} listens (after the transaction has committed) and decides
 * whether somebody on the waiting list can be promoted. This keeps the two services loosely coupled.
 *
 * @param stationId station that owns the point
 * @param pointId   charging point whose slots were released
 * @param from      start of the released window (inclusive)
 * @param to        end of the released window (exclusive)
 */
public record SlotsReleasedEvent(Long stationId, Long pointId, LocalDateTime from, LocalDateTime to) { }
