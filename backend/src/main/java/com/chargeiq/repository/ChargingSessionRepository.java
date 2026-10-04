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

public interface ChargingSessionRepository extends JpaRepository<ChargingSession, Long> {
    Optional<ChargingSession> findByBookingId(Long bookingId);

    @Query("select cs from ChargingSession cs where cs.booking.vehicle.id = :vehicleId order by cs.startedAt asc")
    List<ChargingSession> findByVehicleOrdered(@Param("vehicleId") Long vehicleId);

    @Query("select count(cs) from ChargingSession cs where cs.booking.station.id = :stationId and cs.booking.user.id = :userId")
    long countByStationAndUser(@Param("stationId") Long stationId, @Param("userId") Long userId);

    @Query("select cs from ChargingSession cs where cs.booking.id in :bookingIds")
    List<ChargingSession> findByBookingIds(@Param("bookingIds") Collection<Long> bookingIds);

    @Query("select coalesce(sum(cs.energyKwh), 0), coalesce(sum(cs.amount), 0), count(cs) from ChargingSession cs "
            + "where cs.booking.user.id = :userId")
    List<Object[]> totalsForUser(@Param("userId") Long userId);
}
