package com.chargeiq.service;

import java.util.List;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.chargeiq.clock.AppClock;
import com.chargeiq.dto.VehicleDtos.VehicleDto;
import com.chargeiq.dto.VehicleDtos.VehicleRequest;
import com.chargeiq.entity.User;
import com.chargeiq.entity.Vehicle;
import com.chargeiq.entity.VehicleModel;
import com.chargeiq.entity.enums.BookingStatus;
import com.chargeiq.entity.enums.Role;
import com.chargeiq.exception.ConflictException;
import com.chargeiq.exception.ForbiddenException;
import com.chargeiq.exception.ResourceNotFoundException;
import com.chargeiq.mapper.VehicleMapper;
import com.chargeiq.repository.BookingRepository;
import com.chargeiq.repository.FleetRepository;
import com.chargeiq.repository.UserRepository;
import com.chargeiq.repository.VehicleModelRepository;
import com.chargeiq.repository.VehicleRepository;
import com.chargeiq.security.AuthUser;

/**
 * Vehicle CRUD with ownership rules.
 * <ul>
 *   <li>A normal user sees and edits only his own vehicles (One-to-Many User -> Vehicle).</li>
 *   <li>A fleet manager sees every vehicle of his fleet and new vehicles are attached to that fleet.</li>
 *   <li>Deleting a vehicle that still has a live future booking is refused with 409.</li>
 * </ul>
 * The constructor has one extra parameter (AppClock) compared with the shared contract, because "future booking"
 * must be judged against the application clock and never against the system clock.
 */
@Service
@Transactional
public class VehicleService {
    private final VehicleRepository vehicles;
    private final VehicleModelRepository models;
    private final UserRepository users;
    private final BookingRepository bookings;
    private final FleetRepository fleets;
    private final AppClock clock;

    public VehicleService(VehicleRepository vehicles, VehicleModelRepository models, UserRepository users,
                          BookingRepository bookings, FleetRepository fleets, AppClock clock) {
        this.vehicles = vehicles;
        this.models = models;
        this.users = users;
        this.bookings = bookings;
        this.fleets = fleets;
        this.clock = clock;
    }

    /** FLEET_MANAGER -> all vehicles of the fleet; everybody else -> own vehicles. */
    @Transactional(readOnly = true)
    public List<VehicleDto> list(AuthUser actor) {
        List<Vehicle> found;
        if (actor.getRole() == Role.FLEET_MANAGER && actor.getFleetId() != null) {
            found = vehicles.findByFleetIdOrderByIdAsc(actor.getFleetId());
        } else {
            found = vehicles.findByUserIdOrderByIdAsc(actor.getId());
        }
        return found.stream().map(VehicleMapper::toDto).toList();
    }

    @Transactional(readOnly = true)
    public VehicleDto get(AuthUser actor, Long id) {
        return VehicleMapper.toDto(requireAccessible(id, actor));
    }

    public VehicleDto create(AuthUser actor, VehicleRequest r) {
        VehicleModel model = models.findById(r.modelId())
                .orElseThrow(() -> new ResourceNotFoundException("Vehicle model", r.modelId()));
        String reg = normaliseReg(r.regNumber());
        if (vehicles.existsByRegNumberIgnoreCase(reg)) {
            throw new ConflictException("A vehicle with registration number " + reg + " already exists");
        }
        User owner = users.findById(actor.getId())
                .orElseThrow(() -> new ResourceNotFoundException("User", actor.getId()));
        Vehicle v = new Vehicle();
        v.setUser(owner);
        // A fleet manager's vehicles belong to the fleet as well (so every dispatcher of the fleet can see them).
        if (owner.getRole() == Role.FLEET_MANAGER && owner.getFleet() != null) {
            v.setFleet(owner.getFleet());
        }
        v.setModel(model);
        v.setRegNumber(reg);
        v.setNickname(blankToNull(r.nickname()));
        v.setAvgDailyKm(r.avgDailyKm() == null ? 40 : r.avgDailyKm());
        v.setCreatedAt(clock.now());
        return VehicleMapper.toDto(vehicles.save(v));
    }

    public VehicleDto update(AuthUser actor, Long id, VehicleRequest r) {
        Vehicle v = requireAccessible(id, actor);
        VehicleModel model = models.findById(r.modelId())
                .orElseThrow(() -> new ResourceNotFoundException("Vehicle model", r.modelId()));
        String reg = normaliseReg(r.regNumber());
        if (!reg.equalsIgnoreCase(v.getRegNumber())) {
            if (vehicles.existsByRegNumberIgnoreCase(reg)) {
                throw new ConflictException("A vehicle with registration number " + reg + " already exists");
            }
            v.setRegNumber(reg);
        }
        v.setModel(model);
        v.setNickname(blankToNull(r.nickname()));
        if (r.avgDailyKm() != null) {
            v.setAvgDailyKm(r.avgDailyKm());
        }
        return VehicleMapper.toDto(vehicles.save(v));
    }

    public void delete(AuthUser actor, Long id) {
        Vehicle v = requireAccessible(id, actor);
        if (bookings.existsByVehicleIdAndStatusInAndEndTimeAfter(id, BookingStatus.LIVE, clock.now())) {
            throw new ConflictException("Vehicle has upcoming bookings - cancel them before deleting the vehicle");
        }
        try {
            vehicles.delete(v);
            vehicles.flush();
        } catch (DataIntegrityViolationException e) {
            // Past bookings / sessions still reference the vehicle (foreign keys) - keep the history intact.
            throw new ConflictException("Vehicle has booking history and cannot be deleted");
        }
    }

    /**
     * Loads a vehicle and checks that the caller may use it: the owner, a fleet manager of the same fleet or an admin.
     * With a null actor (internal calls, public endpoints) only existence is checked.
     */
    @Transactional(readOnly = true)
    public Vehicle requireAccessible(Long vehicleId, AuthUser actorOrNull) {
        Vehicle v = vehicles.findById(vehicleId)
                .orElseThrow(() -> new ResourceNotFoundException("Vehicle", vehicleId));
        if (actorOrNull == null) {
            return v;
        }
        boolean owner = v.getUser() != null && v.getUser().getId().equals(actorOrNull.getId());
        boolean admin = actorOrNull.getRole() == Role.ADMIN;
        boolean sameFleet = actorOrNull.getRole() == Role.FLEET_MANAGER && actorOrNull.getFleetId() != null
                && v.getFleet() != null && actorOrNull.getFleetId().equals(v.getFleet().getId());
        if (!(owner || admin || sameFleet)) {
            throw new ForbiddenException("You do not have access to this vehicle");
        }
        return v;
    }

    public static VehicleDto toDto(Vehicle v) {
        return VehicleMapper.toDto(v);
    }

    public static String label(Vehicle v) {
        return VehicleMapper.label(v);
    }

    private static String normaliseReg(String reg) {
        return reg.trim().toUpperCase();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
