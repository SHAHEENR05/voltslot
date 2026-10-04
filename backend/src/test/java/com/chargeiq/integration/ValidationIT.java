package com.voltslot.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;

import com.chargeiq.entity.ConnectorType;
import com.chargeiq.entity.User;
import com.chargeiq.entity.Vehicle;
import com.chargeiq.entity.VehicleModel;
import com.chargeiq.entity.enums.CurrentType;
import com.chargeiq.entity.enums.Role;
import com.chargeiq.support.TestData;
import com.fasterxml.jackson.databind.JsonNode;

/**
 * Integration tests for request validation: every invalid body must give HTTP 400 with the uniform error JSON
 * ({@code status, error, message, path, fieldErrors[{field,message}]}).
 *
 * <ul>
 *   <li>bean validation (@Valid): bad register, bad login, bad booking, bad estimate -> 400 + the offending field names;</li>
 *   <li>malformed JSON / wrong date format -> 400 without field errors;</li>
 *   <li>business-rule 400s raised by the services: off-grid or past start time, target charge not above start charge,
 *       missing point/station, vehicle that cannot use the connector;</li>
 *   <li>access rules around the same endpoints: 401 without token, 404 unknown vehicle, 403 someone else's vehicle.</li>
 * </ul>
 */
class ValidationIT extends IntegrationTestBase {

    /** Names of the fields listed in {@code fieldErrors}. */
    private static Set<String> fieldNames(JsonNode error) {
        Set<String> names = new HashSet<>();
        JsonNode list = error.get("fieldErrors");
        assertTrue(list != null && list.isArray(), "fieldErrors must be an array, body: " + error);
        for (JsonNode f : list) {
            names.add(f.get("field").asText());
            assertTrue(f.get("message").asText().length() > 0, "every field error needs a message");
        }
        return names;
    }

    // ------------------------------------------------------------------ bean validation

    @Test
    void registerWithBadFieldsReturns400WithFieldErrors() throws Exception {
        JsonNode err = expect(post("/api/auth/register", null,
                map("fullName", "", "email", "not-an-email", "password", "short")), 400);

        assertEquals(400, err.get("status").asInt());
        assertEquals("/api/auth/register", err.get("path").asText());
        Set<String> fields = fieldNames(err);
        assertTrue(fields.contains("fullName"), "fields: " + fields);
        assertTrue(fields.contains("email"), "fields: " + fields);
        assertTrue(fields.contains("password"), "fields: " + fields);
    }

    @Test
    void registerRejectsPasswordWithoutDigit() throws Exception {
        String email = "pw-" + uniq() + "@test.in";
        post("/api/auth/register", null,
                map("fullName", "Test User", "email", email, "password", "OnlyLetters"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors").isArray())
                .andExpect(jsonPath("$.status").value(400));
        // nothing was stored
        assertTrue(users.findByEmailIgnoreCase(email).isEmpty(), "invalid registration must not create a user");
    }

    @Test
    void loginWithBlankFieldsReturns400() throws Exception {
        JsonNode err = expect(post("/api/auth/login", null, map("email", "", "password", "")), 400);
        Set<String> fields = fieldNames(err);
        assertTrue(fields.contains("email"), "fields: " + fields);
        assertTrue(fields.contains("password"), "fields: " + fields);
    }

    @Test
    void malformedJsonAndWrongDateFormatReturn400() throws Exception {
        JsonNode err = expect(post("/api/auth/login", null, "{ this is not json"), 400);
        assertTrue(err.get("message").asText().toLowerCase().contains("malformed"), "message: " + err.get("message"));

        String token = login(createUser(Role.USER, "0.00"));
        expect(post("/api/bookings", token,
                "{\"vehicleId\":1,\"chargingPointId\":1,\"startTime\":\"tomorrow morning\",\"socStart\":20,\"socTarget\":80}"), 400);
    }

    @Test
    void bookingWithMissingFieldsReturns400() throws Exception {
        String token = login(createUser(Role.USER, "0.00"));

        JsonNode err = expect(post("/api/bookings", token, "{}"), 400);
        Set<String> fields = fieldNames(err);
        assertTrue(fields.contains("vehicleId"), "fields: " + fields);
        assertTrue(fields.contains("startTime"), "fields: " + fields);
        assertTrue(fields.contains("socStart"), "fields: " + fields);
        assertTrue(fields.contains("socTarget"), "fields: " + fields);
    }

    @Test
    void bookingWithOutOfRangeChargeLevelsReturns400() throws Exception {
        String token = login(createUser(Role.USER, "0.00"));

        JsonNode err = expect(post("/api/bookings", token,
                map("vehicleId", 1, "chargingPointId", 1, "startTime", "2026-10-04T10:00:00",
                        "socStart", 100, "socTarget", 0)), 400);
        Set<String> fields = fieldNames(err);
        assertTrue(fields.contains("socStart"), "socStart max is 99, fields: " + fields);
        assertTrue(fields.contains("socTarget"), "socTarget min is 1, fields: " + fields);
    }

    @Test
    void estimateWithMissingOrInvalidFieldsReturns400() throws Exception {
        String token = login(createUser(Role.USER, "0.00"));

        Set<String> missing = fieldNames(expect(post("/api/bookings/estimate", token, "{}"), 400));
        assertTrue(missing.contains("vehicleId"), "fields: " + missing);
        assertTrue(missing.contains("chargingPointId"), "fields: " + missing);
        assertTrue(missing.contains("socStart"), "fields: " + missing);
        assertTrue(missing.contains("socTarget"), "fields: " + missing);

        Set<String> range = fieldNames(expect(post("/api/bookings/estimate", token,
                map("vehicleId", 1, "chargingPointId", 1, "socStart", -5, "socTarget", 101)), 400));
        assertTrue(range.contains("socStart"), "fields: " + range);
        assertTrue(range.contains("socTarget"), "fields: " + range);
    }

    // ------------------------------------------------------------------ business-rule 400s

    @Test
    void estimateRejectsTargetNotAboveStart() throws Exception {
        World w = newWorld("18.00");
        User u = createUser(Role.USER, "0.00");
        Vehicle v = createVehicle(u, w.model());
        String token = login(u);

        JsonNode err = expect(post("/api/bookings/estimate", token,
                map("vehicleId", v.getId(), "chargingPointId", w.point().getId(), "socStart", 80, "socTarget", 50)), 400);
        assertTrue(err.get("message").asText().contains("Target charge must be higher"), "message: " + err.get("message"));
    }

    @Test
    void estimateRejectsVehicleThatCannotUseTheConnector() throws Exception {
        World w = newWorld("18.00");
        ConnectorType type2 = TestData.connector(connectors, "TYPE2", CurrentType.AC, 7.4);
        VehicleModel acOnly = TestData.vehicleModel(vehicleModels, "ITMake", "ITScooter" + uniq().substring(0, 4),
                3.0, 3.3, 0.0, Set.of(type2));
        User u = createUser(Role.USER, "0.00");
        Vehicle v = createVehicle(u, acOnly);
        String token = login(u);

        JsonNode err = expect(post("/api/bookings/estimate", token,
                map("vehicleId", v.getId(), "chargingPointId", w.point().getId(), "socStart", 20, "socTarget", 80)), 400);
        assertTrue(err.get("message").asText().contains("CCS2"), "message: " + err.get("message"));
    }

    @Test
    void estimateGivesTheDocumentedNumbers() throws Exception {
        World w = newWorld("18.00");
        User u = createUser(Role.USER, "0.00");
        Vehicle v = createVehicle(u, w.model());
        String token = login(u);

        // 10:00 is a NORMAL band hour (x1.00): 40 kWh battery, 20 -> 80 % = 26.09 kWh from the wall, 50 kW, 35 min, 2 slots
        JsonNode est = expect(post("/api/bookings/estimate", token,
                map("vehicleId", v.getId(), "chargingPointId", w.point().getId(), "startTime", "2026-10-04T10:00:00",
                        "socStart", 20, "socTarget", 80)), 200);
        assertEquals(26.09, est.get("energyKwh").asDouble(), 0.001);
        assertEquals(50.0, est.get("acceptedKw").asDouble(), 0.001);
        assertEquals(35, est.get("durationMinutes").asInt());
        assertEquals(2, est.get("slots").asInt());
        assertEquals("NORMAL", est.get("bandName").asText());
        assertMoney("469.57", money(est.get("estimatedCost")), "estimatedCost");
    }

    @Test
    void bookingRulesGive400() throws Exception {
        World w = newWorld("18.00");
        User u = createUser(Role.USER, "0.00");
        Vehicle v = createVehicle(u, w.model());
        String token = login(u);
        LocalDateTime tenAm = tomorrow().atTime(10, 0);

        // not on the 30-minute grid
        JsonNode offGrid = expect(post("/api/bookings", token, bookingBody(v, w.point(), tenAm.plusMinutes(15), 20, 80)), 400);
        assertTrue(offGrid.get("message").asText().contains("30-minute"), "message: " + offGrid.get("message"));

        // in the past
        LocalDateTime yesterday = TestData.ANCHOR.toLocalDate().minusDays(1).atTime(10, 0);
        JsonNode past = expect(post("/api/bookings", token, bookingBody(v, w.point(), yesterday, 20, 80)), 400);
        assertTrue(past.get("message").asText().contains("past"), "message: " + past.get("message"));

        // too far ahead (horizon is 14 days)
        LocalDateTime far = TestData.ANCHOR.toLocalDate().plusDays(30).atTime(10, 0);
        expect(post("/api/bookings", token, bookingBody(v, w.point(), far, 20, 80)), 400);

        // target not above start (both pass bean validation, the service rejects it)
        JsonNode same = expect(post("/api/bookings", token, bookingBody(v, w.point(), tenAm, 50, 50)), 400);
        assertTrue(same.get("message").asText().contains("Target charge must be higher"), "message: " + same.get("message"));

        // neither point nor station
        Map<String, Object> noTarget = bookingBody(v, w.point(), tenAm, 20, 80);
        noTarget.remove("chargingPointId");
        JsonNode missing = expect(post("/api/bookings", token, noTarget), 400);
        assertTrue(missing.get("message").asText().contains("chargingPointId or stationId"), "message: " + missing.get("message"));

        // nothing was reserved by all those failures
        assertEquals(0L, countBookingsOf(u), "no booking may exist for the user");
    }

    private long countBookingsOf(User u) {
        Long n = jdbc.queryForObject("select count(*) from bookings where user_id = ?", Long.class, u.getId());
        return n == null ? 0L : n;
    }

    @Test
    void bookingAccessRules() throws Exception {
        World w = newWorld("18.00");
        User owner = createUser(Role.USER, "0.00");
        User other = createUser(Role.USER, "0.00");
        Vehicle ownersVehicle = createVehicle(owner, w.model());
        String otherToken = login(other);
        LocalDateTime tenAm = tomorrow().atTime(10, 0);

        // no token
        post("/api/bookings", null, bookingBody(ownersVehicle, w.point(), tenAm, 20, 80)).andExpect(status().isUnauthorized());
        // somebody else's vehicle
        expect(post("/api/bookings", otherToken, bookingBody(ownersVehicle, w.point(), tenAm, 20, 80)), 403);
        // unknown vehicle
        Map<String, Object> ghostBody = bookingBody(ownersVehicle, w.point(), tenAm, 20, 80);
        ghostBody.put("vehicleId", 987654321L);
        expect(post("/api/bookings", otherToken, ghostBody), 404);
    }
}
