package com.chargeiq.entity;

import jakarta.persistence.*;
import com.chargeiq.entity.enums.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

/** One-to-One with Booking: what was really delivered. */
@Entity
@Table(name = "charging_sessions")
public class ChargingSession {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @OneToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "booking_id", nullable = false, unique = true) private Booking booking;
    @Column(nullable = false) private LocalDateTime startedAt;
    @Column(nullable = false) private LocalDateTime endedAt;
    @Column(nullable = false) private Double energyKwh;
    @Column(nullable = false) private Integer socStart;
    @Column(nullable = false) private Integer socEnd;
    @Column(nullable = false) private Double avgKw;
    @Column(nullable = false) private BigDecimal tariff;
    @Column(nullable = false) private BigDecimal amount;
    @Column(name = "co2_avoided_kg", nullable = false) private Double co2AvoidedKg;

    // ---- accessors ----
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Booking getBooking() { return booking; }
    public void setBooking(Booking booking) { this.booking = booking; }
    public LocalDateTime getStartedAt() { return startedAt; }
    public void setStartedAt(LocalDateTime startedAt) { this.startedAt = startedAt; }
    public LocalDateTime getEndedAt() { return endedAt; }
    public void setEndedAt(LocalDateTime endedAt) { this.endedAt = endedAt; }
    public Double getEnergyKwh() { return energyKwh; }
    public void setEnergyKwh(Double energyKwh) { this.energyKwh = energyKwh; }
    public Integer getSocStart() { return socStart; }
    public void setSocStart(Integer socStart) { this.socStart = socStart; }
    public Integer getSocEnd() { return socEnd; }
    public void setSocEnd(Integer socEnd) { this.socEnd = socEnd; }
    public Double getAvgKw() { return avgKw; }
    public void setAvgKw(Double avgKw) { this.avgKw = avgKw; }
    public BigDecimal getTariff() { return tariff; }
    public void setTariff(BigDecimal tariff) { this.tariff = tariff; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public Double getCo2AvoidedKg() { return co2AvoidedKg; }
    public void setCo2AvoidedKg(Double co2AvoidedKg) { this.co2AvoidedKg = co2AvoidedKg; }
}
