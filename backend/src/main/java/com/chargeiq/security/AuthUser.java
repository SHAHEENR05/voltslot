package com.chargeiq.security;

import java.util.Collection;
import java.util.List;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import com.chargeiq.entity.User;
import com.chargeiq.entity.enums.Role;
import com.chargeiq.entity.enums.UserStatus;

/**
 * The authenticated principal. It carries only plain values (ids, role) - never JPA entities - so it is safe
 * to use outside a transaction; services re-load the {@link User} entity by id when they need it.
 */
public class AuthUser implements UserDetails {
    private final Long id;
    private final String email;
    private final String fullName;
    private final String passwordHash;
    private final Role role;
    private final UserStatus status;
    private final Long operatorId;
    private final Long fleetId;

    public AuthUser(Long id, String email, String fullName, String passwordHash, Role role, UserStatus status,
                    Long operatorId, Long fleetId) {
        this.id = id;
        this.email = email;
        this.fullName = fullName;
        this.passwordHash = passwordHash;
        this.role = role;
        this.status = status;
        this.operatorId = operatorId;
        this.fleetId = fleetId;
    }

    public static AuthUser from(User u) {
        return new AuthUser(u.getId(), u.getEmail(), u.getFullName(), u.getPasswordHash(), u.getRole(), u.getStatus(),
                u.getOperator() == null ? null : u.getOperator().getId(),
                u.getFleet() == null ? null : u.getFleet().getId());
    }

    public Long getId() { return id; }

    public String getFullName() { return fullName; }

    public Role getRole() { return role; }

    public Long getOperatorId() { return operatorId; }

    public Long getFleetId() { return fleetId; }

    public boolean isAdmin() { return role == Role.ADMIN; }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_" + role.name()));
    }

    @Override
    public String getPassword() { return passwordHash; }

    @Override
    public String getUsername() { return email; }

    public String getEmail() { return email; }

    @Override
    public boolean isEnabled() { return status == UserStatus.ACTIVE; }
}
