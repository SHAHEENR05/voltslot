package com.chargeiq.exception;

/** 404 - the requested entity does not exist (or is not visible to the caller). */
public class ResourceNotFoundException extends RuntimeException {
    public ResourceNotFoundException(String message) { super(message); }

    public ResourceNotFoundException(String entity, Object id) { super(entity + " not found: " + id); }
}
