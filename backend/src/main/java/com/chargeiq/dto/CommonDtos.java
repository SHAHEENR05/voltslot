package com.chargeiq.dto;

import java.util.List;

import org.springframework.data.domain.Page;

/** Shared response wrappers. */
public final class CommonDtos {
    private CommonDtos() { }

    /** Uniform pagination envelope used by every list endpoint. */
    public record PageResponse<T>(List<T> content, int page, int size, long totalElements, int totalPages) {
        public static <T> PageResponse<T> of(Page<T> p) {
            return new PageResponse<>(p.getContent(), p.getNumber(), p.getSize(), p.getTotalElements(), p.getTotalPages());
        }

        /** Pages an in-memory list (used where the list is small and already filtered in Java). */
        public static <T> PageResponse<T> ofList(List<T> all, int page, int size) {
            int safeSize = Math.max(1, size);
            int from = Math.min(Math.max(0, page) * safeSize, all.size());
            int to = Math.min(from + safeSize, all.size());
            int totalPages = (int) Math.ceil(all.size() / (double) safeSize);
            return new PageResponse<>(all.subList(from, to), Math.max(0, page), safeSize, all.size(), totalPages);
        }
    }

    public record MessageResponse(String message) { }
}
