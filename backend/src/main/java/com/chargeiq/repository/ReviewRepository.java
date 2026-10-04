package com.chargeiq.repository;

import com.chargeiq.entity.*;
import com.chargeiq.entity.enums.*;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ReviewRepository extends JpaRepository<Review, Long> {
    Page<Review> findByStationIdOrderByCreatedAtDesc(Long stationId, Pageable pageable);

    boolean existsByBookingId(Long bookingId);

    @Query("select r.rating, count(r) from Review r where r.station.id = :stationId group by r.rating")
    List<Object[]> ratingCounts(@Param("stationId") Long stationId);

    @Query("select r.sentimentLabel, count(r) from Review r where r.station.id = :stationId group by r.sentimentLabel")
    List<Object[]> sentimentCounts(@Param("stationId") Long stationId);

    /** [avgRating, count, avgSentiment] */
    @Query("select avg(r.rating), count(r), avg(r.sentimentScore) from Review r where r.station.id = :stationId")
    List<Object[]> aggregate(@Param("stationId") Long stationId);
}
