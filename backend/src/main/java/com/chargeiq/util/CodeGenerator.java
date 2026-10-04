package com.chargeiq.util;

import java.security.SecureRandom;

/** Generates short human-friendly booking codes such as VSL-7K3M9X. */
public final class CodeGenerator {
    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
    private static final SecureRandom RANDOM = new SecureRandom();

    private CodeGenerator() { }

    public static String bookingCode() {
        StringBuilder sb = new StringBuilder("VSL-");
        for (int i = 0; i < 6; i++) {
            sb.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
        }
        return sb.toString();
    }
}
