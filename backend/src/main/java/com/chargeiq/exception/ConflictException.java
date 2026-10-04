package com.chargeiq.exception;

/** 409 - the request conflicts with the current state (e.g. cancelling a completed booking). */
public class ConflictException extends RuntimeException {
    public ConflictException(String message) { super(message); }
}
