package com.chargeiq.entity;

import jakarta.persistence.*;
import com.chargeiq.entity.enums.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

/** Forecast (written by the Python analytics) of expected demand per station x weekday x hour. */
@Entity
@Table(name = "demand_forecast")
public class DemandForecast {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "station_id", nullable = false) private Station station;
    @Column(nullable = false) private Integer dayOfWeek;
    @Column(nullable = false) private Integer hourOfDay;
    @Column(nullable = false) private Double expectedSessions;
    @Column(nullable = false) private Double crowdingIndex;
    @Column(nullable = false, length = 30) private String method;

    // ---- accessors ----
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Station getStation() { return station; }
    public void setStation(Station station) { this.station = station; }
    public Integer getDayOfWeek() { return dayOfWeek; }
    public void setDayOfWeek(Integer dayOfWeek) { this.dayOfWeek = dayOfWeek; }
    public Integer getHourOfDay() { return hourOfDay; }
    public void setHourOfDay(Integer hourOfDay) { this.hourOfDay = hourOfDay; }
    public Double getExpectedSessions() { return expectedSessions; }
    public void setExpectedSessions(Double expectedSessions) { this.expectedSessions = expectedSessions; }
    public Double getCrowdingIndex() { return crowdingIndex; }
    public void setCrowdingIndex(Double crowdingIndex) { this.crowdingIndex = crowdingIndex; }
    public String getMethod() { return method; }
    public void setMethod(String method) { this.method = method; }
}
