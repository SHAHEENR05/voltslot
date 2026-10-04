package com.chargeiq.exception;

/** 401 - bad credentials. */
public class UnauthorizedException extends RuntimeException {
    public UnauthorizedException(String message) { super(message); }
}
