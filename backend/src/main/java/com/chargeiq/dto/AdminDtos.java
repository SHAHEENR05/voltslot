package com.chargeiq.dto;

import java.time.LocalDateTime;
import java.util.Map;

import com.chargeiq.entity.enums.Role;
import com.chargeiq.entity.enums.UserStatus;

import jakarta.validation.constraints.NotNull;

/** Administrator console + demo clock payloads. */
public final class AdminDtos {
    private AdminDtos() { }

    public record AdminUserDto(Long id, String fullName, String email, Role role, UserStatus status, String city,
                               Long operatorId, String operatorName, int noShowCount, LocalDateTime createdAt,
                               LocalDateTime lastLoginAt) { }

    public record RoleRequest(@NotNull Role role, Long operatorId, Long fleetId) { }

    public record StatusRequest(@NotNull UserStatus status) { }

    public record AdminStatsDto(Map<String, Long> counts, long bookingsToday, long bookingsLive, LocalDateTime now,
                                String clockMode) { }

    public record WarehouseRefreshDto(Map<String, Long> rows, long millis) { }

    public record ClockDto(LocalDateTime now, String mode, LocalDateTime anchor, long offsetSeconds) { }

    public record AdvanceClockRequest(Integer days, Integer hours, Integer minutes) { }
}
