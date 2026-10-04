package com.chargeiq.service;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.chargeiq.clock.AppClock;
import com.chargeiq.dto.CommonDtos.PageResponse;
import com.chargeiq.dto.NotificationDtos.NotificationDto;
import com.chargeiq.entity.Notification;
import com.chargeiq.entity.User;
import com.chargeiq.entity.enums.NotificationStatus;
import com.chargeiq.entity.enums.NotificationType;
import com.chargeiq.exception.ForbiddenException;
import com.chargeiq.exception.ResourceNotFoundException;
import com.chargeiq.repository.NotificationRepository;
import com.chargeiq.repository.UserRepository;

/**
 * In-app notification centre: other services call {@link #create} to tell a user something happened
 * (booking confirmed, waitlist promoted, recharge reminder ...). The UI polls the unread counter.
 */
@Service
@Transactional
public class NotificationService {

    private static final int TITLE_MAX = 120;
    private static final int MESSAGE_MAX = 400;
    private static final int PAYLOAD_MAX = 600;

    private final NotificationRepository repo;
    private final UserRepository users;
    private final AppClock clock;

    public NotificationService(NotificationRepository repo, UserRepository users, AppClock clock) {
        this.repo = repo;
        this.users = users;
        this.clock = clock;
    }

    /** Creates an ACTIVE, unread notification. Text is truncated to the column lengths of the schema. */
    public Notification create(User user, NotificationType type, String title, String message, String payloadJsonOrNull) {
        Notification n = new Notification();
        n.setUser(user);
        n.setType(type);
        n.setTitle(cut(title, TITLE_MAX));
        n.setMessage(cut(message, MESSAGE_MAX));
        n.setPayload(payloadJsonOrNull == null ? null : cut(payloadJsonOrNull, PAYLOAD_MAX));
        n.setRead(false);
        n.setStatus(NotificationStatus.ACTIVE);
        n.setCreatedAt(clock.now());
        return repo.save(n);
    }

    /** True when the user already has a notification of this type whose payload contains the fragment (de-duplication). */
    @Transactional(readOnly = true)
    public boolean exists(Long userId, NotificationType type, String payloadFragment) {
        return repo.existsByUserIdAndTypeAndPayloadContaining(userId, type, payloadFragment);
    }

    @Transactional(readOnly = true)
    public PageResponse<NotificationDto> list(Long userId, boolean unreadOnly, int page, int size) {
        PageRequest pr = PageRequest.of(Math.max(0, page), Math.min(Math.max(1, size), 100));
        Page<Notification> p = unreadOnly
                ? repo.findByUserIdAndReadFalseOrderByCreatedAtDesc(userId, pr)
                : repo.findByUserIdOrderByCreatedAtDesc(userId, pr);
        return PageResponse.of(p.map(NotificationService::toDto));
    }

    @Transactional(readOnly = true)
    public long unreadCount(Long userId) {
        return repo.countByUserIdAndReadFalse(userId);
    }

    /** Marks one notification as read. 404 if it does not exist, 403 if it belongs to somebody else. */
    public NotificationDto markRead(Long userId, Long notificationId) {
        Notification n = repo.findById(notificationId)
                .orElseThrow(() -> new ResourceNotFoundException("Notification", notificationId));
        if (!n.getUser().getId().equals(userId)) {
            throw new ForbiddenException("This notification belongs to another user");
        }
        n.setRead(true);
        return toDto(repo.save(n));
    }

    /** Marks every unread notification of the user as read; returns how many changed. */
    public int markAllRead(Long userId) {
        return repo.markAllRead(userId);
    }

    public static NotificationDto toDto(Notification n) {
        return new NotificationDto(n.getId(), n.getType(), n.getTitle(), n.getMessage(), n.getPayload(),
                Boolean.TRUE.equals(n.getRead()), n.getStatus(), n.getCreatedAt());
    }

    private static String cut(String s, int max) {
        if (s == null) {
            return "";
        }
        return s.length() <= max ? s : s.substring(0, max - 1) + "…";
    }
}
