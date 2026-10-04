package com.chargeiq.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.LocalDateTime;

import org.junit.jupiter.api.Test;

import com.chargeiq.clock.AppClock;
import com.chargeiq.entity.enums.Role;
import com.chargeiq.entity.enums.UserStatus;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;

/** Unit tests for token creation and validation (HS256). */
class JwtServiceTest {
    private static final String SECRET = "unit-test-secret";

    private static AuthUser user() {
        return new AuthUser(7L, "demo@voltslot.in", "Aarav Mehta", "hash", Role.USER, UserStatus.ACTIVE, null, null);
    }

    @Test
    void tokenRoundTripKeepsClaims() {
        JwtService jwt = new JwtService(SECRET, 12);
        String token = jwt.generateToken(user());
        assertNotNull(token);
        Claims c = jwt.parse(token);
        assertEquals("demo@voltslot.in", c.getSubject());
        assertEquals(7L, ((Number) c.get("uid")).longValue());
        assertEquals("USER", c.get("role", String.class));
        assertTrue(c.getExpiration().after(c.getIssuedAt()));
    }

    @Test
    void tokenSignedWithAnotherSecretIsRejected() {
        String token = new JwtService("another-secret", 12).generateToken(user());
        JwtService jwt = new JwtService(SECRET, 12);
        assertThrows(JwtException.class, () -> jwt.parse(token));
    }

    @Test
    void tamperedPayloadIsRejected() {
        JwtService jwt = new JwtService(SECRET, 12);
        String[] parts = jwt.generateToken(user()).split("\\.");
        // flip a character in the middle of the payload
        char[] payload = parts[1].toCharArray();
        int i = payload.length / 2;
        payload[i] = payload[i] == 'A' ? 'B' : 'A';
        String tampered = parts[0] + "." + new String(payload) + "." + parts[2];
        assertThrows(JwtException.class, () -> jwt.parse(tampered));
    }

    @Test
    void expiredTokenIsRejected() {
        JwtService expired = new JwtService(SECRET, -1); // expiry one hour in the past
        String token = expired.generateToken(user());
        assertThrows(JwtException.class, () -> expired.parse(token));
    }

    @Test
    void garbageIsRejected() {
        JwtService jwt = new JwtService(SECRET, 12);
        assertThrows(JwtException.class, () -> jwt.parse("not.a.jwt"));
    }

    @Test
    void expiryTimeIsAboutConfiguredHoursAhead() {
        JwtService jwt = new JwtService(SECRET, 12);
        LocalDateTime expected = LocalDateTime.now(AppClock.ZONE).plusHours(12);
        long diffMinutes = Math.abs(java.time.Duration.between(expected, jwt.expiryTime()).toMinutes());
        assertTrue(diffMinutes <= 1);
    }
}
