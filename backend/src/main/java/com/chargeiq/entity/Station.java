package com.chargeiq.entity;

import jakarta.persistence.*;
import com.chargeiq.entity.enums.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

/** A charging station: location + operator + facilities. One station has many ChargingPoints. */
@Entity
@Table(name = "stations")
public class Station {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "operator_id", nullable = false) private Operator operator;
    @Column(nullable = false, length = 100) private String name;
    @Column(nullable = false, length = 200) private String address;
    @Column(nullable = false, length = 40) private String zone;
    @Column(nullable = false, length = 40) private String city;
    @Column(nullable = false) private Double latitude;
    @Column(nullable = false) private Double longitude;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private StationTier tier = StationTier.STANDARD;
    @Column(nullable = false) private Integer openHour = 0;
    @Column(nullable = false) private Integer closeHour = 24;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private StationStatus status = StationStatus.ACTIVE;
    @Column(nullable = false) private Double uptimePct = 97.0;
    @Column(nullable = false) private Double avgRating = 0.0;
    @Column(nullable = false) private Integer reviewCount = 0;
    @Column(nullable = false) private Double sentimentScore = 0.0;
    @Column(nullable = false) private Double reliabilityScore = 0.0;
    @Column(nullable = false) private LocalDateTime createdAt;

    @ManyToMany(fetch = FetchType.EAGER)
    @JoinTable(name = "station_amenities",
            joinColumns = @JoinColumn(name = "station_id"),
            inverseJoinColumns = @JoinColumn(name = "amenity_id"))
    private Set<Amenity> amenities = new HashSet<>();

    // ---- accessors ----
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Operator getOperator() { return operator; }
    public void setOperator(Operator operator) { this.operator = operator; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }
    public String getZone() { return zone; }
    public void setZone(String zone) { this.zone = zone; }
    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }
    public Double getLatitude() { return latitude; }
    public void setLatitude(Double latitude) { this.latitude = latitude; }
    public Double getLongitude() { return longitude; }
    public void setLongitude(Double longitude) { this.longitude = longitude; }
    public StationTier getTier() { return tier; }
    public void setTier(StationTier tier) { this.tier = tier; }
    public Integer getOpenHour() { return openHour; }
    public void setOpenHour(Integer openHour) { this.openHour = openHour; }
    public Integer getCloseHour() { return closeHour; }
    public void setCloseHour(Integer closeHour) { this.closeHour = closeHour; }
    public StationStatus getStatus() { return status; }
    public void setStatus(StationStatus status) { this.status = status; }
    public Double getUptimePct() { return uptimePct; }
    public void setUptimePct(Double uptimePct) { this.uptimePct = uptimePct; }
    public Double getAvgRating() { return avgRating; }
    public void setAvgRating(Double avgRating) { this.avgRating = avgRating; }
    public Integer getReviewCount() { return reviewCount; }
    public void setReviewCount(Integer reviewCount) { this.reviewCount = reviewCount; }
    public Double getSentimentScore() { return sentimentScore; }
    public void setSentimentScore(Double sentimentScore) { this.sentimentScore = sentimentScore; }
    public Double getReliabilityScore() { return reliabilityScore; }
    public void setReliabilityScore(Double reliabilityScore) { this.reliabilityScore = reliabilityScore; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public Set<Amenity> getAmenities() { return amenities; }
    public void setAmenities(Set<Amenity> amenities) { this.amenities = amenities; }
}
