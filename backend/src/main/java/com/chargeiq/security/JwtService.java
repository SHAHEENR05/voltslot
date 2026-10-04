package com.chargeiq.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Date;

import javax.crypto.SecretKey;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.chargeiq.clock.AppClock;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

/**
 * Creates and validates JSON Web Tokens (HS256).
 * NOTE: tokens use the REAL system clock on purpose. The demo "time machine" (AppClock) can sit months away from
 * the real date, which would otherwise make every token look expired.
 */
@Service
public class JwtService {
    private final SecretKey key;
    private final long expiryHours;

    public JwtService(@Value("${app.jwt.secret}") String secret,
                      @Value("${app.jwt.expiry-hours:12}") long expiryHours) {
        this.key = Keys.hmacShaKeyFor(sha256(secret));
        this.expiryHours = expiryHours;
    }

    public String generateToken(AuthUser user) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(user.getEmail())
                .claim("uid", user.getId())
                .claim("role", user.getRole().name())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(expiryHours, ChronoUnit.HOURS)))
                .signWith(key)
                .compact();
    }

    /** Throws a JwtException when the token is malformed, tampered with or expired. */
    public Claims parse(String token) {
        return Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
    }

    public LocalDateTime expiryTime() {
        return LocalDateTime.ofInstant(Instant.now().plus(expiryHours, ChronoUnit.HOURS), AppClock.ZONE);
    }

    private static byte[] sha256(String s) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
