package com.chargeiq.entity;

import jakarta.persistence.*;
import com.chargeiq.entity.enums.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

/** Predicted next charging time of a vehicle (median charging interval of its history). */
@Entity
@Table(name = "recharge_predictions")
public class RechargePrediction {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @OneToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "vehicle_id", nullable = false, unique = true) private Vehicle vehicle;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "user_id", nullable = false) private User user;
    @Column(nullable = false) private LocalDateTime lastChargeAt;
    @Column(nullable = false) private Double medianIntervalDays;
    @Column(nullable = false) private Double avgEnergyKwh;
    @Column(nullable = false) private Integer preferredHour;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "preferred_station_id") private Station preferredStation;
    @Column(nullable = false) private Integer sessionsUsed;
    @Column(nullable = false) private Double confidence;
    @Column(nullable = false) private LocalDateTime nextDueAt;
    @Column(nullable = false) private LocalDateTime updatedAt;

    // ---- accessors ----
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Vehicle getVehicle() { return vehicle; }
    public void setVehicle(Vehicle vehicle) { this.vehicle = vehicle; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public LocalDateTime getLastChargeAt() { return lastChargeAt; }
    public void setLastChargeAt(LocalDateTime lastChargeAt) { this.lastChargeAt = lastChargeAt; }
    public Double getMedianIntervalDays() { return medianIntervalDays; }
    public void setMedianIntervalDays(Double medianIntervalDays) { this.medianIntervalDays = medianIntervalDays; }
    public Double getAvgEnergyKwh() { return avgEnergyKwh; }
    public void setAvgEnergyKwh(Double avgEnergyKwh) { this.avgEnergyKwh = avgEnergyKwh; }
    public Integer getPreferredHour() { return preferredHour; }
    public void setPreferredHour(Integer preferredHour) { this.preferredHour = preferredHour; }
    public Station getPreferredStation() { return preferredStation; }
    public void setPreferredStation(Station preferredStation) { this.preferredStation = preferredStation; }
    public Integer getSessionsUsed() { return sessionsUsed; }
    public void setSessionsUsed(Integer sessionsUsed) { this.sessionsUsed = sessionsUsed; }
    public Double getConfidence() { return confidence; }
    public void setConfidence(Double confidence) { this.confidence = confidence; }
    public LocalDateTime getNextDueAt() { return nextDueAt; }
    public void setNextDueAt(LocalDateTime nextDueAt) { this.nextDueAt = nextDueAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
