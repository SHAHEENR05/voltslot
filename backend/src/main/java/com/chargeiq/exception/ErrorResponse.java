package com.chargeiq.exception;

import java.util.List;

/** Uniform JSON error body returned by every failing endpoint. */
public record ErrorResponse(String timestamp, int status, String error, String message, String path,
                            List<FieldError> fieldErrors, Object alternatives) {

    public record FieldError(String field, String message) { }
}
