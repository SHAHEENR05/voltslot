package com.chargeiq.exception;

/**
 * 409 - the requested charging slot is already taken. The booking service attaches suggested alternatives
 * (same-station free slots and other recommended stations) so the UI can offer a one-click recovery.
 */
public class SlotUnavailableException extends RuntimeException {
    private transient Object alternatives;

    public SlotUnavailableException(String message) { super(message); }

    public SlotUnavailableException(String message, Object alternatives) {
        super(message);
        this.alternatives = alternatives;
    }

    public Object getAlternatives() { return alternatives; }

    public SlotUnavailableException withAlternatives(Object alt) {
        return new SlotUnavailableException(getMessage(), alt);
    }
}
