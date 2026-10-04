package com.chargeiq.exception;

/** 403 - authenticated, but not allowed to touch this resource. */
public class ForbiddenException extends RuntimeException {
    public ForbiddenException(String message) { super(message); }
}
