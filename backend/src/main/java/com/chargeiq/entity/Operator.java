package com.chargeiq.entity;

import jakarta.persistence.*;
import com.chargeiq.entity.enums.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

/** A company that owns charging stations (e.g. VoltGrid). One operator -> many stations. */
@Entity
@Table(name = "operators")
public class Operator {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(nullable = false, unique = true, length = 80) private String name;
    @Column(nullable = false, length = 9) private String brandColor = "#22d3ee";
    @Column(nullable = false, length = 120) private String contactEmail;
    @Column(nullable = false) private LocalDateTime createdAt;

    // ---- accessors ----
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getBrandColor() { return brandColor; }
    public void setBrandColor(String brandColor) { this.brandColor = brandColor; }
    public String getContactEmail() { return contactEmail; }
    public void setContactEmail(String contactEmail) { this.contactEmail = contactEmail; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
