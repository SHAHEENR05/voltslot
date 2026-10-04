package com.chargeiq.exception;

/** 402 - wallet balance too low to pay for the booking. */
public class InsufficientBalanceException extends RuntimeException {
    public InsufficientBalanceException(String message) { super(message); }
}
