package com.chargeiq.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import com.chargeiq.entity.enums.Role;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Request / response bodies for authentication and the user profile. */
public final class AuthDtos {
    private AuthDtos() { }

    public record RegisterRequest(
            @NotBlank(message = "Full name is required") @Size(max = 100) String fullName,
            @NotBlank(message = "Email is required") @Email(message = "Email is not valid") @Size(max = 120) String email,
            @NotBlank(message = "Password is required") @Size(min = 8, max = 64, message = "Password must be 8-64 characters")
            @Pattern(regexp = "^(?=.*[A-Za-z])(?=.*\\d).+$", message = "Password must contain a letter and a digit") String password,
            @Size(max = 20) String phone,
            @Size(max = 40) String city) { }

    public record LoginRequest(
            @NotBlank(message = "Email is required") @Email(message = "Email is not valid") String email,
            @NotBlank(message = "Password is required") String password) { }

    public record ChangePasswordRequest(
            @NotBlank String currentPassword,
            @NotBlank @Size(min = 8, max = 64, message = "Password must be 8-64 characters")
            @Pattern(regexp = "^(?=.*[A-Za-z])(?=.*\\d).+$", message = "Password must contain a letter and a digit") String newPassword) { }

    public record UpdateProfileRequest(
            @NotBlank @Size(max = 100) String fullName,
            @Size(max = 20) String phone,
            @Size(max = 40) String city,
            Double homeLat,
            Double homeLon,
            Boolean reminderEnabled,
            @Min(1) @Max(72) Integer reminderLeadHours) { }

    public record UserDto(Long id, String fullName, String email, String phone, Role role, String city,
                          Long operatorId, String operatorName, Long fleetId, String fleetName,
                          boolean reminderEnabled, int reminderLeadHours, int noShowCount,
                          BigDecimal walletBalance, Double homeLat, Double homeLon) { }

    public record AuthResponse(String token, String tokenType, LocalDateTime expiresAt, UserDto user) { }
}
