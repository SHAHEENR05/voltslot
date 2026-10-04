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

public interface StationRepository extends JpaRepository<Station, Long> {
    List<Station> findByStatus(StationStatus status);

    List<Station> findByOperatorIdOrderByNameAsc(Long operatorId);

    /** Bounding-box pre-filter: cheap index-friendly query before exact haversine distances are computed. */
    @Query("select s from Station s where s.status = :status and s.latitude between :minLat and :maxLat "
            + "and s.longitude between :minLon and :maxLon")
    List<Station> findInBox(@Param("status") StationStatus status, @Param("minLat") double minLat,
                            @Param("maxLat") double maxLat, @Param("minLon") double minLon,
                            @Param("maxLon") double maxLon);

    @Query("select s.zone, count(s), avg(s.latitude), avg(s.longitude) from Station s "
            + "where s.status = :status group by s.zone order by s.zone")
    List<Object[]> zoneSummary(@Param("status") StationStatus status);
}
