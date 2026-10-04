package com.chargeiq.dto;

import java.time.LocalDateTime;

import com.chargeiq.entity.enums.NotificationStatus;
import com.chargeiq.entity.enums.NotificationType;

public final class NotificationDtos {
    private NotificationDtos() { }

    public record NotificationDto(Long id, NotificationType type, String title, String message, String payload,
                                  boolean read, NotificationStatus status, LocalDateTime createdAt) { }
}
