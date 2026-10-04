package com.chargeiq.entity;

import jakarta.persistence.*;
import com.chargeiq.entity.enums.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

/** A registered EV. Many vehicles belong to one user (One-to-Many) and each refers to one VehicleModel (Many-to-One). */
@Entity
@Table(name = "vehicles")
public class Vehicle {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "user_id", nullable = false) private User user;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "fleet_id") private Fleet fleet;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "model_id", nullable = false) private VehicleModel model;
    @Column(nullable = false, unique = true, length = 20) private String regNumber;
    @Column(length = 40) private String nickname;
    @Column(nullable = false) private Integer avgDailyKm = 40;
    @Column(nullable = false) private LocalDateTime createdAt;

    // ---- accessors ----
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public Fleet getFleet() { return fleet; }
    public void setFleet(Fleet fleet) { this.fleet = fleet; }
    public VehicleModel getModel() { return model; }
    public void setModel(VehicleModel model) { this.model = model; }
    public String getRegNumber() { return regNumber; }
    public void setRegNumber(String regNumber) { this.regNumber = regNumber; }
    public String getNickname() { return nickname; }
    public void setNickname(String nickname) { this.nickname = nickname; }
    public Integer getAvgDailyKm() { return avgDailyKm; }
    public void setAvgDailyKm(Integer avgDailyKm) { this.avgDailyKm = avgDailyKm; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
