package com.chargeiq.entity;

import jakarta.persistence.*;
import com.chargeiq.entity.enums.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

/** Time-of-day tariff multiplier (one row per hour). */
@Entity
@Table(name = "pricing_bands")
public class PricingBand {
    @Id private Integer hourOfDay;
    @Column(nullable = false, length = 10) private String bandName;
    @Column(nullable = false) private BigDecimal multiplier;

    // ---- accessors ----
    public Integer getHourOfDay() { return hourOfDay; }
    public void setHourOfDay(Integer hourOfDay) { this.hourOfDay = hourOfDay; }
    public String getBandName() { return bandName; }
    public void setBandName(String bandName) { this.bandName = bandName; }
    public BigDecimal getMultiplier() { return multiplier; }
    public void setMultiplier(BigDecimal multiplier) { this.multiplier = multiplier; }
}
