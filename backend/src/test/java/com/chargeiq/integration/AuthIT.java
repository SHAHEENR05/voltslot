package com.voltslot.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.chargeiq.entity.User;
import com.chargeiq.entity.enums.Role;
import com.chargeiq.entity.enums.UserStatus;
import com.fasterxml.jackson.databind.JsonNode;

/**
 * Integration tests for authentication and role based access (docs: spec 20_backend_spec.md, "Tests" section).
 *
 * <ul>
 *   <li>register: 201 + USER role + empty wallet, duplicate e-mail (any letter case) = 409;</li>
 *   <li>login: 200 + JWT, wrong password / unknown e-mail = 401 (same message), blocked account = 403;</li>
 *   <li>/api/auth/me: 401 without or with a garbage token, 200 with a valid token, 401 once the user got blocked;</li>
 *   <li>roles: USER gets 403 on /api/admin, /api/analytics, /api/operator, /api/fleet; anonymous gets 401; ADMIN gets 200.</li>
 * </ul>
 * Every test registers / creates its own users with unique e-mail addresses, so tests can run in any order.
 */
class AuthIT extends IntegrationTestBase {

    private Map<String, Object> registerBody(String email) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("fullName", "Riya Sharma");
        body.put("email", email);
        body.put("password", PASSWORD);
        body.put("phone", "9876543210");
        body.put("city", "Mumbai");
        return body;
    }

    @Test
    void registerCreatesUserWithEmptyWallet() throws Exception {
        String email = "reg-" + uniq() + "@test.in";

        post("/api/auth/register", null, registerBody(email))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.email").value(email))
                .andExpect(jsonPath("$.role").value("USER"))
                .andExpect(jsonPath("$.passwordHash").doesNotExist());

        User saved = users.findByEmailIgnoreCase(email).orElseThrow();
        assertEquals(Role.USER, saved.getRole());
        assertEquals(UserStatus.ACTIVE, saved.getStatus());
        assertNotNull(saved.getPasswordHash());
        assertTrue(saved.getPasswordHash().startsWith("$2"), "password must be stored as a BCrypt hash");
        assertFalse(saved.getPasswordHash().contains(PASSWORD));
        assertMoney("0", wallets.findByUserId(saved.getId()).orElseThrow().getBalance(), "new wallet balance");
    }

    @Test
    void registerThenLoginReturnsTokenAndProfile() throws Exception {
        String email = "flow-" + uniq() + "@test.in";
        expect(post("/api/auth/register", null, registerBody(email)), 201);

        Map<String, Object> login = new LinkedHashMap<>();
        login.put("email", email.toUpperCase());     // e-mail is case-insensitive
        login.put("password", PASSWORD);
        JsonNode res = expect(post("/api/auth/login", null, login), 200);

        assertEquals("Bearer", res.get("tokenType").asText());
        assertFalse(res.get("token").asText().isBlank());
        assertEquals(email, res.get("user").get("email").asText());
        assertEquals("USER", res.get("user").get("role").asText());
    }

    @Test
    void duplicateRegistrationIsConflict() throws Exception {
        String email = "dup-" + uniq() + "@test.in";
        expect(post("/api/auth/register", null, registerBody(email)), 201);

        JsonNode err = expect(post("/api/auth/register", null, registerBody(email.toUpperCase())), 409);
        assertEquals(409, err.get("status").asInt());
        assertTrue(err.get("message").asText().toLowerCase().contains("already exists"));
    }

    @Test
    void wrongPasswordAndUnknownEmailAreUnauthorizedWithSameMessage() throws Exception {
        User u = createUser(Role.USER, "0.00");

        Map<String, Object> wrong = new LinkedHashMap<>();
        wrong.put("email", u.getEmail());
        wrong.put("password", "Wrong-Passw0rd");
        JsonNode e1 = expect(post("/api/auth/login", null, wrong), 401);

        Map<String, Object> unknown = new LinkedHashMap<>();
        unknown.put("email", "nobody-" + uniq() + "@test.in");
        unknown.put("password", PASSWORD);
        JsonNode e2 = expect(post("/api/auth/login", null, unknown), 401);

        assertEquals(e1.get("message").asText(), e2.get("message").asText(), "must not reveal which e-mails exist");
    }

    @Test
    void blockedUserCannotLoginAndExistingTokenStopsWorking() throws Exception {
        User u = createUser(Role.USER, "0.00");
        String token = login(u);
        expect(get("/api/auth/me", token), 200);

        u.setStatus(UserStatus.BLOCKED);
        users.save(u);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("email", u.getEmail());
        body.put("password", PASSWORD);
        expect(post("/api/auth/login", null, body), 403);
        // the JWT of a blocked user is ignored by the filter -> anonymous -> 401 on a protected URL
        expect(get("/api/auth/me", token), 401);
    }

    @Test
    void meNeedsAValidToken() throws Exception {
        get("/api/auth/me").andExpect(status().isUnauthorized());
        get("/api/auth/me", "this.is.not-a-jwt").andExpect(status().isUnauthorized());

        User u = createUser(Role.USER, "250.00");
        String token = login(u);
        JsonNode me = expect(get("/api/auth/me", token), 200);
        assertEquals(u.getEmail(), me.get("email").asText());
        assertEquals(u.getId().longValue(), me.get("id").asLong());
        assertMoney("250.00", money(me.get("walletBalance")), "walletBalance in /me");
    }

    @Test
    void plainUserIsForbiddenOnAdminAnalyticsOperatorAndFleetAreas() throws Exception {
        String token = login(createUser(Role.USER, "0.00"));

        get("/api/admin/users", token).andExpect(status().isForbidden());
        get("/api/admin/stats", token).andExpect(status().isForbidden());
        get("/api/analytics/anything", token).andExpect(status().isForbidden());
        get("/api/operator/anything", token).andExpect(status().isForbidden());
        get("/api/fleet/anything", token).andExpect(status().isForbidden());

        JsonNode err = expect(get("/api/admin/users", token), 403);
        assertEquals(403, err.get("status").asInt());
        assertTrue(err.has("message"));
    }

    @Test
    void anonymousIsUnauthorizedOnAdminArea() throws Exception {
        get("/api/admin/users").andExpect(status().isUnauthorized());
    }

    @Test
    void adminCanListUsers() throws Exception {
        User admin = createUser(Role.ADMIN, "0.00");
        User someone = createUser(Role.USER, "0.00");
        String token = login(admin);

        JsonNode page = expect(get("/api/admin/users?q=" + someone.getEmail() + "&size=5", token), 200);
        assertEquals(1, page.get("totalElements").asInt());
        JsonNode first = page.get("content").get(0);
        assertEquals(someone.getEmail(), first.get("email").asText());
        assertEquals("USER", first.get("role").asText());

        // other admin endpoints are open to the administrator too
        get("/api/admin/clock", token).andExpect(status().isOk());
    }
}
