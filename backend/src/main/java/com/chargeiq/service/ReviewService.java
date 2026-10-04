package com.chargeiq.service;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.chargeiq.clock.AppClock;
import com.chargeiq.dto.CommonDtos.PageResponse;
import com.chargeiq.dto.StationDtos.ReviewDto;
import com.chargeiq.dto.StationDtos.ReviewRequest;
import com.chargeiq.entity.Booking;
import com.chargeiq.entity.Review;
import com.chargeiq.entity.Station;
import com.chargeiq.entity.User;
import com.chargeiq.exception.BadRequestException;
import com.chargeiq.exception.ConflictException;
import com.chargeiq.exception.ForbiddenException;
import com.chargeiq.exception.ResourceNotFoundException;
import com.chargeiq.repository.BookingRepository;
import com.chargeiq.repository.ChargingSessionRepository;
import com.chargeiq.repository.ReviewRepository;
import com.chargeiq.repository.StationRepository;
import com.chargeiq.repository.UserRepository;
import com.chargeiq.security.AuthUser;

/**
 * Station reviews. Only a driver who really charged at the station may review it. After saving, the station's
 * aggregate columns (avg_rating, review_count, sentiment_score, reliability_score) are recomputed so the
 * recommendation engine and station lists immediately use the new opinion.
 * <p>
 * reliability = 0.5 * (avgRating/5*100) + 0.3 * ((sentiment+1)/2*100) + 0.2 * uptimePct   (range 0..100)
 */
@Service
@Transactional
public class ReviewService {
    private final ReviewRepository reviews;
    private final StationRepository stations;
    private final UserRepository users;
    private final BookingRepository bookings;
    private final ChargingSessionRepository sessions;
    private final SentimentService sentiment;
    private final AppClock clock;

    public ReviewService(ReviewRepository reviews, StationRepository stations, UserRepository users,
                         BookingRepository bookings, ChargingSessionRepository sessions, SentimentService sentiment,
                         AppClock clock) {
        this.reviews = reviews;
        this.stations = stations;
        this.users = users;
        this.bookings = bookings;
        this.sessions = sessions;
        this.sentiment = sentiment;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public PageResponse<ReviewDto> list(Long stationId, int page, int size) {
        if (!stations.existsById(stationId)) {
            throw new ResourceNotFoundException("Station", stationId);
        }
        Page<Review> p = reviews.findByStationIdOrderByCreatedAtDesc(stationId,
                PageRequest.of(Math.max(0, page), Math.min(Math.max(1, size), 100)));
        return PageResponse.of(p.map(ReviewService::toDto));
    }

    public ReviewDto create(AuthUser actor, Long stationId, ReviewRequest r) {
        Station station = stations.findById(stationId)
                .orElseThrow(() -> new ResourceNotFoundException("Station", stationId));
        User user = users.findById(actor.getId())
                .orElseThrow(() -> new ResourceNotFoundException("User", actor.getId()));

        // Rule 1: reviewer must have a charging session at this station.
        if (sessions.countByStationAndUser(stationId, actor.getId()) == 0) {
            throw new ForbiddenException("Only drivers who have charged at this station can review it");
        }

        // Rule 2: optional booking link - must be the reviewer's own booking at this station, one review per booking.
        Booking booking = null;
        if (r.bookingId() != null) {
            booking = bookings.findById(r.bookingId())
                    .orElseThrow(() -> new ResourceNotFoundException("Booking", r.bookingId()));
            if (!booking.getUser().getId().equals(actor.getId())) {
                throw new ForbiddenException("This booking belongs to another user");
            }
            if (!booking.getStation().getId().equals(stationId)) {
                throw new BadRequestException("This booking was not made at the selected station");
            }
            if (reviews.existsByBookingId(r.bookingId())) {
                throw new ConflictException("This booking has already been reviewed");
            }
        }

        SentimentService.SentimentResult s = sentiment.analyze(r.comment());
        Review review = new Review();
        review.setStation(station);
        review.setUser(user);
        review.setBooking(booking);
        review.setRating(r.rating());
        review.setComment(r.comment() == null || r.comment().isBlank() ? null : r.comment().trim());
        review.setSentimentScore(s.score());
        review.setSentimentLabel(s.label());
        LocalDateTime now = clock.now();
        review.setCreatedAt(now);
        Review saved = reviews.saveAndFlush(review);

        recomputeStationAggregates(station);
        return toDto(saved);
    }

    /** Re-reads avg rating / count / avg sentiment with one aggregate query and refreshes the reliability score. */
    private void recomputeStationAggregates(Station station) {
        List<Object[]> rows = reviews.aggregate(station.getId());
        if (rows.isEmpty() || rows.get(0)[0] == null) {
            return;
        }
        Object[] row = rows.get(0);
        double avgRating = ((Number) row[0]).doubleValue();
        long count = ((Number) row[1]).longValue();
        double avgSentiment = row[2] == null ? 0.0 : ((Number) row[2]).doubleValue();
        double uptime = station.getUptimePct() == null ? 97.0 : station.getUptimePct();

        station.setAvgRating(round(avgRating, 2));
        station.setReviewCount((int) count);
        station.setSentimentScore(round(avgSentiment, 3));
        station.setReliabilityScore(round(reliability(avgRating, avgSentiment, uptime), 1));
        stations.save(station);
    }

    /** The reliability formula of the specification (public static so it can be unit tested / reused). */
    public static double reliability(double avgRating, double sentimentScore, double uptimePct) {
        return 0.5 * (avgRating / 5.0 * 100.0) + 0.3 * ((sentimentScore + 1.0) / 2.0 * 100.0) + 0.2 * uptimePct;
    }

    /** Maps a review to its DTO; the reviewer is shown as "First L." for privacy. */
    static ReviewDto toDto(Review r) {
        return new ReviewDto(r.getId(), shortName(r.getUser().getFullName()), r.getRating(), r.getComment(),
                r.getSentimentLabel(), r.getSentimentScore(), r.getCreatedAt());
    }

    private static String shortName(String fullName) {
        if (fullName == null || fullName.isBlank()) {
            return "Driver";
        }
        String[] parts = fullName.trim().split("\\s+");
        if (parts.length == 1) {
            return parts[0];
        }
        return parts[0] + " " + Character.toUpperCase(parts[parts.length - 1].charAt(0)) + ".";
    }

    private static double round(double v, int places) {
        double f = Math.pow(10, places);
        return Math.round(v * f) / f;
    }
}
