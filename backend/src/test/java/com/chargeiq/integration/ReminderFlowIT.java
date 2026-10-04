package com.voltslot.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.LocalDateTime;

import org.junit.jupiter.api.Test;

import com.chargeiq.entity.User;
import com.chargeiq.entity.Vehicle;
import com.chargeiq.entity.enums.Role;
import com.chargeiq.support.TestData;
import com.fasterxml.jackson.databind.JsonNode;

/**
 * The BigBasket-style "time to recharge" flow: history -> prediction -> active reminder -> snooze / dismiss / book.
 *
 * <ul>
 *   <li>{@link #overdueVehicleGetsReminderThenSnoozeThenBook}: a vehicle with 4 completed sessions every 5 days is overdue;
 *       POST /api/reminders/refresh creates exactly one reminder (also after a second refresh), GET /active returns it
 *       with a slot suggestion, snoozing hides it, the admin clock advance wakes it up again, and "book" creates a HOLD
 *       with source REMINDER (a second "book" is 409);</li>
 *   <li>{@link #demoTriggerDismissAndRetrigger}: demo-trigger makes a not-yet-due vehicle due now; dismiss keeps it quiet
 *       until the demo trigger is used again; foreign / unknown vehicles are 403 / 404;</li>
 *   <li>{@link #tooFewSessionsMeansNoPredictionAndNoReminder}: fewer than 3 sessions = NO_DATA, demo-trigger = 400.</li>
 * </ul>
 * The history is written directly through the repositories (past bookings + charging sessions relative to the clock
 * anchor 2026-10-03T09:30); the prediction row is created with the real {@code RechargePredictionService}.
 */
class ReminderFlowIT extends IntegrationTestBase {

    private record Rx(World w, User user, Vehicle car, String token) { }

    /** Driver with {@code sessions} completed charges, one every 5 days, the last one starting {@code lastStartDaysAgo} days before the anchor. */
    private Rx driver(int sessions, int lastStartDaysAgo) throws Exception {
        World w = newWorld("18.00");
        User user = createUser(Role.USER, "1000.00");
        Vehicle car = createVehicle(user, w.model());
        for (int i = sessions - 1; i >= 0; i--) {
            LocalDateTime start = TestData.ANCHOR.toLocalDate().minusDays(lastStartDaysAgo + 5L * i).atTime(8, 0);
            insertCompletedSession(user, car, w.point(), start);
        }
        return new Rx(w, user, car, login(user));
    }

    private JsonNode active(Rx r) throws Exception {
        return expect(get("/api/reminders/active", r.token()), 200);
    }

    private int refresh(Rx r) throws Exception {
        return expect(post("/api/reminders/refresh", r.token(), null), 200).get("active").asInt();
    }

    // ------------------------------------------------------------------ predictions -> reminder -> snooze -> book

    @Test
    void overdueVehicleGetsReminderThenSnoozeThenBook() throws Exception {
        // sessions start on Sep 13, 18, 23 and 28 at 08:00 and last 35 minutes -> next due Oct 3 08:35, the clock says 09:30
        Rx r = driver(4, 5);
        assertTrue(predictionService.recompute(r.car()).isPresent(), "4 sessions are enough for a prediction");
        User admin = createUser(Role.ADMIN, "0.00");
        String adminToken = login(admin);

        // ---- prediction ----
        JsonNode predictions = expect(get("/api/reminders/predictions", r.token()), 200);
        assertEquals(1, predictions.size());
        JsonNode p = predictions.get(0);
        assertEquals(r.car().getId().longValue(), p.get("vehicleId").asLong());
        assertEquals("OVERDUE", p.get("state").asText());
        assertEquals(4, p.get("sessionsUsed").asInt());
        assertEquals(5.0, p.get("medianIntervalDays").asDouble(), 0.01);
        assertEquals(0.633, p.get("confidence").asDouble(), 0.01, "perfectly regular intervals, 4 of 6 sessions of history");
        assertEquals(8, p.get("preferredHour").asInt());
        assertEquals(r.w().station().getId().longValue(), p.get("preferredStationId").asLong());
        assertEquals(TestData.ANCHOR.toLocalDate().atTime(8, 35), LocalDateTime.parse(p.get("nextDueAt").asText()));
        assertEquals(3, p.get("cadenceHistory").size());

        // ---- nothing is active until the reminders are evaluated ----
        assertEquals(0, active(r).size());
        assertEquals(1, refresh(r), "refresh evaluates my vehicles and returns the number of active reminders");
        assertEquals(1, refresh(r), "refreshing again must not create a duplicate");
        assertTrue(hasNotification(r.token(), "RECHARGE_REMINDER"));

        JsonNode list = active(r);
        assertEquals(1, list.size());
        JsonNode rem = list.get(0);
        long notificationId = rem.get("notificationId").asLong();
        assertEquals(r.car().getId().longValue(), rem.get("vehicle").get("id").asLong());
        assertTrue(rem.get("overdue").asBoolean());
        assertTrue(rem.get("headline").asText().contains(r.w().model().getModel()), "headline: " + rem.get("headline"));
        assertTrue(rem.get("message").asText().contains("every ~5 days"), "message: " + rem.get("message"));
        JsonNode suggestion = rem.get("suggestion");
        assertEquals(r.w().station().getId().longValue(), suggestion.get("stationId").asLong());
        assertEquals(r.w().point().getId().longValue(), suggestion.get("pointId").asLong());
        assertFalse(LocalDateTime.parse(suggestion.get("slotStart").asText()).isBefore(clock.now().minusMinutes(1)),
                "the suggested slot is in the future");

        // ---- snooze: the reminder disappears and is not re-created ----
        expect(post("/api/reminders/" + notificationId + "/snooze", r.token(), map("hours", 0)), 400);   // validation: 1..168
        expect(post("/api/reminders/" + notificationId + "/snooze", r.token(), map("hours", 2)), 200);
        assertEquals(0, active(r).size(), "snoozed reminders are hidden");
        assertEquals(0, refresh(r), "a snoozed reminder blocks a duplicate");

        // ---- 3 hours later (admin clock + background jobs) the snooze is over ----
        advanceClock(adminToken, 180);
        JsonNode again = active(r);
        assertEquals(1, again.size(), "snooze finished -> reminder is active again");
        assertEquals(notificationId, again.get(0).get("notificationId").asLong(), "it is the same reminder");

        // ---- book the suggested slot ----
        JsonNode booking = expect(post("/api/reminders/" + notificationId + "/book", r.token(), null), 201);
        assertEquals("HOLD", booking.get("status").asText());
        assertEquals("REMINDER", booking.get("source").asText());
        assertEquals(r.car().getId().longValue(), booking.get("vehicle").get("id").asLong());
        assertEquals(r.w().station().getId().longValue(), booking.get("station").get("id").asLong());
        assertEquals(20, booking.get("socStart").asInt());
        assertEquals(80, booking.get("socTarget").asInt());
        assertEquals(0, active(r).size(), "a booked reminder is done");
        expect(post("/api/reminders/" + notificationId + "/book", r.token(), null), 409);
        assertEquals(0, refresh(r), "a vehicle with an upcoming booking needs no reminder");

        // the HOLD can be paid like any other booking
        long id = booking.get("id").asLong();
        JsonNode paid = expect(post("/api/bookings/" + id + "/confirm", r.token(), map("paymentMethod", "UPI")), 200);
        assertEquals("CONFIRMED", paid.get("status").asText());
        assertEquals("REMINDER", paid.get("source").asText());
    }

    // ------------------------------------------------------------------ demo trigger, dismiss

    @Test
    void demoTriggerDismissAndRetrigger() throws Exception {
        // last session started yesterday -> next due in about 4 days, far outside the 24 h lead time
        Rx r = driver(4, 1);

        assertEquals(0, active(r).size());
        expect(post("/api/reminders/demo-trigger", r.token(), map("vehicleId", r.car().getId())), 200);
        JsonNode list = active(r);
        assertEquals(1, list.size(), "demo trigger makes the vehicle due right now");
        assertTrue(Math.abs(list.get(0).get("hoursUntilDue").asDouble()) < 0.5, "due about now: " + list.get(0));
        assertEquals(r.w().station().getId().longValue(), list.get(0).get("suggestion").get("stationId").asLong());
        long notificationId = list.get(0).get("notificationId").asLong();

        // dismiss: gone, and no new reminder in this cycle
        expect(post("/api/reminders/" + notificationId + "/dismiss", r.token(), null), 200);
        assertEquals(0, active(r).size());
        assertEquals(0, refresh(r), "dismissed = quiet until the next completed charge");
        expect(post("/api/reminders/" + notificationId + "/snooze", r.token(), map("hours", 1)), 409);   // already handled

        // the demo trigger clears the dismissal so the pop-up can be shown again
        expect(post("/api/reminders/demo-trigger", r.token(), map("vehicleId", r.car().getId())), 200);
        assertEquals(1, active(r).size());

        // access rules
        String intruder = login(createUser(Role.USER, "0.00"));
        expect(post("/api/reminders/demo-trigger", intruder, map("vehicleId", r.car().getId())), 403);
        expect(post("/api/reminders/" + notificationId + "/dismiss", intruder, null), 403);
        expect(post("/api/reminders/demo-trigger", r.token(), map("vehicleId", 987654321L)), 404);
        expect(post("/api/reminders/demo-trigger", r.token(), "{}"), 400);
        expect(get("/api/reminders/active"), 401);        // anonymous
    }

    @Test
    void tooFewSessionsMeansNoPredictionAndNoReminder() throws Exception {
        Rx r = driver(2, 1);

        JsonNode predictions = expect(get("/api/reminders/predictions", r.token()), 200);
        assertEquals(1, predictions.size());
        assertEquals("NO_DATA", predictions.get(0).get("state").asText());
        assertEquals(2, predictions.get(0).get("sessionsUsed").asInt());

        JsonNode err = expect(post("/api/reminders/demo-trigger", r.token(), map("vehicleId", r.car().getId())), 400);
        assertTrue(err.get("message").asText().contains("at least 3"), "message: " + err.get("message"));
        assertEquals(0, refresh(r));
        assertEquals(0, active(r).size());
    }
}
