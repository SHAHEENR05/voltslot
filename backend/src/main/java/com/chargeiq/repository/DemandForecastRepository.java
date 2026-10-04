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

public interface DemandForecastRepository extends JpaRepository<DemandForecast, Long> {
    /** [stationId, dayOfWeek, hourOfDay, expectedSessions, crowdingIndex] for every cell. */
    @Query("select d.station.id, d.dayOfWeek, d.hourOfDay, d.expectedSessions, d.crowdingIndex from DemandForecast d")
    List<Object[]> findAllCells();
}
