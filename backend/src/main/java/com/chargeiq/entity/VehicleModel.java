package com.chargeiq.entity;

import jakarta.persistence.*;
import com.chargeiq.entity.enums.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

/** Catalogue entry (make/model) with battery and charging capability. Many-to-Many with ConnectorType. */
@Entity
@Table(name = "vehicle_models")
public class VehicleModel {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(nullable = false, length = 40) private String make;
    @Column(nullable = false, length = 60) private String model;
    @Column(length = 40) private String variant;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private VehicleCategory category;
    @Column(nullable = false) private Double batteryKwh;
    @Column(nullable = false) private Double acMaxKw;
    @Column(nullable = false) private Double dcMaxKw = 0.0;
    @Column(nullable = false) private Integer rangeKm;
    @Column(nullable = false) private Double kmPerKwh;

    @ManyToMany(fetch = FetchType.EAGER)
    @JoinTable(name = "vehicle_model_connectors",
            joinColumns = @JoinColumn(name = "vehicle_model_id"),
            inverseJoinColumns = @JoinColumn(name = "connector_type_id"))
    private Set<ConnectorType> connectors = new HashSet<>();

    // ---- accessors ----
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getMake() { return make; }
    public void setMake(String make) { this.make = make; }
    public String getModel() { return model; }
    public void setModel(String model) { this.model = model; }
    public String getVariant() { return variant; }
    public void setVariant(String variant) { this.variant = variant; }
    public VehicleCategory getCategory() { return category; }
    public void setCategory(VehicleCategory category) { this.category = category; }
    public Double getBatteryKwh() { return batteryKwh; }
    public void setBatteryKwh(Double batteryKwh) { this.batteryKwh = batteryKwh; }
    public Double getAcMaxKw() { return acMaxKw; }
    public void setAcMaxKw(Double acMaxKw) { this.acMaxKw = acMaxKw; }
    public Double getDcMaxKw() { return dcMaxKw; }
    public void setDcMaxKw(Double dcMaxKw) { this.dcMaxKw = dcMaxKw; }
    public Integer getRangeKm() { return rangeKm; }
    public void setRangeKm(Integer rangeKm) { this.rangeKm = rangeKm; }
    public Double getKmPerKwh() { return kmPerKwh; }
    public void setKmPerKwh(Double kmPerKwh) { this.kmPerKwh = kmPerKwh; }
    public Set<ConnectorType> getConnectors() { return connectors; }
    public void setConnectors(Set<ConnectorType> connectors) { this.connectors = connectors; }
}
