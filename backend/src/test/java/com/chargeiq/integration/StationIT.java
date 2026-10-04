package com.voltslot.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;

import com.chargeiq.entity.ChargingPoint;
import com.chargeiq.entity.ConnectorType;
import com.chargeiq.entity.Operator;
import com.chargeiq.entity.Station;
import com.chargeiq.entity.User;
import com.chargeiq.entity.Vehicle;
import com.chargeiq.entity.VehicleModel;
import com.chargeiq.entity.enums.BookingStatus;
import com.chargeiq.entity.enums.CurrentType;
import com.chargeiq.entity.enums.PointStatus;
import com.chargeiq.entity.enums.Role;
import com.chargeiq.support.TestData;
import com.fasterxml.jackson.databind.JsonNode;

/**
 * Integration tests for the public station locator (no token needed for any GET under /api/stations).
 *
 * <ul>
 *   <li>search: location + radius filter, sorting by distance / price, connector / minKw / openNow filters, bad sort = 400;</li>
 *   <li>detail: summary, points with connector + power + tariff, rating histogram, 404 for an unknown id;</li>
 *   <li>availability: the 48-slot day grid shows FREE, BOOKED, PAST and UNAVAILABLE (outside opening hours or point in
 *       maintenance) and flags points that a given vehicle cannot use.</li>
 * </ul>
 * Stations are created through the repositories in a private map region and every search also filters on the unique
 * operator name ({@code q}), so other tests (or the demo data) can never disturb the expected result lists.
 */
class StationIT extends IntegrationTestBase {

    /** Three stations 1.1 km, 5.6 km and 55.6 km north of a private base point. */
    private record Trio(Operator op, Station a, Station b, Station c, double lat0, double lon0) { }

    private Trio createTrio() {
        double[] region = nextRegion();
        double lat0 = region[0];
        double lon0 = region[1];
        Operator op = TestData.operator(operators, "Op" + uniq());
        ConnectorType ccs2 = TestData.connector(connectors, "CCS2", CurrentType.DC, 60);
        ConnectorType type2 = TestData.connector(connectors, "TYPE2", CurrentType.AC, 7.4);

        Station a = TestData.station(stations, op, "Alpha", lat0 + 0.01, lon0);
        TestData.point(points, a, "A1", ccs2, 60, "20.00");

        Station b = TestData.station(stations, op, "Bravo", lat0 + 0.05, lon0);
        TestData.point(points, b, "B1", ccs2, 30, "12.00");
        TestData.point(points, b, "B2", type2, 22, "12.00");

        Station c = TestData.station(stations, op, "Charlie", lat0 + 0.5, lon0);
        TestData.point(points, c, "C1", ccs2, 22, "15.00");
        return new Trio(op, a, b, c, lat0, lon0);
    }

    private String searchUrl(Trio t, double radiusKm, String extra) {
        return "/api/stations?lat=" + t.lat0() + "&lon=" + t.lon0() + "&radiusKm=" + radiusKm
                + "&q=" + t.op().getName().toLowerCase() + (extra == null ? "" : "&" + extra);
    }

    private static List<Long> ids(JsonNode page) {
        List<Long> ids = new ArrayList<>();
        for (JsonNode s : page.get("content")) {
            ids.add(s.get("id").asLong());
        }
        return ids;
    }

    @Test
    void searchFiltersByRadiusAndSortsByDistance() throws Exception {
        Trio t = createTrio();

        JsonNode near = expect(get(searchUrl(t, 10, null)), 200);
        assertEquals(List.of(t.a().getId(), t.b().getId()), ids(near), "only A and B are within 10 km, nearest first");
        assertEquals(2, near.get("totalElements").asInt());
        assertEquals(1.11, near.get("content").get(0).get("distanceKm").asDouble(), 0.05);
        assertEquals(5.56, near.get("content").get(1).get("distanceKm").asDouble(), 0.05);
        assertEquals(1, near.get("content").get(0).get("totalPoints").asInt());
        assertEquals(2, near.get("content").get(1).get("totalPoints").asInt());
        assertTrue(near.get("content").get(0).get("openNow").asBoolean(), "station is open 24 h");

        JsonNode wide = expect(get(searchUrl(t, 80, null)), 200);
        assertEquals(List.of(t.a().getId(), t.b().getId(), t.c().getId()), ids(wide));
        assertEquals(55.6, wide.get("content").get(2).get("distanceKm").asDouble(), 0.5);
    }

    @Test
    void searchSortsByPriceAndFiltersByConnectorPowerAndOpening() throws Exception {
        Trio t = createTrio();

        // cheapest minimum tariff first: B (12) < C (15) < A (20)
        JsonNode byPrice = expect(get(searchUrl(t, 80, "sort=price")), 200);
        assertEquals(List.of(t.b().getId(), t.c().getId(), t.a().getId()), ids(byPrice));
        assertMoney("12.00", money(byPrice.get("content").get(0).get("minTariff")), "minTariff of B");

        // only B has a TYPE2 point
        assertEquals(List.of(t.b().getId()), ids(expect(get(searchUrl(t, 80, "connector=TYPE2")), 200)));
        // only A has a point of at least 50 kW
        assertEquals(List.of(t.a().getId()), ids(expect(get(searchUrl(t, 80, "minKw=50")), 200)));
        // all three are open round the clock, so "closed" matches nothing
        assertEquals(0, expect(get(searchUrl(t, 80, "openNow=false")), 200).get("totalElements").asInt());
        // free text on the station name
        String bravo = "/api/stations?q=" + t.op().getName().toLowerCase() + " bravo";
        assertEquals(List.of(t.b().getId()), ids(expect(get(bravo), 200)));
    }

    @Test
    void searchWithUnknownSortIsBadRequest() throws Exception {
        get("/api/stations?sort=bogus").andExpect(status().isBadRequest());
    }

    @Test
    void stationDetailShowsPointsAndHistogram() throws Exception {
        Trio t = createTrio();

        JsonNode d = expect(get("/api/stations/" + t.b().getId()), 200);
        assertEquals(t.b().getId().longValue(), d.get("summary").get("id").asLong());
        assertEquals(t.b().getName(), d.get("summary").get("name").asText());
        assertEquals(2, d.get("points").size());
        JsonNode p1 = d.get("points").get(0);
        assertEquals("CCS2", p1.get("connectorCode").asText());
        assertEquals(30.0, p1.get("powerKw").asDouble(), 0.001);
        assertEquals("ACTIVE", p1.get("status").asText());
        assertMoney("12.00", money(p1.get("tariffPerKwh")), "tariff of B1");
        assertEquals("TYPE2", d.get("points").get(1).get("connectorCode").asText());
        for (int star = 1; star <= 5; star++) {
            assertEquals(0, d.get("ratingBreakdown").get(String.valueOf(star)).asInt(), "no reviews yet, star " + star);
        }
        assertEquals(97.0, d.get("uptimePct").asDouble(), 0.001);
    }

    @Test
    void unknownStationIs404() throws Exception {
        JsonNode err = expect(get("/api/stations/987654321"), 404);
        assertEquals(404, err.get("status").asInt());
        assertTrue(err.get("message").asText().contains("987654321"), "message: " + err.get("message"));
        get("/api/stations/987654321/availability").andExpect(status().isNotFound());
        get("/api/stations/987654321/forecast").andExpect(status().isNotFound());
    }

    @Test
    void availabilityGridShowsFreeBookedPastAndUnavailable() throws Exception {
        World w = newWorld("18.00");
        // open 06:00 - 22:00; second point is in maintenance
        Station st = w.station();
        st.setOpenHour(6);
        st.setCloseHour(22);
        stations.save(st);
        ChargingPoint p2 = TestData.point(points, st, "P2", w.ccs2(), 60, "18.00");
        p2.setStatus(PointStatus.MAINTENANCE);
        points.save(p2);

        User driver = createUser(Role.USER, "0.00");
        Vehicle car = createVehicle(driver, w.model());
        // P1 is booked tomorrow 12:00 - 13:00 (two slots)
        insertBooking(driver, car, w.point(), tomorrow().atTime(12, 0), 2, BookingStatus.CONFIRMED, true);

        JsonNode grid = expect(get("/api/stations/" + st.getId() + "/availability?date=" + tomorrow()), 200);
        assertEquals(tomorrow().toString(), grid.get("date").asText());
        assertEquals(30, grid.get("slotMinutes").asInt());
        assertEquals(6, grid.get("openHour").asInt());
        assertEquals(22, grid.get("closeHour").asInt());
        assertEquals(2, grid.get("points").size());

        JsonNode slots1 = grid.get("points").get(0).get("slots");
        assertEquals(w.point().getId().longValue(), grid.get("points").get(0).get("pointId").asLong());
        assertEquals(48, slots1.size());
        assertEquals("UNAVAILABLE", slots1.get(0).get("state").asText(), "00:00 is before opening");
        assertEquals("UNAVAILABLE", slots1.get(11).get("state").asText(), "05:30 is before opening");
        assertEquals("FREE", slots1.get(12).get("state").asText(), "06:00");
        assertEquals("FREE", slots1.get(20).get("state").asText(), "10:00");
        assertEquals("BOOKED", slots1.get(24).get("state").asText(), "12:00");
        assertEquals("BOOKED", slots1.get(25).get("state").asText(), "12:30");
        assertEquals("FREE", slots1.get(26).get("state").asText(), "13:00");
        assertEquals("FREE", slots1.get(43).get("state").asText(), "21:30");
        assertEquals("UNAVAILABLE", slots1.get(44).get("state").asText(), "22:00 is closing time");

        JsonNode slots2 = grid.get("points").get(1).get("slots");
        for (JsonNode s : slots2) {
            assertEquals("UNAVAILABLE", s.get("state").asText(), "a point in maintenance can never be booked");
        }
        assertEquals(24, grid.get("crowdingByHour").size());
    }

    @Test
    void availabilityOfTodayMarksElapsedSlotsAsPast() throws Exception {
        World w = newWorld("18.00");
        Station st = w.station();
        st.setOpenHour(6);
        st.setCloseHour(22);
        stations.save(st);

        // the clock starts at 09:30 on 2026-10-03: 07:00 is over, 20:00 is still ahead
        JsonNode grid = expect(get("/api/stations/" + st.getId() + "/availability"), 200);
        assertEquals(TestData.ANCHOR.toLocalDate().toString(), grid.get("date").asText());
        JsonNode slots = grid.get("points").get(0).get("slots");
        assertEquals("UNAVAILABLE", slots.get(2).get("state").asText(), "01:00");
        assertEquals("PAST", slots.get(14).get("state").asText(), "07:00");
        assertEquals("FREE", slots.get(40).get("state").asText(), "20:00");
    }

    @Test
    void availabilityFlagsPointsTheVehicleCannotUse() throws Exception {
        World w = newWorld("18.00");
        ConnectorType type2 = TestData.connector(connectors, "TYPE2", CurrentType.AC, 7.4);
        VehicleModel scooter = TestData.vehicleModel(vehicleModels, "ITMake", "ITScooter" + uniq().substring(0, 4),
                3.0, 3.3, 0.0, Set.of(type2));
        User u = createUser(Role.USER, "0.00");
        Vehicle acOnly = createVehicle(u, scooter);
        Vehicle fast = createVehicle(u, w.model());

        JsonNode noVehicle = expect(get("/api/stations/" + w.station().getId() + "/availability?date=" + tomorrow()), 200);
        assertTrue(noVehicle.get("points").get(0).get("compatible").asBoolean(), "without a vehicle every point is shown as compatible");

        JsonNode withScooter = expect(get("/api/stations/" + w.station().getId() + "/availability?date=" + tomorrow()
                + "&vehicleId=" + acOnly.getId()), 200);
        assertFalse(withScooter.get("points").get(0).get("compatible").asBoolean(), "an AC-only scooter cannot use CCS2");

        JsonNode withCar = expect(get("/api/stations/" + w.station().getId() + "/availability?date=" + tomorrow()
                + "&vehicleId=" + fast.getId()), 200);
        assertTrue(withCar.get("points").get(0).get("compatible").asBoolean());
    }
}
