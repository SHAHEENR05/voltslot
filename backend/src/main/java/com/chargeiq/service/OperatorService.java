package com.chargeiq.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.chargeiq.clock.AppClock;
import com.chargeiq.dto.BookingDtos.BookingDto;
import com.chargeiq.dto.OperatorDtos.OperatorDashboardDto;
import com.chargeiq.dto.OperatorDtos.PointRequest;
import com.chargeiq.dto.OperatorDtos.PointSchedule;
import com.chargeiq.dto.OperatorDtos.PointStatusRequest;
import com.chargeiq.dto.OperatorDtos.ScheduleBookingRow;
import com.chargeiq.dto.OperatorDtos.StationLive;
import com.chargeiq.dto.OperatorDtos.StationRequest;
import com.chargeiq.dto.OperatorDtos.StationScheduleDto;
import com.chargeiq.dto.OperatorDtos.WalkInRequest;
import com.chargeiq.dto.StationDtos.PointDto;
import com.chargeiq.dto.StationDtos.StationDetailDto;
import com.chargeiq.dto.StationDtos.StationSummaryDto;
import com.chargeiq.entity.Amenity;
import com.chargeiq.entity.Booking;
import com.chargeiq.entity.BookingSlot;
import com.chargeiq.entity.ChargingPoint;
import com.chargeiq.entity.ChargingSession;
import com.chargeiq.entity.ConnectorType;
import com.chargeiq.entity.Operator;
import com.chargeiq.entity.Payment;
import com.chargeiq.entity.Station;
import com.chargeiq.entity.Vehicle;
import com.chargeiq.entity.VehicleModel;
import com.chargeiq.entity.enums.BookingSource;
import com.chargeiq.entity.enums.BookingStatus;
import com.chargeiq.entity.enums.CurrentType;
import com.chargeiq.entity.enums.PaymentMethod;
import com.chargeiq.entity.enums.PaymentStatus;
import com.chargeiq.entity.enums.PointStatus;
import com.chargeiq.entity.enums.StationStatus;
import com.chargeiq.entity.enums.StationTier;
import com.chargeiq.exception.BadRequestException;
import com.chargeiq.exception.ConflictException;
import com.chargeiq.exception.ForbiddenException;
import com.chargeiq.exception.ResourceNotFoundException;
import com.chargeiq.repository.AmenityRepository;
import com.chargeiq.repository.BookingRepository;
import com.chargeiq.repository.BookingSlotRepository;
import com.chargeiq.repository.ChargingPointRepository;
import com.chargeiq.repository.ChargingSessionRepository;
import com.chargeiq.repository.ConnectorTypeRepository;
import com.chargeiq.repository.OperatorRepository;
import com.chargeiq.repository.PaymentRepository;
import com.chargeiq.repository.StationRepository;
import com.chargeiq.repository.UserRepository;
import com.chargeiq.repository.VehicleRepository;
import com.chargeiq.security.AuthUser;
import com.chargeiq.util.CodeGenerator;
import com.chargeiq.util.TimeUtil;

/**
 * Station-operator console: station and charging-point CRUD, the day schedule, walk-in logging and a small dashboard.
 *
 * <p><b>Ownership rule (enforced here, not in the controller):</b> an OPERATOR may only touch stations whose
 * {@code operator_id} equals their own; anything else is a 403. An ADMIN may touch everything.
 * Deleting a station is a <i>soft</i> delete (status INACTIVE) because bookings, reviews and the analytics
 * history still reference it.</p>
 */
@Service
@Transactional
public class OperatorService {

    /** Bookings that count as "real" activity of a day (holds are not paid yet, cancelled/expired are gone). */
    private static final List<BookingStatus> DAY_STATUSES = List.of(BookingStatus.HOLD, BookingStatus.CONFIRMED,
            BookingStatus.CHECKED_IN, BookingStatus.COMPLETED, BookingStatus.NO_SHOW);

    private final StationRepository stations;
    private final ChargingPointRepository points;
    private final ConnectorTypeRepository connectors;
    private final AmenityRepository amenities;
    private final OperatorRepository operators;
    private final BookingRepository bookings;
    private final BookingSlotRepository slots;
    private final ChargingSessionRepository sessions;
    private final UserRepository users;
    private final VehicleRepository vehicles;
    private final StationService stationService;
    private final BookingService bookingService;
    private final ForecastService forecast;
    private final AppClock clock;
    private final PaymentRepository payments;

    public OperatorService(StationRepository stations, ChargingPointRepository points, ConnectorTypeRepository connectors,
                           AmenityRepository amenities, OperatorRepository operators, BookingRepository bookings,
                           BookingSlotRepository slots, ChargingSessionRepository sessions, UserRepository users,
                           VehicleRepository vehicles, StationService stationService, BookingService bookingService,
                           ForecastService forecast, AppClock clock, PaymentRepository payments) {
        this.stations = stations;
        this.points = points;
        this.connectors = connectors;
        this.amenities = amenities;
        this.operators = operators;
        this.bookings = bookings;
        this.slots = slots;
        this.sessions = sessions;
        this.users = users;
        this.vehicles = vehicles;
        this.stationService = stationService;
        this.bookingService = bookingService;
        this.forecast = forecast;
        this.clock = clock;
        this.payments = payments;
    }

    // ------------------------------------------------------------------ dashboard

    /** Today's numbers for the operator's stations (ADMIN: all stations). */
    @Transactional(readOnly = true)
    public OperatorDashboardDto dashboard(AuthUser actor) {
        List<Station> mine = stationsOf(actor);
        String operatorName = actor.isAdmin() ? "All operators"
                : operators.findById(actor.getOperatorId()).map(Operator::getName).orElse("Operator");
        if (mine.isEmpty()) {
            return new OperatorDashboardDto(operatorName, 0, 0, 0, 0, 0, 0, BigDecimal.ZERO, 0.0, List.of());
        }
        LocalDateTime now = clock.now();
        LocalDate today = now.toLocalDate();
        List<Long> ids = new ArrayList<>();
        for (Station s : mine) {
            ids.add(s.getId());
        }
        List<ChargingPoint> allPoints = points.findByStationIdInOrderByIdAsc(ids);
        List<Booking> day = bookings.findForStations(ids, today.atStartOfDay(), today.plusDays(1).atStartOfDay(), DAY_STATUSES);

        int bookingsToday = 0;
        int inProgress = 0;
        int upcomingToday = 0;
        List<Long> completedIds = new ArrayList<>();
        Map<Long, Set<Long>> busyPointsByStation = new HashMap<>();
        for (Booking b : day) {
            BookingStatus st = b.getStatus();
            if (st != BookingStatus.HOLD) {
                bookingsToday++;
            }
            if (st == BookingStatus.CHECKED_IN) {
                inProgress++;
            }
            if (st == BookingStatus.CONFIRMED && b.getStartTime().isAfter(now)) {
                upcomingToday++;
            }
            if (st == BookingStatus.COMPLETED) {
                completedIds.add(b.getId());
            }
            boolean live = st == BookingStatus.HOLD || st == BookingStatus.CONFIRMED || st == BookingStatus.CHECKED_IN;
            if (live && !b.getStartTime().isAfter(now) && b.getEndTime().isAfter(now)) {
                busyPointsByStation.computeIfAbsent(b.getStation().getId(), k -> new HashSet<>()).add(b.getChargingPoint().getId());
            }
        }
        BigDecimal revenue = BigDecimal.ZERO;
        double energy = 0;
        if (!completedIds.isEmpty()) {
            for (ChargingSession cs : sessions.findByBookingIds(completedIds)) {
                revenue = revenue.add(cs.getAmount());
                energy += cs.getEnergyKwh();
            }
        }

        Map<Long, int[]> pointCounts = new HashMap<>();      // stationId -> {total, active}
        int totalPoints = 0;
        int activePoints = 0;
        for (ChargingPoint p : allPoints) {
            int[] c = pointCounts.computeIfAbsent(p.getStation().getId(), k -> new int[2]);
            c[0]++;
            totalPoints++;
            if (p.getStatus() == PointStatus.ACTIVE) {
                c[1]++;
                activePoints++;
            }
        }
        List<StationLive> live = new ArrayList<>();
        for (Station s : mine) {
            int[] c = pointCounts.getOrDefault(s.getId(), new int[2]);
            Set<Long> busy = busyPointsByStation.get(s.getId());
            double crowd = forecast.crowdingIndex(s.getId(), now);
            live.add(new StationLive(s.getId(), s.getName(), c[0], c[1], busy == null ? 0 : busy.size(), crowd,
                    ForecastService.level(crowd)));
        }
        return new OperatorDashboardDto(operatorName, mine.size(), totalPoints, activePoints, bookingsToday, inProgress,
                upcomingToday, revenue.setScale(2, RoundingMode.HALF_UP), Math.round(energy * 10.0) / 10.0, live);
    }

    // ------------------------------------------------------------------ stations

    @Transactional(readOnly = true)
    public List<StationSummaryDto> myStations(AuthUser actor) {
        return stationService.summaries(stationsOf(actor), null);
    }

    /** OPERATOR: station belongs to the caller's operator. ADMIN: operatorId must be supplied in the request. */
    public StationDetailDto createStation(AuthUser actor, StationRequest r) {
        Long operatorId = actor.isAdmin() ? r.operatorId() : requireOperatorId(actor);
        if (operatorId == null) {
            throw new BadRequestException("operatorId is required when an administrator creates a station");
        }
        Operator operator = operators.findById(operatorId).orElseThrow(() -> new ResourceNotFoundException("Operator", operatorId));
        Station s = new Station();
        s.setOperator(operator);
        s.setCreatedAt(clock.now());
        applyStationFields(s, r);
        Station saved = stations.save(s);
        return stationService.detail(saved.getId());
    }

    public StationDetailDto updateStation(AuthUser actor, Long id, StationRequest r) {
        Station s = stationService.require(id);
        assertCanManage(actor, s);
        applyStationFields(s, r);
        if (actor.isAdmin() && r.operatorId() != null) {
            s.setOperator(operators.findById(r.operatorId()).orElseThrow(() -> new ResourceNotFoundException("Operator", r.operatorId())));
        }
        stations.save(s);
        return stationService.detail(s.getId());
    }

    /** Soft delete: refuses (409) while live bookings exist, otherwise marks the station INACTIVE. */
    public void deleteStation(AuthUser actor, Long id) {
        Station s = stationService.require(id);
        assertCanManage(actor, s);
        if (!liveBookingsAtStation(id).isEmpty()) {
            throw new ConflictException("Station has upcoming or running bookings - cancel or complete them first");
        }
        s.setStatus(StationStatus.INACTIVE);
        stations.save(s);
    }

    // ------------------------------------------------------------------ points

    public PointDto addPoint(AuthUser actor, Long stationId, PointRequest r) {
        Station s = stationService.require(stationId);
        assertCanManage(actor, s);
        ChargingPoint p = new ChargingPoint();
        p.setStation(s);
        p.setCreatedAt(clock.now());
        applyPointFields(p, r);
        if (p.getStatus() == null) {
            p.setStatus(PointStatus.ACTIVE);
        }
        return StationService.toPointDto(points.save(p));
    }

    public PointDto updatePoint(AuthUser actor, Long pointId, PointRequest r) {
        ChargingPoint p = requirePoint(actor, pointId);
        applyPointFields(p, r);
        return StationService.toPointDto(points.save(p));
    }

    /**
     * Hard delete of a point that was never used. A point with live bookings gives 409; a point that only has
     * history cannot be removed either (foreign keys) - the operator should set it OFFLINE instead.
     */
    public void deletePoint(AuthUser actor, Long pointId) {
        ChargingPoint p = requirePoint(actor, pointId);
        for (Booking b : liveBookingsAtStation(p.getStation().getId())) {
            if (b.getChargingPoint().getId().equals(pointId)) {
                throw new ConflictException("Point has upcoming or running bookings - cancel or complete them first");
            }
        }
        try {
            points.delete(p);
            points.flush();
        } catch (DataIntegrityViolationException ex) {
            throw new ConflictException("Point has booking history and cannot be deleted - set its status to OFFLINE instead");
        }
    }

    public PointDto setPointStatus(AuthUser actor, Long pointId, PointStatusRequest r) {
        ChargingPoint p = requirePoint(actor, pointId);
        p.setStatus(r.status());
        return StationService.toPointDto(points.save(p));
    }

    // ------------------------------------------------------------------ schedule

    /** Bookings of one day grouped per charging point (cancelled / expired ones are not shown). */
    @Transactional(readOnly = true)
    public StationScheduleDto schedule(AuthUser actor, Long stationId, LocalDate date) {
        Station s = stationService.require(stationId);
        assertCanManage(actor, s);
        LocalDate day = date == null ? clock.today() : date;
        List<BookingStatus> statuses = List.of(BookingStatus.HOLD, BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN,
                BookingStatus.COMPLETED, BookingStatus.NO_SHOW);
        List<Booking> list = bookings.findForStations(List.of(stationId), day.atStartOfDay(), day.plusDays(1).atStartOfDay(), statuses);

        Map<Long, List<ScheduleBookingRow>> byPoint = new LinkedHashMap<>();
        for (Booking b : list) {
            String vehicle = b.getVehicle().getRegNumber();
            if (b.getVehicle().getNickname() != null && !b.getVehicle().getNickname().isBlank()) {
                vehicle += " (" + b.getVehicle().getNickname() + ")";
            }
            byPoint.computeIfAbsent(b.getChargingPoint().getId(), k -> new ArrayList<>())
                    .add(new ScheduleBookingRow(b.getId(), b.getBookingCode(), b.getStatus(), b.getStartTime(),
                            b.getEndTime(), vehicle, b.getUser().getFullName(), b.getSource()));
        }
        List<PointSchedule> result = new ArrayList<>();
        for (ChargingPoint p : points.findByStationIdOrderByIdAsc(stationId)) {
            result.add(new PointSchedule(p.getId(), p.getLabel(), p.getConnectorType().getCode(), p.getPowerKw(),
                    p.getStatus(), byPoint.getOrDefault(p.getId(), List.of())));
        }
        return new StationScheduleDto(s.getId(), s.getName(), day, result);
    }

    // ------------------------------------------------------------------ walk-in

    /**
     * Records a customer who simply drove in (no app booking). The booking is written as COMPLETED straight away
     * together with its charging session, a UPI payment and the booking_slots rows, so that utilisation and
     * revenue analytics treat it like any other session.
     */
    public BookingDto logWalkIn(AuthUser actor, WalkInRequest r) {
        ChargingPoint point = points.findById(r.chargingPointId())
                .orElseThrow(() -> new ResourceNotFoundException("Charging point", r.chargingPointId()));
        Station station = point.getStation();
        assertCanManage(actor, station);
        LocalDateTime now = clock.now();
        if (r.startTime().isAfter(now.plusMinutes(1))) {
            throw new BadRequestException("A walk-in session cannot start in the future");
        }
        Vehicle vehicle = vehicles.findByRegNumberIgnoreCase(r.vehicleRegNumber().trim())
                .orElseThrow(() -> new ResourceNotFoundException("Vehicle with registration " + r.vehicleRegNumber() + " not found"));
        VehicleModel model = vehicle.getModel();

        boolean connectorOk = false;
        for (ConnectorType ct : model.getConnectors()) {
            if (ct.getId().equals(point.getConnectorType().getId())) {
                connectorOk = true;
                break;
            }
        }
        boolean dc = point.getConnectorType().getCurrentType() == CurrentType.DC;
        double acceptedKw = Math.min(point.getPowerKw(), dc ? model.getDcMaxKw() : model.getAcMaxKw());
        if (!connectorOk || acceptedKw <= 0) {
            throw new BadRequestException("Vehicle " + vehicle.getRegNumber() + " cannot use this charging point");
        }

        // Slot rows: every 30-minute slot the session touches, starting at the grid slot that contains the start.
        int slotCount = (int) Math.ceil(r.durationMinutes() / (double) TimeUtil.SLOT_MINUTES);
        LocalDateTime slotStart = TimeUtil.floorToSlot(r.startTime());
        List<LocalDateTime> starts = new ArrayList<>();
        for (int i = 0; i < slotCount; i++) {
            starts.add(slotStart.plusMinutes((long) i * TimeUtil.SLOT_MINUTES));
        }
        points.lockByIds(List.of(point.getId()));      // serialise with online bookings on this point
        if (slots.countOccupied(point.getId(), starts) > 0) {
            throw new ConflictException("The charging point is already booked for that time");
        }

        // Energy: measured value if the operator typed one, otherwise accepted kW x hours with ~20 % taper loss.
        double energy = r.energyKwh() != null ? r.energyKwh()
                : acceptedKw * (r.durationMinutes() / 60.0) * 0.8;
        energy = Math.min(energy, model.getBatteryKwh() / 0.92);       // cannot exceed a full battery
        energy = Math.round(energy * 100.0) / 100.0;
        int deltaSoc = (int) Math.max(1, Math.min(95, Math.round(energy * 0.92 / model.getBatteryKwh() * 100.0)));
        int socStart = Math.max(5, Math.min(30, 100 - deltaSoc));
        int socEnd = Math.min(100, socStart + deltaSoc);

        BigDecimal effTariff = point.getTariffPerKwh().multiply(multiplier(r.startTime().getHour())).setScale(2, RoundingMode.HALF_UP);
        BigDecimal amount = effTariff.multiply(BigDecimal.valueOf(energy)).setScale(2, RoundingMode.HALF_UP);
        double kmAdded = deltaSoc / 100.0 * model.getBatteryKwh() * model.getKmPerKwh();
        double co2 = Math.round(kmAdded * co2Factor(model) * 100.0) / 100.0;

        Booking b = new Booking();
        b.setBookingCode(newBookingCode());
        b.setUser(vehicle.getUser());
        b.setVehicle(vehicle);
        b.setChargingPoint(point);
        b.setStation(station);
        b.setStartTime(slotStart);
        b.setEndTime(slotStart.plusMinutes((long) slotCount * TimeUtil.SLOT_MINUTES));
        b.setSlots(slotCount);
        b.setStatus(BookingStatus.COMPLETED);
        b.setSource(BookingSource.WALK_IN);
        b.setSocStart(socStart);
        b.setSocTarget(socEnd);
        b.setEstEnergyKwh(energy);
        b.setEstCost(amount);
        b.setCreatedAt(now);
        b = bookings.save(b);

        List<BookingSlot> rows = new ArrayList<>();
        for (LocalDateTime t : starts) {
            BookingSlot bs = new BookingSlot();
            bs.setBooking(b);
            bs.setChargingPoint(point);
            bs.setSlotStart(t);
            rows.add(bs);
        }
        slots.saveAll(rows);

        ChargingSession cs = new ChargingSession();
        cs.setBooking(b);
        cs.setStartedAt(r.startTime());
        cs.setEndedAt(r.startTime().plusMinutes(r.durationMinutes()));
        cs.setEnergyKwh(energy);
        cs.setSocStart(socStart);
        cs.setSocEnd(socEnd);
        cs.setAvgKw(Math.round(energy / (r.durationMinutes() / 60.0) * 100.0) / 100.0);
        cs.setTariff(effTariff);
        cs.setAmount(amount);
        cs.setCo2AvoidedKg(co2);
        sessions.save(cs);

        // invoice_no is NOT NULL + UNIQUE: insert with a temporary value, then derive the real one from the id.
        Payment pay = new Payment();
        pay.setBooking(b);
        pay.setAmount(amount);
        pay.setMethod(PaymentMethod.UPI);
        pay.setStatus(PaymentStatus.PAID);
        pay.setInvoiceNo("TMP-" + b.getBookingCode());
        pay.setRefundedAmount(BigDecimal.ZERO);
        pay.setPaidAt(now);
        pay = payments.saveAndFlush(pay);
        pay.setInvoiceNo(String.format("INV-2526-%06d", pay.getId()));
        payments.save(pay);

        return bookingService.toDto(b);
    }

    // ------------------------------------------------------------------ helpers

    private Long requireOperatorId(AuthUser actor) {
        if (actor.getOperatorId() == null) {
            throw new ForbiddenException("This account is not linked to an operator");
        }
        return actor.getOperatorId();
    }

    private List<Station> stationsOf(AuthUser actor) {
        if (actor.isAdmin()) {
            return stations.findAll(Sort.by("name"));
        }
        return stations.findByOperatorIdOrderByNameAsc(requireOperatorId(actor));
    }

    private void assertCanManage(AuthUser actor, Station s) {
        if (actor.isAdmin()) {
            return;
        }
        Long own = actor.getOperatorId();
        if (own == null || !own.equals(s.getOperator().getId())) {
            throw new ForbiddenException("This station belongs to another operator");
        }
    }

    private ChargingPoint requirePoint(AuthUser actor, Long pointId) {
        ChargingPoint p = points.findById(pointId).orElseThrow(() -> new ResourceNotFoundException("Charging point", pointId));
        assertCanManage(actor, p.getStation());
        return p;
    }

    /** Bookings of the station that still block it: live status and not yet finished. */
    private List<Booking> liveBookingsAtStation(Long stationId) {
        LocalDateTime now = clock.now();
        List<Booking> result = new ArrayList<>();
        for (Booking b : bookings.findForStations(List.of(stationId), now.minusDays(2), now.plusYears(2), BookingStatus.LIVE)) {
            if (b.getEndTime().isAfter(now)) {
                result.add(b);
            }
        }
        return result;
    }

    private void applyStationFields(Station s, StationRequest r) {
        s.setName(r.name().trim());
        s.setAddress(r.address().trim());
        s.setZone(r.zone().trim());
        s.setCity(r.city().trim());
        s.setLatitude(r.latitude());
        s.setLongitude(r.longitude());
        if (r.tier() != null) {
            s.setTier(r.tier());
        } else if (s.getTier() == null) {
            s.setTier(StationTier.STANDARD);
        }
        if (r.openHour() != null) {
            s.setOpenHour(r.openHour());
        }
        if (r.closeHour() != null) {
            s.setCloseHour(r.closeHour());
        }
        if (s.getOpenHour() >= s.getCloseHour()) {
            throw new BadRequestException("openHour must be earlier than closeHour");
        }
        if (r.status() != null) {
            s.setStatus(r.status());
        }
        if (r.amenityIds() != null) {
            Set<Long> wanted = new HashSet<>(r.amenityIds());
            List<Amenity> found = amenities.findAllById(wanted);
            if (found.size() != wanted.size()) {
                throw new ResourceNotFoundException("One or more amenities do not exist");
            }
            s.setAmenities(new HashSet<>(found));
        }
    }

    private void applyPointFields(ChargingPoint p, PointRequest r) {
        ConnectorType ct = connectors.findById(r.connectorTypeId())
                .orElseThrow(() -> new ResourceNotFoundException("Connector type", r.connectorTypeId()));
        p.setLabel(r.label().trim());
        p.setConnectorType(ct);
        p.setPowerKw(r.powerKw());
        p.setTariffPerKwh(r.tariffPerKwh().setScale(2, RoundingMode.HALF_UP));
        if (r.status() != null) {
            p.setStatus(r.status());
        }
    }

    private String newBookingCode() {
        String code = CodeGenerator.bookingCode();
        while (bookings.existsByBookingCode(code)) {
            code = CodeGenerator.bookingCode();
        }
        return code;
    }

    /** Time-of-day tariff multiplier of 00_overview.md (same constants as the EstimatorService fallback). */
    private static BigDecimal multiplier(int hour) {
        if (hour >= 22 || hour <= 5) {
            return new BigDecimal("0.85");
        }
        if (hour >= 18) {
            return new BigDecimal("1.20");
        }
        return BigDecimal.ONE;
    }

    private static double co2Factor(VehicleModel m) {
        switch (m.getCategory()) {
            case TWO_WHEELER: return 0.04;
            case THREE_WHEELER: return 0.08;
            case LCV: return 0.22;
            default: return 0.12;
        }
    }
}
