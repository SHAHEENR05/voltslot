package com.chargeiq.entity;

import jakarta.persistence.*;
import com.chargeiq.entity.enums.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

/** One occupied 30-minute slot. UNIQUE(charging_point_id, slot_start) makes double booking impossible at DB level. */
@Entity
@Table(name = "booking_slots", uniqueConstraints = @UniqueConstraint(name = "uq_point_slot", columnNames = {"charging_point_id", "slot_start"}))
public class BookingSlot {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "charging_point_id", nullable = false) private ChargingPoint chargingPoint;
    @Column(name = "slot_start", nullable = false) private LocalDateTime slotStart;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "booking_id", nullable = false) private Booking booking;

    // ---- accessors ----
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public ChargingPoint getChargingPoint() { return chargingPoint; }
    public void setChargingPoint(ChargingPoint chargingPoint) { this.chargingPoint = chargingPoint; }
    public LocalDateTime getSlotStart() { return slotStart; }
    public void setSlotStart(LocalDateTime slotStart) { this.slotStart = slotStart; }
    public Booking getBooking() { return booking; }
    public void setBooking(Booking booking) { this.booking = booking; }
}
