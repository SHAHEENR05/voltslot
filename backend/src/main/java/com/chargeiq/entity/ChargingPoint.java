package com.chargeiq.entity;

import jakarta.persistence.*;
import com.chargeiq.entity.enums.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

/** One physical charger (a single connector) at a station. */
@Entity
@Table(name = "charging_points")
public class ChargingPoint {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "station_id", nullable = false) private Station station;
    @Column(nullable = false, length = 20) private String label;
    @ManyToOne(fetch = FetchType.EAGER, optional = false) @JoinColumn(name = "connector_type_id", nullable = false) private ConnectorType connectorType;
    @Column(nullable = false) private Double powerKw;
    @Column(nullable = false) private BigDecimal tariffPerKwh;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private PointStatus status = PointStatus.ACTIVE;
    @Column(nullable = false) private LocalDateTime createdAt;

    // ---- accessors ----
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Station getStation() { return station; }
    public void setStation(Station station) { this.station = station; }
    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }
    public ConnectorType getConnectorType() { return connectorType; }
    public void setConnectorType(ConnectorType connectorType) { this.connectorType = connectorType; }
    public Double getPowerKw() { return powerKw; }
    public void setPowerKw(Double powerKw) { this.powerKw = powerKw; }
    public BigDecimal getTariffPerKwh() { return tariffPerKwh; }
    public void setTariffPerKwh(BigDecimal tariffPerKwh) { this.tariffPerKwh = tariffPerKwh; }
    public PointStatus getStatus() { return status; }
    public void setStatus(PointStatus status) { this.status = status; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
