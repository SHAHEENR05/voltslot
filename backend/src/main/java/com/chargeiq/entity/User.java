package com.chargeiq.entity;

import jakarta.persistence.*;
import com.chargeiq.entity.enums.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

/** Application user (EV owner, fleet manager, station operator or administrator). */
@Entity
@Table(name = "users")
public class User {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(nullable = false, length = 100) private String fullName;
    @Column(nullable = false, unique = true, length = 120) private String email;
    @Column(nullable = false, length = 100) private String passwordHash;
    @Column(length = 20) private String phone;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private Role role;
    @Column(length = 40) private String city;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private UserStatus status = UserStatus.ACTIVE;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "operator_id") private Operator operator;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "fleet_id") private Fleet fleet;
    private Double homeLat;
    private Double homeLon;
    @Column(nullable = false) private Boolean reminderEnabled = true;
    @Column(nullable = false) private Integer reminderLeadHours = 24;
    @Column(nullable = false) private Integer noShowCount = 0;
    @Column(nullable = false) private LocalDateTime createdAt;
    private LocalDateTime lastLoginAt;

    // ---- accessors ----
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public Role getRole() { return role; }
    public void setRole(Role role) { this.role = role; }
    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }
    public UserStatus getStatus() { return status; }
    public void setStatus(UserStatus status) { this.status = status; }
    public Operator getOperator() { return operator; }
    public void setOperator(Operator operator) { this.operator = operator; }
    public Fleet getFleet() { return fleet; }
    public void setFleet(Fleet fleet) { this.fleet = fleet; }
    public Double getHomeLat() { return homeLat; }
    public void setHomeLat(Double homeLat) { this.homeLat = homeLat; }
    public Double getHomeLon() { return homeLon; }
    public void setHomeLon(Double homeLon) { this.homeLon = homeLon; }
    public Boolean getReminderEnabled() { return reminderEnabled; }
    public void setReminderEnabled(Boolean reminderEnabled) { this.reminderEnabled = reminderEnabled; }
    public Integer getReminderLeadHours() { return reminderLeadHours; }
    public void setReminderLeadHours(Integer reminderLeadHours) { this.reminderLeadHours = reminderLeadHours; }
    public Integer getNoShowCount() { return noShowCount; }
    public void setNoShowCount(Integer noShowCount) { this.noShowCount = noShowCount; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getLastLoginAt() { return lastLoginAt; }
    public void setLastLoginAt(LocalDateTime lastLoginAt) { this.lastLoginAt = lastLoginAt; }
}
