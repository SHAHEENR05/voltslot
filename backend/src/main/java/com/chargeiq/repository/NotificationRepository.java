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

public interface NotificationRepository extends JpaRepository<Notification, Long> {
    Page<Notification> findByUserIdOrderByCreatedAtDesc(Long userId, Pageable pageable);

    Page<Notification> findByUserIdAndReadFalseOrderByCreatedAtDesc(Long userId, Pageable pageable);

    long countByUserIdAndReadFalse(Long userId);

    List<Notification> findByUserIdAndType(Long userId, NotificationType type);

    List<Notification> findByUserIdAndTypeAndStatusIn(Long userId, NotificationType type, Collection<NotificationStatus> statuses);

    List<Notification> findByTypeAndStatusAndSnoozedUntilLessThanEqual(NotificationType type, NotificationStatus status,
                                                                      LocalDateTime time);

    boolean existsByUserIdAndTypeAndPayloadContaining(Long userId, NotificationType type, String text);

    @Modifying
    @Query("update Notification n set n.read = true where n.user.id = :userId and n.read = false")
    int markAllRead(@Param("userId") Long userId);
}
