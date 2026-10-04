package com.voltslot.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import com.chargeiq.entity.User;
import com.chargeiq.entity.Vehicle;
import com.chargeiq.entity.enums.Role;
import com.fasterxml.jackson.databind.JsonNode;

/**
 * Double-booking protection under real parallelism (this is the viva question "what if two users book the same slot?").
 *
 * <p>20 different drivers (each with an own vehicle and a funded wallet) POST /api/bookings for the SAME charging point
 * and the SAME start time at the same moment (a {@link CountDownLatch} is the starting gun, so all threads fire together).
 * Expected outcome: exactly one HOLD (201) and 19 conflicts (409) - and nothing else (no 500, no second booking).
 * Finally the database is inspected: one booking row for the point and exactly the slot rows that one booking needs
 * ({@code booking_slots} has UNIQUE(charging_point_id, slot_start) as the safety net behind the pessimistic row lock).
 *
 * <p>The test must see real commits, so it is deliberately not transactional; it uses its own station and users.
 */
class BookingConcurrencyIT extends IntegrationTestBase {

    private static final int THREADS = 20;

    /** Status + body of one HTTP call. */
    private record Outcome(int status, String body) { }

    @Test
    void twentyDriversRaceForOneSlotExactlyOneWins() throws Exception {
        World w = newWorld("18.00");
        LocalDateTime start = tomorrow().atTime(14, 0);

        // ---- 20 drivers, each with own vehicle and wallet, logged in before the race starts ----
        List<String> tokens = new ArrayList<>();
        List<Vehicle> cars = new ArrayList<>();
        for (int i = 0; i < THREADS; i++) {
            User u = createUser(Role.USER, "1000.00");
            cars.add(createVehicle(u, w.model()));
            tokens.add(login(u));
        }
        // how many 30-minute slots one booking needs (taken from the estimate endpoint, not hard-coded)
        int neededSlots = expect(post("/api/bookings/estimate", tokens.get(0),
                map("vehicleId", cars.get(0).getId(), "chargingPointId", w.point().getId(), "startTime", iso(start),
                        "socStart", 20, "socTarget", 80)), 200).get("slots").asInt();
        assertEquals(2, neededSlots);

        // ---- the race ----
        ExecutorService pool = Executors.newFixedThreadPool(THREADS);
        CountDownLatch ready = new CountDownLatch(THREADS);
        CountDownLatch startGun = new CountDownLatch(1);
        List<Future<Outcome>> futures = new ArrayList<>();
        try {
            for (int i = 0; i < THREADS; i++) {
                final String token = tokens.get(i);
                final String body = json.writeValueAsString(bookingBody(cars.get(i), w.point(), start, 20, 80));
                Callable<Outcome> task = () -> {
                    ready.countDown();
                    startGun.await();
                    MvcResult res = post("/api/bookings", token, body).andReturn();
                    return new Outcome(res.getResponse().getStatus(), bodyOf(res));
                };
                futures.add(pool.submit(task));
            }
            assertTrue(ready.await(60, TimeUnit.SECONDS), "all threads must be ready");
            startGun.countDown();

            int created = 0;
            int conflicts = 0;
            List<String> unexpected = new ArrayList<>();
            JsonNode winner = null;
            for (Future<Outcome> f : futures) {
                Outcome o = f.get(180, TimeUnit.SECONDS);
                if (o.status() == 201) {
                    created++;
                    winner = json.readTree(o.body());
                } else if (o.status() == 409) {
                    conflicts++;
                } else {
                    unexpected.add(o.status() + " " + o.body());
                }
            }
            assertTrue(unexpected.isEmpty(), "only 201 and 409 are acceptable, got: " + unexpected);
            assertEquals(1, created, "exactly one HOLD must be created");
            assertEquals(THREADS - 1, conflicts, "everybody else must get 409");

            // ---- what the winner got ----
            assertEquals("HOLD", winner.get("status").asText());
            assertEquals(neededSlots, winner.get("slots").asInt());
            assertEquals(w.point().getId().longValue(), winner.get("point").get("id").asLong());

            // ---- what the database holds ----
            Long bookingRows = jdbc.queryForObject("select count(*) from bookings where charging_point_id = ?", Long.class,
                    w.point().getId());
            assertEquals(1L, bookingRows.longValue(), "one booking row for the contested point");
            Long slotRows = jdbc.queryForObject("select count(*) from booking_slots where charging_point_id = ?", Long.class,
                    w.point().getId());
            assertEquals((long) neededSlots, slotRows.longValue(), "booking_slots has exactly the rows of the winning booking");

            Set<LocalDateTime> taken = new HashSet<>();
            for (Object[] row : bookingSlots.findOccupied(List.of(w.point().getId()), start.minusHours(2), start.plusHours(5))) {
                taken.add((LocalDateTime) row[1]);
            }
            Set<LocalDateTime> expected = new HashSet<>();
            for (int i = 0; i < neededSlots; i++) {
                expected.add(start.plusMinutes(30L * i));
            }
            assertEquals(expected, taken, "the occupied slots are exactly start, start+30, ...");
        } finally {
            pool.shutdownNow();
        }
    }
}
