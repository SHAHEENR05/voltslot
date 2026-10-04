package com.chargeiq.exception;

import java.time.Instant;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import jakarta.validation.ConstraintViolationException;

/**
 * One place that converts every exception into a clean JSON error response with the right HTTP status.
 * Extending ResponseEntityExceptionHandler gives sensible answers to the standard Spring MVC errors (404, 405, 415 ...).
 */
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    private static String path(WebRequest request) {
        return request instanceof ServletWebRequest swr ? swr.getRequest().getRequestURI() : "";
    }

    private static ResponseEntity<Object> build(HttpStatus status, String message, WebRequest request,
                                                List<ErrorResponse.FieldError> fields, Object alternatives) {
        ErrorResponse body = new ErrorResponse(Instant.now().toString(), status.value(), status.getReasonPhrase(),
                message, path(request), fields, alternatives);
        return ResponseEntity.status(status).body(body);
    }

    // ---------- standard Spring MVC exceptions ----------
    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex, HttpHeaders headers,
                                                                  HttpStatusCode status, WebRequest request) {
        List<ErrorResponse.FieldError> fields = ex.getBindingResult().getFieldErrors().stream()
                .map(f -> new ErrorResponse.FieldError(f.getField(), f.getDefaultMessage()))
                .toList();
        String message = fields.isEmpty() ? "Validation failed"
                : "Validation failed: " + fields.get(0).field() + " - " + fields.get(0).message();
        return build(HttpStatus.BAD_REQUEST, message, request, fields, null);
    }

    @Override
    protected ResponseEntity<Object> handleHttpMessageNotReadable(HttpMessageNotReadableException ex, HttpHeaders headers,
                                                                  HttpStatusCode status, WebRequest request) {
        return build(HttpStatus.BAD_REQUEST, "Malformed JSON request or invalid value in the request body", request, null, null);
    }

    @Override
    protected ResponseEntity<Object> handleExceptionInternal(Exception ex, Object body, HttpHeaders headers,
                                                             HttpStatusCode statusCode, WebRequest request) {
        HttpStatus status = HttpStatus.resolve(statusCode.value());
        if (status == null) {
            status = HttpStatus.INTERNAL_SERVER_ERROR;
        }
        String message = status.is4xxClientError() ? friendly(status) : "Unexpected server error";
        return build(status, message, request, null, null);
    }

    private static String friendly(HttpStatus status) {
        return switch (status) {
            case NOT_FOUND -> "Resource not found";
            case METHOD_NOT_ALLOWED -> "HTTP method not allowed for this URL";
            case UNSUPPORTED_MEDIA_TYPE -> "Unsupported content type - send application/json";
            case BAD_REQUEST -> "Bad request";
            default -> status.getReasonPhrase();
        };
    }

    // ---------- our own exceptions ----------
    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<Object> notFound(ResourceNotFoundException ex, WebRequest req) {
        return build(HttpStatus.NOT_FOUND, ex.getMessage(), req, null, null);
    }

    @ExceptionHandler(BadRequestException.class)
    public ResponseEntity<Object> badRequest(BadRequestException ex, WebRequest req) {
        return build(HttpStatus.BAD_REQUEST, ex.getMessage(), req, null, null);
    }

    @ExceptionHandler(SlotUnavailableException.class)
    public ResponseEntity<Object> slotUnavailable(SlotUnavailableException ex, WebRequest req) {
        return build(HttpStatus.CONFLICT, ex.getMessage(), req, null, ex.getAlternatives());
    }

    @ExceptionHandler(ConflictException.class)
    public ResponseEntity<Object> conflict(ConflictException ex, WebRequest req) {
        return build(HttpStatus.CONFLICT, ex.getMessage(), req, null, null);
    }

    @ExceptionHandler(InsufficientBalanceException.class)
    public ResponseEntity<Object> payment(InsufficientBalanceException ex, WebRequest req) {
        return build(HttpStatus.PAYMENT_REQUIRED, ex.getMessage(), req, null, null);
    }

    @ExceptionHandler({ForbiddenException.class, AccessDeniedException.class})
    public ResponseEntity<Object> forbidden(RuntimeException ex, WebRequest req) {
        String msg = ex instanceof ForbiddenException ? ex.getMessage() : "You do not have permission to access this resource";
        return build(HttpStatus.FORBIDDEN, msg, req, null, null);
    }

    @ExceptionHandler(UnauthorizedException.class)
    public ResponseEntity<Object> unauthorized(UnauthorizedException ex, WebRequest req) {
        return build(HttpStatus.UNAUTHORIZED, ex.getMessage(), req, null, null);
    }

    // ---------- validation / data errors raised outside @RequestBody ----------
    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<Object> constraint(ConstraintViolationException ex, WebRequest req) {
        List<ErrorResponse.FieldError> fields = ex.getConstraintViolations().stream()
                .map(v -> new ErrorResponse.FieldError(v.getPropertyPath().toString(), v.getMessage()))
                .toList();
        return build(HttpStatus.BAD_REQUEST, "Validation failed", req, fields, null);
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Object> typeMismatch(MethodArgumentTypeMismatchException ex, WebRequest req) {
        return build(HttpStatus.BAD_REQUEST, "Invalid value for parameter '" + ex.getName() + "'", req, null, null);
    }

    /** MySQL lock-wait timeout / deadlock victim (e.g. many users hitting the same charging point at once). */
    @ExceptionHandler(PessimisticLockingFailureException.class)
    public ResponseEntity<Object> lockFailure(PessimisticLockingFailureException ex, WebRequest req) {
        log.warn("Lock wait timeout / deadlock: {}", ex.getMessage());
        return build(HttpStatus.CONFLICT, "The slot is being booked by someone else right now - please try again", req, null, null);
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Object> integrity(DataIntegrityViolationException ex, WebRequest req) {
        log.warn("Data integrity violation: {}", ex.getMostSpecificCause().getMessage());
        return build(HttpStatus.CONFLICT, "The request conflicts with existing data (duplicate or still referenced)", req, null, null);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Object> unexpected(Exception ex, WebRequest req) {
        log.error("Unhandled exception", ex);
        return build(HttpStatus.INTERNAL_SERVER_ERROR, "Unexpected server error - please try again", req, null, null);
    }
}
