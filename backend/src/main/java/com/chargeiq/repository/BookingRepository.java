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

public interface BookingRepository extends JpaRepository<Booking, Long> {
    Optional<Booking> findByBookingCode(String bookingCode);

    boolean existsByBookingCode(String bookingCode);

    Page<Booking> findByUserId(Long userId, Pageable pageable);

    Page<Booking> findByUserIdAndStatusIn(Long userId, Collection<BookingStatus> statuses, Pageable pageable);

    Page<Booking> findByUserIdAndStartTimeGreaterThanEqualAndStatusIn(Long userId, LocalDateTime from,
                                                                       Collection<BookingStatus> statuses, Pageable pageable);

    Page<Booking> findByUserIdAndStartTimeLessThan(Long userId, LocalDateTime before, Pageable pageable);

    /** Past bookings of a user restricted to some statuses (used by GET /bookings?upcoming=false&status=..). */
    Page<Booking> findByUserIdAndStatusInAndStartTimeLessThan(Long userId, Collection<BookingStatus> statuses,
                                                              LocalDateTime before, Pageable pageable);

    List<Booking> findByStatusAndHoldExpiresAtBefore(BookingStatus status, LocalDateTime time);

    List<Booking> findByStatusAndStartTimeBefore(BookingStatus status, LocalDateTime time);

    List<Booking> findByStatusAndEndTimeLessThanEqual(BookingStatus status, LocalDateTime time);

    List<Booking> findByStatusAndStartTimeBetween(BookingStatus status, LocalDateTime from, LocalDateTime to);

    /** Does the same vehicle already have a live booking that overlaps [start, end) ? */
    @Query("select count(b) from Booking b where b.vehicle.id = :vehicleId and b.status in :statuses "
            + "and b.startTime < :end and b.endTime > :start")
    long countVehicleOverlaps(@Param("vehicleId") Long vehicleId, @Param("statuses") Collection<BookingStatus> statuses,
                              @Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    long countByUserIdAndStatusInAndStartTimeGreaterThan(Long userId, Collection<BookingStatus> statuses, LocalDateTime time);

    boolean existsByVehicleIdAndStatusInAndEndTimeAfter(Long vehicleId, Collection<BookingStatus> statuses, LocalDateTime time);

    List<Booking> findByVehicleIdAndStatusInAndEndTimeAfterOrderByStartTime(Long vehicleId, Collection<BookingStatus> statuses,
                                                                           LocalDateTime time);

    List<Booking> findByStationIdAndStartTimeBetweenAndStatusInOrderByStartTime(Long stationId, LocalDateTime from,
                                                                              LocalDateTime to, Collection<BookingStatus> statuses);

    @Query("select b from Booking b where b.station.id in :stationIds and b.startTime >= :from and b.startTime < :to "
            + "and b.status in :statuses order by b.startTime")
    List<Booking> findForStations(@Param("stationIds") Collection<Long> stationIds, @Param("from") LocalDateTime from,
                                  @Param("to") LocalDateTime to, @Param("statuses") Collection<BookingStatus> statuses);

    @Query("select b from Booking b where b.vehicle.fleet.id = :fleetId and b.status in :statuses and b.endTime > :after "
            + "order by b.startTime")
    List<Booking> findFleetBookings(@Param("fleetId") Long fleetId, @Param("statuses") Collection<BookingStatus> statuses,
                                    @Param("after") LocalDateTime after);
}
