package com.chargeiq.controller;

import java.net.URI;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.chargeiq.dto.AuthDtos.AuthResponse;
import com.chargeiq.dto.AuthDtos.ChangePasswordRequest;
import com.chargeiq.dto.AuthDtos.LoginRequest;
import com.chargeiq.dto.AuthDtos.RegisterRequest;
import com.chargeiq.dto.AuthDtos.UpdateProfileRequest;
import com.chargeiq.dto.AuthDtos.UserDto;
import com.chargeiq.dto.CommonDtos.MessageResponse;
import com.chargeiq.security.AuthUser;
import com.chargeiq.service.AuthService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

/** Authentication and profile endpoints. Thin controller: validation here, all logic in {@link AuthService}. */
@RestController
@RequestMapping("/api")
@Tag(name = "Auth", description = "Register, login, profile and password")
public class AuthController {
    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/auth/register")
    @Operation(summary = "Register a new driver account (role USER, wallet created with balance 0)")
    public ResponseEntity<UserDto> register(@Valid @RequestBody RegisterRequest request) {
        UserDto created = authService.register(request);
        return ResponseEntity.created(URI.create("/api/auth/me")).body(created);
    }

    @PostMapping("/auth/login")
    @Operation(summary = "Login with e-mail and password and receive a JWT")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok(authService.login(request));
    }

    @GetMapping("/auth/me")
    @Operation(summary = "Profile of the logged-in user")
    public ResponseEntity<UserDto> me(@AuthenticationPrincipal AuthUser actor) {
        return ResponseEntity.ok(authService.me(actor));
    }

    @PostMapping("/auth/change-password")
    @Operation(summary = "Change the password of the logged-in user")
    public ResponseEntity<MessageResponse> changePassword(@AuthenticationPrincipal AuthUser actor,
                                                          @Valid @RequestBody ChangePasswordRequest request) {
        authService.changePassword(actor, request);
        return ResponseEntity.ok(new MessageResponse("Password changed"));
    }

    @PutMapping("/users/me")
    @Operation(summary = "Update profile, home location and reminder preferences")
    public ResponseEntity<UserDto> updateProfile(@AuthenticationPrincipal AuthUser actor,
                                                 @Valid @RequestBody UpdateProfileRequest request) {
        return ResponseEntity.ok(authService.updateProfile(actor, request));
    }
}
