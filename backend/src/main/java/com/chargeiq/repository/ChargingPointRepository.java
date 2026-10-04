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

public interface ChargingPointRepository extends JpaRepository<ChargingPoint, Long> {
    List<ChargingPoint> findByStationIdOrderByIdAsc(Long stationId);

    List<ChargingPoint> findByStationIdInOrderByIdAsc(Collection<Long> stationIds);

    /**
     * Pessimistic write lock on the given points (always in ascending id order, so two transactions
     * that lock several points can never dead-lock). Used by the booking engine.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from ChargingPoint p where p.id in :ids order by p.id")
    List<ChargingPoint> lockByIds(@Param("ids") Collection<Long> ids);
}
