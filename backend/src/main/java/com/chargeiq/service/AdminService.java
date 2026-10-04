package com.chargeiq.service;

import java.time.Duration;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.dao.DataAccessException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.chargeiq.clock.AppClock;
import com.chargeiq.dto.AdminDtos.AdminStatsDto;
import com.chargeiq.dto.AdminDtos.AdminUserDto;
import com.chargeiq.dto.AdminDtos.AdvanceClockRequest;
import com.chargeiq.dto.AdminDtos.ClockDto;
import com.chargeiq.dto.AdminDtos.RoleRequest;
import com.chargeiq.dto.AdminDtos.StatusRequest;
import com.chargeiq.dto.AdminDtos.WarehouseRefreshDto;
import com.chargeiq.dto.CommonDtos.PageResponse;
import com.chargeiq.entity.Fleet;
import com.chargeiq.entity.Operator;
import com.chargeiq.entity.User;
import com.chargeiq.entity.enums.Role;
import com.chargeiq.entity.enums.UserStatus;
import com.chargeiq.exception.BadRequestException;
import com.chargeiq.exception.ResourceNotFoundException;
import com.chargeiq.repository.FleetRepository;
import com.chargeiq.repository.OperatorRepository;
import com.chargeiq.repository.UserRepository;
import com.chargeiq.scheduler.JobScheduler;
import com.chargeiq.security.AuthUser;

/**
 * Administrator console logic: user management, platform statistics, data-warehouse refresh and the demo clock.
 *
 * <p>Design notes (useful in the viva):
 * <ul>
 *   <li>Role/status changes go through the JPA repositories (normal CRUD, entity -> DTO mapping inside the transaction).</li>
 *   <li>The warehouse refresh calls the MySQL stored procedure {@code sp_refresh_warehouse()} through
 *       {@link JdbcTemplate}; the procedure rebuilds the star schema (dw_*) used by the analytics module.
 *       It runs <b>outside</b> a Spring transaction because TRUNCATE inside the procedure commits implicitly.</li>
 *   <li>Advancing the demo clock immediately triggers the background jobs once, so the effect (expired holds,
 *       no-shows, reminders) is visible without waiting for the next scheduler tick.</li>
 * </ul>
 */
@Service
@Transactional
public class AdminService {

    /** Whitelisted warehouse tables (never user input) whose row counts are reported after a refresh. */
    private static final List<String> WAREHOUSE_TABLES = List.of("dw_dim_date", "dw_dim_time", "dw_dim_station",
            "dw_dim_user", "dw_dim_vehicle", "dw_dim_connector", "dw_fact_booking", "dw_fact_session");

    private static final long MAX_ADVANCE_DAYS = 400;

    private final UserRepository users;
    private final OperatorRepository operators;
    private final FleetRepository fleets;
    private final JdbcTemplate jdbc;
    private final AppClock clock;
    private final JobScheduler jobs;
    private final ReminderService reminders;

    public AdminService(UserRepository users, OperatorRepository operators, FleetRepository fleets, JdbcTemplate jdbc,
                        AppClock clock, JobScheduler jobs, ReminderService reminders) {
        this.users = users;
        this.operators = operators;
        this.fleets = fleets;
        this.jdbc = jdbc;
        this.clock = clock;
        this.jobs = jobs;
        this.reminders = reminders;
    }

    // ------------------------------------------------------------------ users

    /** Paged user list; {@code q} matches name or e-mail (case-insensitive), role/status are optional exact filters. */
    @Transactional(readOnly = true)
    public PageResponse<AdminUserDto> users(String q, String role, String status, int page, int size) {
        String like = "%" + (q == null ? "" : q.trim().toLowerCase(Locale.ROOT)) + "%";
        List<Role> roles = role == null || role.isBlank() ? Arrays.asList(Role.values()) : List.of(parseRole(role));
        List<UserStatus> statuses = status == null || status.isBlank() ? Arrays.asList(UserStatus.values())
                : List.of(parseStatus(status));
        int safeSize = Math.min(Math.max(size, 1), 100);
        Page<User> result = users.search(like, roles, statuses,
                PageRequest.of(Math.max(page, 0), safeSize, Sort.by("id")));
        return PageResponse.of(result.map(AdminService::toDto));
    }

    /**
     * Changes a user's role. OPERATOR needs an {@code operatorId}, FLEET_MANAGER needs a {@code fleetId}; links that no
     * longer apply are cleared. An administrator cannot demote himself (he could lock everybody out).
     */
    public AdminUserDto changeRole(AuthUser actor, Long id, RoleRequest r) {
        User u = requireUser(id);
        if (actor.getId().equals(id) && r.role() != Role.ADMIN) {
            throw new BadRequestException("You cannot change your own role");
        }
        u.setRole(r.role());
        if (r.role() == Role.OPERATOR) {
            if (r.operatorId() == null) {
                throw new BadRequestException("operatorId is required for role OPERATOR");
            }
            Operator op = operators.findById(r.operatorId())
                    .orElseThrow(() -> new ResourceNotFoundException("Operator", r.operatorId()));
            u.setOperator(op);
        } else {
            u.setOperator(null);
        }
        if (r.role() == Role.FLEET_MANAGER) {
            if (r.fleetId() == null) {
                throw new BadRequestException("fleetId is required for role FLEET_MANAGER");
            }
            Fleet f = fleets.findById(r.fleetId()).orElseThrow(() -> new ResourceNotFoundException("Fleet", r.fleetId()));
            u.setFleet(f);
        } else {
            u.setFleet(null);
        }
        return toDto(users.save(u));
    }

    /** Blocks / unblocks a user (blocked users cannot log in). You cannot block yourself. */
    public AdminUserDto changeStatus(AuthUser actor, Long id, StatusRequest r) {
        User u = requireUser(id);
        if (actor.getId().equals(id) && r.status() == UserStatus.BLOCKED) {
            throw new BadRequestException("You cannot block your own account");
        }
        u.setStatus(r.status());
        return toDto(users.save(u));
    }

    // ------------------------------------------------------------------ stats

    /** Headline numbers for the admin dashboard (row counts per entity + live booking figures at "app now"). */
    @Transactional(readOnly = true)
    public AdminStatsDto stats() {
        var now = clock.now();
        LocalDate today = now.toLocalDate();
        Map<String, Long> counts = new LinkedHashMap<>();
        counts.put("users", users.count());
        counts.put("operators", operators.count());
        counts.put("fleets", fleets.count());
        counts.put("stations", count("select count(*) from stations"));
        counts.put("chargingPoints", count("select count(*) from charging_points"));
        counts.put("vehicles", count("select count(*) from vehicles"));
        counts.put("bookings", count("select count(*) from bookings"));
        counts.put("sessions", count("select count(*) from charging_sessions"));
        counts.put("reviews", count("select count(*) from reviews"));
        long bookingsToday = jdbc.queryForObject(
                "select count(*) from bookings where start_time >= ? and start_time < ? and status not in ('CANCELLED','EXPIRED')",
                Long.class, today.atStartOfDay(), today.plusDays(1).atStartOfDay());
        long live = jdbc.queryForObject(
                "select count(*) from bookings where status in ('HOLD','CONFIRMED','CHECKED_IN') and end_time > ?",
                Long.class, now);
        return new AdminStatsDto(counts, bookingsToday, live, now, clock.getMode());
    }

    // ------------------------------------------------------------------ warehouse

    /**
     * Rebuilds the data warehouse by calling the stored procedure and reports the resulting row counts.
     * On a database without the procedure (H2 in tests) the error is swallowed and the row map is empty.
     */
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public WarehouseRefreshDto refreshWarehouse() {
        long t0 = System.currentTimeMillis();
        Map<String, Long> rows = new LinkedHashMap<>();
        try {
            jdbc.execute("CALL sp_refresh_warehouse()");
            for (String table : WAREHOUSE_TABLES) {
                rows.put(table, count("select count(*) from " + table)); // table names come from the constant list above
            }
        } catch (DataAccessException ex) {
            rows.clear();
        }
        return new WarehouseRefreshDto(rows, System.currentTimeMillis() - t0);
    }

    // ------------------------------------------------------------------ clock

    public ClockDto clock() {
        return new ClockDto(clock.now(), clock.getMode(), clock.getAnchor(), clock.getOffsetSeconds());
    }

    /** Moves the demo clock forward and runs every background job once so the consequences show up immediately. */
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public ClockDto advanceClock(AdvanceClockRequest r) {
        long days = r == null || r.days() == null ? 0 : r.days();
        long hours = r == null || r.hours() == null ? 0 : r.hours();
        long minutes = r == null || r.minutes() == null ? 0 : r.minutes();
        Duration d = Duration.ofDays(days).plusHours(hours).plusMinutes(minutes);
        if (d.isZero() || d.isNegative()) {
            throw new BadRequestException("Provide a positive amount of days, hours or minutes");
        }
        if (d.toDays() > MAX_ADVANCE_DAYS) {
            throw new BadRequestException("Cannot advance more than " + MAX_ADVANCE_DAYS + " days at once");
        }
        clock.advance(d);
        jobs.runAllNow();
        return clock();
    }

    /** Puts the demo clock back to its anchor. */
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public ClockDto resetClock() {
        clock.reset();
        return clock();
    }

    /** Evaluates recharge reminders right now; returns how many new reminders were created. */
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public int runRemindersNow() {
        return reminders.evaluate();
    }

    // ------------------------------------------------------------------ helpers

    private User requireUser(Long id) {
        return users.findById(id).orElseThrow(() -> new ResourceNotFoundException("User", id));
    }

    private long count(String sql) {
        Long n = jdbc.queryForObject(sql, Long.class);
        return n == null ? 0 : n;
    }

    private static Role parseRole(String s) {
        try {
            return Role.valueOf(s.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Unknown role: " + s);
        }
    }

    private static UserStatus parseStatus(String s) {
        try {
            return UserStatus.valueOf(s.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Unknown status: " + s);
        }
    }

    private static AdminUserDto toDto(User u) {
        Operator op = u.getOperator();
        return new AdminUserDto(u.getId(), u.getFullName(), u.getEmail(), u.getRole(), u.getStatus(), u.getCity(),
                op == null ? null : op.getId(), op == null ? null : op.getName(),
                u.getNoShowCount() == null ? 0 : u.getNoShowCount(), u.getCreatedAt(), u.getLastLoginAt());
    }
}
