package com.chargeiq.entity;

import jakarta.persistence.*;
import com.chargeiq.entity.enums.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

/** Physical plug standard (CCS2, Type 2, CHAdeMO, LECCS, Bharat DC-001). */
@Entity
@Table(name = "connector_types")
public class ConnectorType {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(nullable = false, unique = true, length = 20) private String code;
    @Column(nullable = false, length = 60) private String displayName;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 2) private CurrentType currentType;
    @Column(nullable = false) private Double typicalKw;

    // ---- accessors ----
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }
    public CurrentType getCurrentType() { return currentType; }
    public void setCurrentType(CurrentType currentType) { this.currentType = currentType; }
    public Double getTypicalKw() { return typicalKw; }
    public void setTypicalKw(Double typicalKw) { this.typicalKw = typicalKw; }
}
