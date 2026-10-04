package com.voltslot.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.chargeiq.entity.User;
import com.chargeiq.entity.Vehicle;
import com.chargeiq.entity.enums.Role;
import com.chargeiq.util.TimeUtil;
import com.fasterxml.jackson.databind.JsonNode;

/**
 * End-to-end booking life-cycle through the real REST API, security filter chain, services and H2 database.
 *
 * <ul>
 *   <li>{@link #holdConfirmCheckInComplete}: HOLD -> pay with WALLET -> CHECKED_IN -> COMPLETED with a cheaper final
 *       charge; asserts the wallet ledger (debit, then refund of the difference), payment, invoice, notifications,
 *       booking_slots and every status transition (wrong transitions are 409);</li>
 *   <li>refund policy: cancel at least 60 minutes before the start = 100 %, later = 50 %, an unpaid HOLD refunds nothing,
 *       and cancelling releases the slots so somebody else can book them;</li>
 *   <li>payment errors: 402 when the wallet is too low (booking stays HOLD, UPI still works), expired HOLD can not be paid;</li>
 *   <li>conflicts: a taken slot is 409 with usable alternatives; the same vehicle can not overlap itself; foreign
 *       bookings are 403.</li>
 * </ul>
 * Time handling: the app clock is FIXED at 2026-10-03T09:30 and then ticks. Check-in is only possible in a window of
 * +-15 minutes around the start, so the check-in test moves the clock with POST /api/admin/clock/advance (as ADMIN) to
 * 5 minutes before a slot that is computed from the current clock; the base class resets the clock after each test.
 */
class BookingFlowIT extends IntegrationTestBase {

    private static final String WALLET = "WALLET";

    /** One driver with a funded wallet, one car, one ADMIN (for the clock) and the station fixture. */
    private record Ctx(World w, User user, Vehicle car, String token, String adminToken) { }

    private Ctx ctx(String walletBalance) throws Exception {
        World w = newWorld("18.00");
        User user = createUser(Role.USER, walletBalance);
        Vehicle car = createVehicle(user, w.model());
        User admin = createUser(Role.ADMIN, "0.00");
        return new Ctx(w, user, car, login(user), login(admin));
    }

    private JsonNode hold(Ctx c, LocalDateTime start, int from, int to) throws Exception {
        return expect(post("/api/bookings", c.token(), bookingBody(c.car(), c.w().point(), start, from, to)), 201);
    }

    private JsonNode confirm(Ctx c, long bookingId, String method, int expectedStatus) throws Exception {
        return expect(post("/api/bookings/" + bookingId + "/confirm", c.token(), map("paymentMethod", method)), expectedStatus);
    }

    private JsonNode estimate(Ctx c, LocalDateTime start, int from, int to) throws Exception {
        return expect(post("/api/bookings/estimate", c.token(),
                map("vehicleId", c.car().getId(), "chargingPointId", c.w().point().getId(), "startTime", iso(start),
                        "socStart", from, "socTarget", to)), 200);
    }

    private int occupiedSlotRows(Ctx c) {
        return bookingSlots.findOccupied(List.of(c.w().point().getId()), tomorrow().minusDays(2).atStartOfDay(),
                tomorrow().plusDays(30).atStartOfDay()).size();
    }

    private static LocalDateTime time(JsonNode n) {
        return LocalDateTime.parse(n.asText());
    }

    private static boolean isNull(JsonNode n) {
        return n == null || n.isNull();
    }

    // ------------------------------------------------------------------ the happy path

    @Test
    void holdConfirmCheckInComplete() throws Exception {
        Ctx c = ctx("1000.00");

        // a slot 40-70 minutes ahead of "now"; then the admin moves the clock to 5 minutes before it (inside the check-in window)
        LocalDateTime start = TimeUtil.ceilToSlot(clock.now().plusMinutes(40));
        advanceClockTo(c.adminToken(), start, 5);
        LocalDateTime appNow = time(expect(get("/api/clock"), 200).get("now"));
        assertTrue(Duration.between(appNow, start).toMinutes() <= 6 && !appNow.isAfter(start),
                "clock should now be about 5 minutes before the slot: now=" + appNow + " start=" + start);

        BigDecimal cost80 = money(estimate(c, start, 20, 80).get("estimatedCost"));
        JsonNode e60 = estimate(c, start, 20, 60);
        BigDecimal cost60 = money(e60.get("estimatedCost"));
        assertTrue(cost80.compareTo(cost60) > 0, "charging to 80 % must cost more than to 60 %");

        // ---- 1. HOLD ----
        JsonNode hold = hold(c, start, 20, 80);
        long id = hold.get("id").asLong();
        assertEquals("HOLD", hold.get("status").asText());
        assertEquals("WEB", hold.get("source").asText());
        assertEquals(2, hold.get("slots").asInt(), "40 kWh car on a 50 kW limit needs 35 minutes = 2 slots");
        assertEquals(start, time(hold.get("startTime")));
        assertEquals(start.plusMinutes(60), time(hold.get("endTime")));
        assertTrue(hold.get("bookingCode").asText().startsWith("VSL-"));
        assertFalse(isNull(hold.get("holdExpiresAt")), "a HOLD has an expiry time");
        assertTrue(isNull(hold.get("payment")), "nothing is paid yet");
        assertEquals(c.w().point().getId().longValue(), hold.get("point").get("id").asLong());
        assertEquals(c.car().getId().longValue(), hold.get("vehicle").get("id").asLong());
        assertEquals(c.w().station().getId().longValue(), hold.get("station").get("id").asLong());
        assertMoney(cost80, money(hold.get("estCost")), "estCost of the hold");
        assertEquals(2, occupiedSlotRows(c), "the hold occupies exactly two 30-minute slots");
        assertMoney("1000.00", walletBalance(c.token()), "wallet is untouched by a HOLD");

        // ---- 2. confirm with the wallet ----
        JsonNode paid = confirm(c, id, WALLET, 200);
        assertEquals("CONFIRMED", paid.get("status").asText());
        assertEquals("PAID", paid.get("payment").get("status").asText());
        assertEquals(WALLET, paid.get("payment").get("method").asText());
        assertMoney(cost80, money(paid.get("payment").get("amount")), "payment amount");
        String invoiceNo = paid.get("payment").get("invoiceNo").asText();
        assertTrue(invoiceNo.startsWith("INV-2526-"), "invoice number: " + invoiceNo);
        assertTrue(isNull(paid.get("holdExpiresAt")), "a paid booking no longer expires");
        assertMoney(new BigDecimal("1000.00").subtract(cost80), walletBalance(c.token()), "wallet after paying");
        assertTrue(hasNotification(c.token(), "BOOKING_CONFIRMED"), "a BOOKING_CONFIRMED notification is created");
        confirm(c, id, WALLET, 409);     // paying twice is refused

        JsonNode invoice = expect(get("/api/bookings/" + id + "/invoice", c.token()), 200);
        assertEquals(invoiceNo, invoice.get("invoiceNo").asText());
        assertEquals(paid.get("bookingCode").asText(), invoice.get("bookingCode").asText());
        assertMoney(cost80, money(invoice.get("amount")), "invoice amount");
        assertEquals("PAID", invoice.get("status").asText());

        // ---- 3. check-in (window is open because of the clock advance) ----
        JsonNode before = expect(get("/api/bookings/" + id, c.token()), 200);
        assertTrue(before.get("canCheckIn").asBoolean(), "inside the +-15 minute window");
        JsonNode in = expect(post("/api/bookings/" + id + "/check-in", c.token(), null), 200);
        assertEquals("CHECKED_IN", in.get("status").asText());
        assertFalse(isNull(in.get("checkedInAt")));
        expect(post("/api/bookings/" + id + "/check-in", c.token(), null), 409);      // not CONFIRMED any more
        expect(post("/api/bookings/" + id + "/cancel", c.token(), null), 409);        // too late to cancel

        // ---- 4. complete with a lower final charge: the customer only pays for what was delivered ----
        JsonNode done = expect(post("/api/bookings/" + id + "/complete", c.token(), map("socEnd", 60)), 200);
        assertEquals("COMPLETED", done.get("status").asText());
        assertEquals(60, done.get("session").get("socEnd").asInt());
        assertEquals(e60.get("energyKwh").asDouble(), done.get("session").get("energyKwh").asDouble(), 0.001);
        assertMoney(cost60, money(done.get("session").get("amount")), "session amount");
        assertMoney(cost60, money(done.get("payment").get("amount")), "final bill replaces the prepaid amount");
        assertMoney(new BigDecimal("1000.00").subtract(cost60), walletBalance(c.token()),
                "wallet = start - debit + refund of the difference = start - final bill");
        assertTrue(hasNotification(c.token(), "CHARGE_COMPLETE"), "a CHARGE_COMPLETE notification is created");

        // ---- ledger: one DEBIT with the full price and one REFUND with the difference ----
        JsonNode ledger = expect(get("/api/wallet/transactions?size=20", c.token()), 200).get("content");
        boolean debit = false;
        boolean refund = false;
        for (JsonNode t : ledger) {
            if ("DEBIT".equals(t.get("type").asText())) {
                assertMoney(cost80, money(t.get("amount")), "DEBIT amount");
                debit = true;
            }
            if ("REFUND".equals(t.get("type").asText())) {
                assertMoney(cost80.subtract(cost60), money(t.get("amount")), "REFUND amount");
                refund = true;
            }
        }
        assertTrue(debit && refund, "ledger must contain a DEBIT and a REFUND: " + ledger);

        // ---- final state ----
        expect(post("/api/bookings/" + id + "/complete", c.token(), null), 409);
        expect(post("/api/bookings/" + id + "/check-in", c.token(), null), 409);
        JsonNode completed = expect(get("/api/bookings?status=COMPLETED", c.token()), 200);
        assertEquals(1, completed.get("totalElements").asInt());
        assertEquals(id, completed.get("content").get(0).get("id").asLong());
        assertEquals(0, expect(get("/api/bookings?status=CONFIRMED", c.token()), 200).get("totalElements").asInt());
    }

    // ------------------------------------------------------------------ cancellation and the refund policy

    @Test
    void cancelAtLeastSixtyMinutesBeforeStartRefundsEverything() throws Exception {
        Ctx c = ctx("1000.00");
        LocalDateTime start = tomorrow().atTime(10, 0);      // 24+ hours ahead, NORMAL tariff band

        long id = hold(c, start, 20, 80).get("id").asLong();
        JsonNode paid = confirm(c, id, WALLET, 200);
        assertMoney("469.57", money(paid.get("payment").get("amount")), "40 kWh, 20-80 %, 18.00/kWh at 10:00");
        assertMoney("530.43", walletBalance(c.token()), "1000.00 - 469.57");
        assertMoney("469.57", money(paid.get("refundIfCancelled")), "the booking announces the refund it would give now");
        expect(post("/api/bookings/" + id + "/check-in", c.token(), null), 400);   // tomorrow: outside the window

        JsonNode cancelled = expect(post("/api/bookings/" + id + "/cancel", c.token(), map("reason", "Plans changed")), 200);
        assertEquals("CANCELLED", cancelled.get("status").asText());
        assertEquals("Plans changed", cancelled.get("cancelReason").asText());
        assertEquals("REFUNDED", cancelled.get("payment").get("status").asText());
        assertMoney("469.57", money(cancelled.get("payment").get("refundedAmount")), "refunded amount");
        assertMoney("1000.00", walletBalance(c.token()), "full refund puts the balance back");
        assertEquals(0, occupiedSlotRows(c), "cancelling releases the slots");
        assertTrue(hasNotification(c.token(), "BOOKING_CANCELLED"));
        expect(post("/api/bookings/" + id + "/cancel", c.token(), null), 409);     // already cancelled

        // the released slot can be booked by somebody else
        User other = createUser(Role.USER, "0.00");
        Vehicle otherCar = createVehicle(other, c.w().model());
        expect(post("/api/bookings", login(other), bookingBody(otherCar, c.w().point(), start, 20, 80)), 201);
    }

    @Test
    void cancelLessThanSixtyMinutesBeforeStartRefundsHalf() throws Exception {
        Ctx c = ctx("1000.00");
        // 20-50 minutes ahead of the (ticking) clock: inside the 60 minute no-full-refund zone, no clock change needed
        LocalDateTime start = TimeUtil.ceilToSlot(clock.now().plusMinutes(20));

        long id = hold(c, start, 20, 80).get("id").asLong();
        JsonNode paid = confirm(c, id, WALLET, 200);
        BigDecimal cost = money(paid.get("payment").get("amount"));
        BigDecimal half = cost.multiply(new BigDecimal("0.50")).setScale(2, RoundingMode.HALF_UP);
        assertMoney(half, money(paid.get("refundIfCancelled")), "late cancel announces 50 %");

        JsonNode cancelled = expect(post("/api/bookings/" + id + "/cancel", c.token(), null), 200);
        assertEquals("CANCELLED", cancelled.get("status").asText());
        assertEquals("Cancelled by user", cancelled.get("cancelReason").asText(), "default reason when none is sent");
        assertEquals("PART_REFUND", cancelled.get("payment").get("status").asText());
        assertMoney(half, money(cancelled.get("payment").get("refundedAmount")), "refunded amount");
        assertMoney(new BigDecimal("1000.00").subtract(cost).add(half), walletBalance(c.token()),
                "balance = start - price + 50 % refund");
        assertEquals(0, occupiedSlotRows(c));
    }

    @Test
    void cancellingAnUnpaidHoldRefundsNothingAndReleasesTheSlots() throws Exception {
        Ctx c = ctx("500.00");
        long id = hold(c, tomorrow().atTime(11, 0), 20, 80).get("id").asLong();
        assertEquals(2, occupiedSlotRows(c));

        JsonNode cancelled = expect(post("/api/bookings/" + id + "/cancel", c.token(), null), 200);
        assertEquals("CANCELLED", cancelled.get("status").asText());
        assertTrue(isNull(cancelled.get("payment")), "no payment exists for an unpaid hold");
        assertMoney("500.00", walletBalance(c.token()), "nothing to refund");
        assertEquals(0, occupiedSlotRows(c));
    }

    // ------------------------------------------------------------------ payment problems and expiry

    @Test
    void lowWalletGives402ButBookingSurvivesAndUpiWorks() throws Exception {
        Ctx c = ctx("10.00");
        long id = hold(c, tomorrow().atTime(10, 0), 20, 80).get("id").asLong();

        JsonNode err = confirm(c, id, WALLET, 402);
        assertEquals(402, err.get("status").asInt());
        assertEquals("HOLD", expect(get("/api/bookings/" + id, c.token()), 200).get("status").asText());
        assertMoney("10.00", walletBalance(c.token()), "a failed payment must not change the wallet");

        JsonNode upi = confirm(c, id, "UPI", 200);
        assertEquals("CONFIRMED", upi.get("status").asText());
        assertEquals("UPI", upi.get("payment").get("method").asText());
        assertMoney("10.00", walletBalance(c.token()), "UPI does not touch the wallet");
    }

    @Test
    void unpaidHoldExpiresAfterFiveMinutes() throws Exception {
        Ctx c = ctx("1000.00");
        long id = hold(c, tomorrow().atTime(12, 0), 20, 80).get("id").asLong();
        assertEquals(2, occupiedSlotRows(c));

        advanceClock(c.adminToken(), 6);     // the endpoint also runs the background jobs once -> expireHolds()

        JsonNode b = expect(get("/api/bookings/" + id, c.token()), 200);
        assertEquals("EXPIRED", b.get("status").asText());
        assertEquals(0, occupiedSlotRows(c), "expired holds release their slots");
        confirm(c, id, WALLET, 409);
        assertMoney("1000.00", walletBalance(c.token()), "nothing was charged");
    }

    // ------------------------------------------------------------------ conflicts and access

    @Test
    void takenSlotIs409WithBookableAlternatives() throws Exception {
        Ctx a = ctx("1000.00");
        User bUser = createUser(Role.USER, "1000.00");
        Vehicle bCar = createVehicle(bUser, a.w().model());
        String bToken = login(bUser);
        LocalDateTime start = tomorrow().atTime(10, 0);

        hold(a, start, 20, 80);

        // same vehicle again, overlapping time -> conflict raised before any slot is touched
        JsonNode overlap = expect(post("/api/bookings", a.token(),
                bookingBody(a.car(), a.w().point(), start.plusMinutes(30), 20, 80)), 409);
        assertTrue(overlap.get("message").asText().contains("overlaps"), "message: " + overlap.get("message"));

        // another driver wants the very same point and time
        JsonNode err = expect(post("/api/bookings", bToken, bookingBody(bCar, a.w().point(), start, 20, 80)), 409);
        assertEquals(409, err.get("status").asInt());
        JsonNode same = err.get("alternatives").get("sameStation");
        assertTrue(same != null && same.isArray() && same.size() > 0, "alternatives at the same station: " + err);
        for (JsonNode opt : same) {
            LocalDateTime s = time(opt.get("start"));
            boolean overlaps = s.isBefore(start.plusMinutes(60)) && s.plusMinutes(60).isAfter(start);
            assertFalse(overlaps, "suggested slot " + s + " collides with the booked 10:00-11:00");
        }
        // ... and the first suggestion can really be booked
        LocalDateTime suggested = time(same.get(0).get("start"));
        JsonNode second = expect(post("/api/bookings", bToken, bookingBody(bCar, a.w().point(), suggested, 20, 80)), 201);
        assertEquals("HOLD", second.get("status").asText());
    }

    @Test
    void otherUsersCannotTouchMyBooking() throws Exception {
        Ctx c = ctx("1000.00");
        long id = hold(c, tomorrow().atTime(10, 0), 20, 80).get("id").asLong();
        String intruder = login(createUser(Role.USER, "1000.00"));

        expect(get("/api/bookings/" + id, intruder), 403);
        expect(post("/api/bookings/" + id + "/cancel", intruder, null), 403);
        expect(post("/api/bookings/" + id + "/confirm", intruder, map("paymentMethod", "UPI")), 403);
        expect(get("/api/bookings/987654321", c.token()), 404);
        expect(get("/api/bookings/" + id), 401);                       // anonymous
        assertNotNull(expect(get("/api/bookings/" + id, c.token()), 200).get("bookingCode"));
    }
}
