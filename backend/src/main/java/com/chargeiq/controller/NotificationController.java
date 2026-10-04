package com.chargeiq.controller;

import java.util.Map;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.chargeiq.dto.CommonDtos.PageResponse;
import com.chargeiq.dto.NotificationDtos.NotificationDto;
import com.chargeiq.security.AuthUser;
import com.chargeiq.service.NotificationService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

/** REST layer of the in-app notification centre. */
@RestController
@RequestMapping("/api/notifications")
@Tag(name = "Notifications", description = "In-app notifications of the logged-in user")
public class NotificationController {

    private final NotificationService notificationService;

    public NotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @GetMapping
    @Operation(summary = "List notifications, newest first (optionally unread only)")
    public PageResponse<NotificationDto> list(@AuthenticationPrincipal AuthUser actor,
                                              @RequestParam(name = "unreadOnly", defaultValue = "false") boolean unreadOnly,
                                              @RequestParam(name = "page", defaultValue = "0") int page,
                                              @RequestParam(name = "size", defaultValue = "20") int size) {
        return notificationService.list(actor.getId(), unreadOnly, page, size);
    }

    @GetMapping("/unread-count")
    @Operation(summary = "Number of unread notifications, returned as {\"count\": n}")
    public Map<String, Long> unreadCount(@AuthenticationPrincipal AuthUser actor) {
        return Map.of("count", notificationService.unreadCount(actor.getId()));
    }

    @PostMapping("/{id}/read")
    @Operation(summary = "Mark one notification as read")
    public NotificationDto markRead(@AuthenticationPrincipal AuthUser actor, @PathVariable("id") Long id) {
        return notificationService.markRead(actor.getId(), id);
    }

    @PostMapping("/read-all")
    @Operation(summary = "Mark all notifications as read, returned as {\"updated\": n}")
    public Map<String, Integer> readAll(@AuthenticationPrincipal AuthUser actor) {
        return Map.of("updated", notificationService.markAllRead(actor.getId()));
    }
}
