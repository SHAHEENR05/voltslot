package com.chargeiq.service;

import java.math.BigDecimal;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.chargeiq.clock.AppClock;
import com.chargeiq.dto.AuthDtos.AuthResponse;
import com.chargeiq.dto.AuthDtos.ChangePasswordRequest;
import com.chargeiq.dto.AuthDtos.LoginRequest;
import com.chargeiq.dto.AuthDtos.RegisterRequest;
import com.chargeiq.dto.AuthDtos.UpdateProfileRequest;
import com.chargeiq.dto.AuthDtos.UserDto;
import com.chargeiq.entity.User;
import com.chargeiq.entity.Wallet;
import com.chargeiq.entity.enums.Role;
import com.chargeiq.entity.enums.UserStatus;
import com.chargeiq.exception.BadRequestException;
import com.chargeiq.exception.ConflictException;
import com.chargeiq.exception.ForbiddenException;
import com.chargeiq.exception.ResourceNotFoundException;
import com.chargeiq.exception.UnauthorizedException;
import com.chargeiq.repository.UserRepository;
import com.chargeiq.repository.WalletRepository;
import com.chargeiq.security.AuthUser;
import com.chargeiq.security.JwtService;

/**
 * Registration, login and profile management.
 * Passwords are stored as BCrypt hashes (salted, slow by design) and compared with {@link PasswordEncoder#matches}.
 * Login does not use the AuthenticationManager: we verify the hash directly, then issue a stateless JWT.
 */
@Service
@Transactional
public class AuthService {
    private final UserRepository users;
    private final WalletRepository wallets;
    private final WalletService walletService;
    private final PasswordEncoder encoder;
    private final JwtService jwt;
    private final AppClock clock;

    public AuthService(UserRepository users, WalletRepository wallets, WalletService walletService,
                       PasswordEncoder encoder, JwtService jwt, AppClock clock) {
        this.users = users;
        this.wallets = wallets;
        this.walletService = walletService;
        this.encoder = encoder;
        this.jwt = jwt;
        this.clock = clock;
    }

    /** Creates a USER account (self-registration can never create ADMIN/OPERATOR) plus its empty wallet. */
    public UserDto register(RegisterRequest r) {
        String email = r.email().trim().toLowerCase();
        if (users.existsByEmailIgnoreCase(email)) {
            throw new ConflictException("An account with this email already exists");
        }
        User u = new User();
        u.setFullName(r.fullName().trim());
        u.setEmail(email);
        u.setPasswordHash(encoder.encode(r.password()));
        u.setPhone(blankToNull(r.phone()));
        u.setCity(blankToNull(r.city()));
        u.setRole(Role.USER);
        u.setStatus(UserStatus.ACTIVE);
        u.setReminderEnabled(true);
        u.setReminderLeadHours(24);
        u.setNoShowCount(0);
        u.setCreatedAt(clock.now());
        User saved = users.save(u);
        walletService.ensureWallet(saved); // One-to-One: every user owns exactly one wallet
        return toDto(saved);
    }

    /** 401 for unknown e-mail or wrong password (same message, so nobody can probe which e-mails exist). 403 when blocked. */
    public AuthResponse login(LoginRequest r) {
        User u = users.findByEmailIgnoreCase(r.email().trim()).orElse(null);
        if (u == null || !encoder.matches(r.password(), u.getPasswordHash())) {
            throw new UnauthorizedException("Invalid email or password");
        }
        if (u.getStatus() == UserStatus.BLOCKED) {
            throw new ForbiddenException("Your account has been blocked. Please contact support.");
        }
        u.setLastLoginAt(clock.now());
        users.save(u);
        String token = jwt.generateToken(AuthUser.from(u));
        return new AuthResponse(token, "Bearer", jwt.expiryTime(), toDto(u));
    }

    @Transactional(readOnly = true)
    public UserDto me(AuthUser actor) {
        return toDto(load(actor.getId()));
    }

    public UserDto updateProfile(AuthUser actor, UpdateProfileRequest r) {
        User u = load(actor.getId());
        u.setFullName(r.fullName().trim());
        u.setPhone(blankToNull(r.phone()));
        u.setCity(blankToNull(r.city()));
        u.setHomeLat(r.homeLat());
        u.setHomeLon(r.homeLon());
        if (r.reminderEnabled() != null) {
            u.setReminderEnabled(r.reminderEnabled());
        }
        if (r.reminderLeadHours() != null) {
            u.setReminderLeadHours(r.reminderLeadHours());
        }
        return toDto(users.save(u));
    }

    public void changePassword(AuthUser actor, ChangePasswordRequest r) {
        User u = load(actor.getId());
        if (!encoder.matches(r.currentPassword(), u.getPasswordHash())) {
            throw new BadRequestException("Current password is incorrect");
        }
        if (encoder.matches(r.newPassword(), u.getPasswordHash())) {
            throw new BadRequestException("New password must be different from the current password");
        }
        u.setPasswordHash(encoder.encode(r.newPassword()));
        users.save(u);
    }

    /** Entity -> DTO (includes the wallet balance, never the password hash). */
    @Transactional(readOnly = true)
    public UserDto toDto(User u) {
        BigDecimal balance = wallets.findByUserId(u.getId()).map(Wallet::getBalance).orElse(BigDecimal.ZERO);
        return new UserDto(
                u.getId(), u.getFullName(), u.getEmail(), u.getPhone(), u.getRole(), u.getCity(),
                u.getOperator() == null ? null : u.getOperator().getId(),
                u.getOperator() == null ? null : u.getOperator().getName(),
                u.getFleet() == null ? null : u.getFleet().getId(),
                u.getFleet() == null ? null : u.getFleet().getName(),
                !Boolean.FALSE.equals(u.getReminderEnabled()),
                u.getReminderLeadHours() == null ? 24 : u.getReminderLeadHours(),
                u.getNoShowCount() == null ? 0 : u.getNoShowCount(),
                balance, u.getHomeLat(), u.getHomeLon());
    }

    private User load(Long id) {
        return users.findById(id).orElseThrow(() -> new ResourceNotFoundException("User", id));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
