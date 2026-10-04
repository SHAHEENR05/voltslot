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

public interface BookingSlotRepository extends JpaRepository<BookingSlot, Long> {
    /** Returns rows of [pointId, slotStart] that are already taken inside the window. */
    @Query("select s.chargingPoint.id, s.slotStart from BookingSlot s where s.chargingPoint.id in :pointIds "
            + "and s.slotStart >= :from and s.slotStart < :to")
    List<Object[]> findOccupied(@Param("pointIds") Collection<Long> pointIds, @Param("from") LocalDateTime from,
                                @Param("to") LocalDateTime to);

    @Query("select count(s) from BookingSlot s where s.chargingPoint.id = :pointId and s.slotStart in :starts")
    long countOccupied(@Param("pointId") Long pointId, @Param("starts") Collection<LocalDateTime> starts);

    @Query("select s.chargingPoint.id from BookingSlot s where s.slotStart = :slot")
    List<Long> pointsOccupiedAt(@Param("slot") LocalDateTime slot);

    @Modifying
    @Query("delete from BookingSlot s where s.booking.id = :bookingId")
    int deleteByBookingId(@Param("bookingId") Long bookingId);
}
