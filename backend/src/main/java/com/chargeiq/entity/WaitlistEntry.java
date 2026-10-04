package com.chargeiq.entity;

import jakarta.persistence.*;
import com.chargeiq.entity.enums.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

/** A user waiting for a slot at a station; promoted automatically when a booking is cancelled. */
@Entity
@Table(name = "waitlist_entries")
public class WaitlistEntry {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "user_id", nullable = false) private User user;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "vehicle_id", nullable = false) private Vehicle vehicle;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "station_id", nullable = false) private Station station;
    @Column(nullable = false) private LocalDateTime desiredStart;
    @Column(nullable = false) private Integer slots;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private WaitlistStatus status = WaitlistStatus.WAITING;
    private Long promotedBookingId;
    @Column(nullable = false) private LocalDateTime createdAt;

    // ---- accessors ----
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public Vehicle getVehicle() { return vehicle; }
    public void setVehicle(Vehicle vehicle) { this.vehicle = vehicle; }
    public Station getStation() { return station; }
    public void setStation(Station station) { this.station = station; }
    public LocalDateTime getDesiredStart() { return desiredStart; }
    public void setDesiredStart(LocalDateTime desiredStart) { this.desiredStart = desiredStart; }
    public Integer getSlots() { return slots; }
    public void setSlots(Integer slots) { this.slots = slots; }
    public WaitlistStatus getStatus() { return status; }
    public void setStatus(WaitlistStatus status) { this.status = status; }
    public Long getPromotedBookingId() { return promotedBookingId; }
    public void setPromotedBookingId(Long promotedBookingId) { this.promotedBookingId = promotedBookingId; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
