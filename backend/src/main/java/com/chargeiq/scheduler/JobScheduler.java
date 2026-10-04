package com.chargeiq.scheduler;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.chargeiq.service.BookingService;
import com.chargeiq.service.RechargePredictionService;
import com.chargeiq.service.ReminderService;
import com.chargeiq.service.WaitlistService;

/**
 * Background jobs ({@code @Scheduled}). All the real work lives in the services; this class only decides
 * <i>when</i> to call them. Time-based rules use {@code AppClock}, so after the admin moves the demo clock
 * forward {@link #runAllNow()} makes holds expire, no-shows appear and reminders fire immediately.
 * <p>
 * Every job is wrapped in its own try/catch: one failing job must never stop the others.
 */
@Component
public class JobScheduler {

    private static final Logger log = LoggerFactory.getLogger(JobScheduler.class);

    private final BookingService bookings;
    private final WaitlistService waitlist;
    private final ReminderService reminders;
    private final RechargePredictionService predictions;
    private final boolean enabled;

    public JobScheduler(BookingService bookings, WaitlistService waitlist, ReminderService reminders,
                        RechargePredictionService predictions, @Value("${app.scheduler.enabled:true}") boolean enabled) {
        this.bookings = bookings;
        this.waitlist = waitlist;
        this.reminders = reminders;
        this.predictions = predictions;
        this.enabled = enabled;
    }

    /** Every 30 s: expire holds, mark no-shows, auto-complete sessions, "starting soon" nudges, waitlist expiry. */
    @Scheduled(fixedDelayString = "${app.scheduler.bookings-ms:30000}", initialDelayString = "${app.scheduler.bookings-ms:30000}")
    public void bookingJobs() {
        if (enabled) {
            runBookingJobs();
        }
    }

    /** Every 5 min: recharge predictions that are missing, then the reminder evaluation. */
    @Scheduled(fixedDelayString = "${app.scheduler.reminders-ms:300000}", initialDelayString = "${app.scheduler.reminders-ms:300000}")
    public void reminderJobs() {
        if (enabled) {
            runReminderJobs();
        }
    }

    /** Once after start-up so the demo user immediately sees the recharge reminder. */
    @EventListener(ApplicationReadyEvent.class)
    public void onStartup() {
        if (enabled) {
            runReminderJobs();
        }
    }

    /** Runs every job once, ignoring the "enabled" flag (used by the admin "run now" and after moving the clock). */
    public void runAllNow() {
        runBookingJobs();
        runReminderJobs();
    }

    private void runBookingJobs() {
        run("expireHolds", bookings::expireHolds);
        run("markNoShows", bookings::markNoShows);
        run("autoCompleteSessions", bookings::autoCompleteSessions);
        run("notifyUpcoming", bookings::notifyUpcoming);
        run("waitlistExpiry", waitlist::expireOld);
    }

    private void runReminderJobs() {
        run("recomputeMissingPredictions", predictions::recomputeMissing);
        run("reminderEvaluation", reminders::evaluate);
    }

    private void run(String name, java.util.function.IntSupplier job) {
        try {
            int n = job.getAsInt();
            if (n > 0) {
                log.info("Job {} processed {} item(s)", name, n);
            }
        } catch (RuntimeException ex) {
            log.warn("Job {} failed: {}", name, ex.toString());
        }
    }
}
