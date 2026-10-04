package com.chargeiq.entity;

import jakarta.persistence.*;
import com.chargeiq.entity.enums.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

/** Station review with a sentiment score computed from the comment text. */
@Entity
@Table(name = "reviews")
public class Review {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "station_id", nullable = false) private Station station;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "user_id", nullable = false) private User user;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "booking_id") private Booking booking;
    @Column(nullable = false) private Integer rating;
    @Column(length = 500) private String comment;
    @Column(nullable = false) private Double sentimentScore = 0.0;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private SentimentLabel sentimentLabel = SentimentLabel.NEUTRAL;
    @Column(nullable = false) private LocalDateTime createdAt;

    // ---- accessors ----
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Station getStation() { return station; }
    public void setStation(Station station) { this.station = station; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public Booking getBooking() { return booking; }
    public void setBooking(Booking booking) { this.booking = booking; }
    public Integer getRating() { return rating; }
    public void setRating(Integer rating) { this.rating = rating; }
    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }
    public Double getSentimentScore() { return sentimentScore; }
    public void setSentimentScore(Double sentimentScore) { this.sentimentScore = sentimentScore; }
    public SentimentLabel getSentimentLabel() { return sentimentLabel; }
    public void setSentimentLabel(SentimentLabel sentimentLabel) { this.sentimentLabel = sentimentLabel; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
