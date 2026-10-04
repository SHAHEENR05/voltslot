package com.chargeiq.entity;

import jakarta.persistence.*;
import com.chargeiq.entity.enums.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

/** A charging-slot reservation. Occupies one or more 30-minute rows in booking_slots. */
@Entity
@Table(name = "bookings")
public class Booking {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(nullable = false, unique = true, length = 16) private String bookingCode;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "user_id", nullable = false) private User user;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "vehicle_id", nullable = false) private Vehicle vehicle;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "charging_point_id", nullable = false) private ChargingPoint chargingPoint;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "station_id", nullable = false) private Station station;
    @Column(nullable = false) private LocalDateTime startTime;
    @Column(nullable = false) private LocalDateTime endTime;
    @Column(nullable = false) private Integer slots;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private BookingStatus status;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private BookingSource source = BookingSource.WEB;
    @Column(nullable = false) private Integer socStart;
    @Column(nullable = false) private Integer socTarget;
    @Column(nullable = false) private Double estEnergyKwh;
    @Column(nullable = false) private BigDecimal estCost;
    @Column(nullable = false) private LocalDateTime createdAt;
    private LocalDateTime holdExpiresAt;
    private LocalDateTime checkedInAt;
    private LocalDateTime cancelledAt;
    @Column(length = 100) private String cancelReason;

    // ---- accessors ----
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getBookingCode() { return bookingCode; }
    public void setBookingCode(String bookingCode) { this.bookingCode = bookingCode; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public Vehicle getVehicle() { return vehicle; }
    public void setVehicle(Vehicle vehicle) { this.vehicle = vehicle; }
    public ChargingPoint getChargingPoint() { return chargingPoint; }
    public void setChargingPoint(ChargingPoint chargingPoint) { this.chargingPoint = chargingPoint; }
    public Station getStation() { return station; }
    public void setStation(Station station) { this.station = station; }
    public LocalDateTime getStartTime() { return startTime; }
    public void setStartTime(LocalDateTime startTime) { this.startTime = startTime; }
    public LocalDateTime getEndTime() { return endTime; }
    public void setEndTime(LocalDateTime endTime) { this.endTime = endTime; }
    public Integer getSlots() { return slots; }
    public void setSlots(Integer slots) { this.slots = slots; }
    public BookingStatus getStatus() { return status; }
    public void setStatus(BookingStatus status) { this.status = status; }
    public BookingSource getSource() { return source; }
    public void setSource(BookingSource source) { this.source = source; }
    public Integer getSocStart() { return socStart; }
    public void setSocStart(Integer socStart) { this.socStart = socStart; }
    public Integer getSocTarget() { return socTarget; }
    public void setSocTarget(Integer socTarget) { this.socTarget = socTarget; }
    public Double getEstEnergyKwh() { return estEnergyKwh; }
    public void setEstEnergyKwh(Double estEnergyKwh) { this.estEnergyKwh = estEnergyKwh; }
    public BigDecimal getEstCost() { return estCost; }
    public void setEstCost(BigDecimal estCost) { this.estCost = estCost; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getHoldExpiresAt() { return holdExpiresAt; }
    public void setHoldExpiresAt(LocalDateTime holdExpiresAt) { this.holdExpiresAt = holdExpiresAt; }
    public LocalDateTime getCheckedInAt() { return checkedInAt; }
    public void setCheckedInAt(LocalDateTime checkedInAt) { this.checkedInAt = checkedInAt; }
    public LocalDateTime getCancelledAt() { return cancelledAt; }
    public void setCancelledAt(LocalDateTime cancelledAt) { this.cancelledAt = cancelledAt; }
    public String getCancelReason() { return cancelReason; }
    public void setCancelReason(String cancelReason) { this.cancelReason = cancelReason; }
}
