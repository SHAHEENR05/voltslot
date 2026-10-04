package com.chargeiq.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;

import com.chargeiq.clock.AppClock;
import com.chargeiq.dto.BookingDtos.Alternatives;
import com.chargeiq.dto.BookingDtos.BookingDto;
import com.chargeiq.dto.BookingDtos.CreateBookingRequest;
import com.chargeiq.dto.BookingDtos.EstimateResponse;
import com.chargeiq.dto.RecommendationDtos.RecommendationResponse;
import com.chargeiq.dto.RecommendationDtos.RecommendedItem;
import com.chargeiq.dto.StationDtos.StationSummaryDto;
import com.chargeiq.entity.Booking;
import com.chargeiq.entity.ChargingPoint;
import com.chargeiq.entity.ConnectorType;
import com.chargeiq.entity.Payment;
import com.chargeiq.entity.Station;
import com.chargeiq.entity.User;
import com.chargeiq.entity.Vehicle;
import com.chargeiq.entity.VehicleModel;
import com.chargeiq.entity.enums.BookingSource;
import com.chargeiq.entity.enums.BookingStatus;
import com.chargeiq.entity.enums.CurrentType;
import com.chargeiq.entity.enums.PaymentMethod;
import com.chargeiq.entity.enums.PaymentStatus;
import com.chargeiq.entity.enums.PointStatus;
import com.chargeiq.entity.enums.Role;
import com.chargeiq.entity.enums.StationStatus;
import com.chargeiq.entity.enums.StationTier;
import com.chargeiq.entity.enums.UserStatus;
import com.chargeiq.entity.enums.VehicleCategory;
import com.chargeiq.entity.enums.WalletTxnType;
import com.chargeiq.event.SlotsReleasedEvent;
import com.chargeiq.exception.InsufficientBalanceException;
import com.chargeiq.exception.SlotUnavailableException;
import com.chargeiq.repository.BookingRepository;
import com.chargeiq.repository.BookingSlotRepository;
import com.chargeiq.repository.ChargingPointRepository;
import com.chargeiq.repository.ChargingSessionRepository;
import com.chargeiq.repository.PaymentRepository;
import com.chargeiq.repository.StationRepository;
import com.chargeiq.repository.UserRepository;
import com.chargeiq.repository.VehicleRepository;
import com.chargeiq.security.AuthUser;

/**
 * Pure unit test of the booking rules: every collaborator is a Mockito mock, no Spring context, no database.
 * (The lock + unique-constraint behaviour is covered by the integration test BookingConcurrencyIT.)
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class BookingServiceTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 10, 3, 9, 30);
    private static final LocalDateTime START = NOW.plusHours(5);          // 14:30, on the 30-minute grid

    @Mock BookingRepository bookings;
    @Mock BookingSlotRepository slots;
    @Mock ChargingPointRepository points;
    @Mock ChargingSessionRepository sessions;
    @Mock PaymentRepository payments;
    @Mock VehicleRepository vehicles;
    @Mock UserRepository users;
    @Mock StationRepository stations;
    @Mock EstimatorService estimator;
    @Mock AvailabilityService availability;
    @Mock RecommendationService recommendation;
    @Mock WalletService wallets;
    @Mock NotificationService notifications;
    @Mock RechargePredictionService predictions;
    @Mock ApplicationEventPublisher events;
    @Mock AppClock clock;

    private BookingService service;
    private User user;
    private AuthUser actor;
    private Station station;
    private ChargingPoint point;
    private Vehicle vehicle;

    @BeforeEach
    void setUp() {
        service = new BookingService(bookings, slots, points, sessions, payments, vehicles, users, stations, estimator,
                availability, recommendation, wallets, notifications, predictions, events, clock);
        when(clock.now()).thenReturn(NOW);

        user = new User();
        user.setId(5L);
        user.setFullName("Aarav Mehta");
        user.setRole(Role.USER);
        user.setNoShowCount(0);
        actor = new AuthUser(5L, "demo@voltslot.in", "Aarav Mehta", "x", Role.USER, UserStatus.ACTIVE, null, null);

        ConnectorType ccs = new ConnectorType();
        ccs.setId(1L);
        ccs.setCode("CCS2");
        ccs.setDisplayName("CCS Combo 2");
        ccs.setCurrentType(CurrentType.DC);
        ccs.setTypicalKw(60.0);

        VehicleModel model = new VehicleModel();
        model.setId(1L);
        model.setMake("Tata");
        model.setModel("Nexon EV");
        model.setCategory(VehicleCategory.CAR);
        model.setBatteryKwh(40.5);
        model.setAcMaxKw(7.2);
        model.setDcMaxKw(50.0);
        model.setRangeKm(300);
        model.setKmPerKwh(6.0);
        model.setConnectors(Set.of(ccs));

        vehicle = new Vehicle();
        vehicle.setId(7L);
        vehicle.setUser(user);
        vehicle.setModel(model);
        vehicle.setRegNumber("MH04AB1234");
        vehicle.setNickname("Nexon");

        station = new Station();
        station.setId(1L);
        station.setName("VoltGrid Thane");
        station.setAddress("Eastern Express Hwy");
        station.setZone("Thane");
        station.setCity("Mumbai");
        station.setLatitude(19.2);
        station.setLongitude(72.97);
        station.setStatus(StationStatus.ACTIVE);
        station.setTier(StationTier.STANDARD);
        station.setOpenHour(0);
        station.setCloseHour(24);

        point = new ChargingPoint();
        point.setId(11L);
        point.setStation(station);
        point.setLabel("DC-1");
        point.setConnectorType(ccs);
        point.setPowerKw(60.0);
        point.setTariffPerKwh(new BigDecimal("18.00"));
        point.setStatus(PointStatus.ACTIVE);

        when(vehicles.findById(7L)).thenReturn(Optional.of(vehicle));
        when(users.findById(5L)).thenReturn(Optional.of(user));
        when(points.findById(11L)).thenReturn(Optional.of(point));
        when(points.findByStationIdOrderByIdAsc(1L)).thenReturn(List.of(point));
        when(estimator.compatible(any(), any())).thenReturn(true);
        when(estimator.acceptedKw(any(), any())).thenReturn(50.0);
        when(estimator.estimate(any(), any(), any(), anyInt(), anyInt())).thenReturn(estimate());
        when(availability.withinOpeningHours(any(), any(), anyInt())).thenReturn(true);
        // the real rule of AvailabilityService.isFree: none of the needed slots may be occupied
        when(availability.isFree(any(), any(), anyInt())).thenAnswer(inv -> {
            Set<LocalDateTime> occupied = inv.getArgument(0);
            LocalDateTime start = inv.getArgument(1);
            int n = inv.getArgument(2);
            for (int i = 0; i < n; i++) {
                if (occupied.contains(start.plusMinutes(30L * i))) {
                    return false;
                }
            }
            return true;
        });
        when(bookings.save(any(Booking.class))).thenAnswer(inv -> {
            Booking b = inv.getArgument(0);
            if (b.getId() == null) {
                b.setId(100L);
            }
            return b;
        });
        when(payments.save(any(Payment.class))).thenAnswer(inv -> {
            Payment p = inv.getArgument(0);
            if (p.getId() == null) {
                p.setId(123L);
            }
            return p;
        });
    }

    // ------------------------------------------------------------------ create / conflict

    @Test
    void createHold_freeSlot_storesHoldAndSlots() {
        when(availability.occupiedSlots(any(), any(), any())).thenReturn(Map.of(11L, Set.<LocalDateTime>of()));

        BookingDto dto = service.createHold(actor, request());

        assertThat(dto.status()).isEqualTo(BookingStatus.HOLD);
        assertThat(dto.slots()).isEqualTo(2);
        assertThat(dto.startTime()).isEqualTo(START);
        assertThat(dto.endTime()).isEqualTo(START.plusMinutes(60));
        assertThat(dto.holdExpiresAt()).isEqualTo(NOW.plusMinutes(5));      // 5-minute hold
        assertThat(dto.bookingCode()).startsWith("VSL-");
        verify(points).lockByIds(any());                                    // pessimistic lock was requested
        verify(slots).saveAll(anyList());
    }

    @Test
    void createHold_takenSlot_throwsSlotUnavailableWithAlternatives() {
        // the requested slot (and only that one) is already booked on the only compatible point
        when(availability.occupiedSlots(any(), any(), any())).thenReturn(Map.of(11L, Set.of(START)));
        when(recommendation.recommend(any(), any())).thenReturn(recommendations());

        assertThatThrownBy(() -> service.createHold(actor, request()))
                .isInstanceOfSatisfying(SlotUnavailableException.class, ex -> {
                    Alternatives alt = (Alternatives) ex.getAlternatives();
                    assertThat(alt).isNotNull();
                    // same-station alternatives: never the occupied slot, nearest to the wish first
                    assertThat(alt.sameStation()).isNotEmpty();
                    assertThat(alt.sameStation()).noneMatch(o -> o.start().equals(START));
                    assertThat(alt.sameStation().get(0).start()).isEqualTo(START.plusMinutes(30));
                    assertThat(alt.sameStation().get(0).pointId()).isEqualTo(11L);
                    // other stations come from the recommendation engine
                    assertThat(alt.otherStations()).hasSize(1);
                    assertThat(alt.otherStations().get(0).station().id()).isEqualTo(2L);
                });
        verify(slots, never()).saveAll(anyList());                           // nothing was stored
    }

    @Test
    void createHold_databaseUniqueConstraintViolation_isMappedToSlotUnavailable() {
        // lock + check saw a free slot, but another transaction committed first: UNIQUE(point, slot) fires
        when(availability.occupiedSlots(any(), any(), any())).thenReturn(Map.of(11L, Set.<LocalDateTime>of()));
        when(slots.saveAll(anyList())).thenThrow(new DataIntegrityViolationException("Duplicate entry"));

        assertThatThrownBy(() -> service.createHold(actor, request()))
                .isInstanceOf(SlotUnavailableException.class);
    }

    // ------------------------------------------------------------------ confirm / wallet

    @Test
    void confirm_withWallet_debitsWalletAndCreatesInvoice() {
        Booking b = booking(BookingStatus.HOLD, START);
        b.setHoldExpiresAt(NOW.plusMinutes(3));
        when(bookings.findById(100L)).thenReturn(Optional.of(b));

        BookingDto dto = service.confirm(actor, 100L, PaymentMethod.WALLET);

        verify(wallets).debit(eq(5L), eq(new BigDecimal("400.00")), anyString());
        assertThat(dto.status()).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(dto.payment().invoiceNo()).isEqualTo("INV-2526-000123");
        assertThat(dto.payment().status()).isEqualTo(PaymentStatus.PAID);
    }

    @Test
    void confirm_withInsufficientWallet_throwsInsufficientBalance() {
        Booking b = booking(BookingStatus.HOLD, START);
        b.setHoldExpiresAt(NOW.plusMinutes(3));
        when(bookings.findById(100L)).thenReturn(Optional.of(b));
        when(wallets.debit(eq(5L), any(), anyString())).thenThrow(new InsufficientBalanceException("too low"));

        assertThatThrownBy(() -> service.confirm(actor, 100L, PaymentMethod.WALLET))
                .isInstanceOf(InsufficientBalanceException.class);
        verify(payments, never()).save(any(Payment.class));                  // no payment row without money
        assertThat(b.getStatus()).isEqualTo(BookingStatus.HOLD);
    }

    // ------------------------------------------------------------------ cancel / refund policy

    @Test
    void refundRule_fullRefundWhenSixtyMinutesOrMoreBeforeStart() {
        BigDecimal paid = new BigDecimal("400.00");
        assertThat(BookingService.refundFor(paid, NOW.plusHours(3), NOW)).isEqualByComparingTo("400.00");
        assertThat(BookingService.refundFor(paid, NOW.plusMinutes(60), NOW)).isEqualByComparingTo("400.00");   // boundary
    }

    @Test
    void refundRule_halfRefundWhenLessThanSixtyMinutesBeforeStart() {
        BigDecimal paid = new BigDecimal("400.00");
        assertThat(BookingService.refundFor(paid, NOW.plusMinutes(59), NOW)).isEqualByComparingTo("200.00");
        assertThat(BookingService.refundFor(paid, NOW.plusMinutes(10), NOW)).isEqualByComparingTo("200.00");
    }

    @Test
    void refundIfCancelled_unpaidHoldRefundsNothing() {
        Booking b = booking(BookingStatus.HOLD, START);
        when(payments.findByBookingId(100L)).thenReturn(Optional.empty());

        assertThat(service.refundIfCancelled(b, NOW)).isEqualByComparingTo("0");
    }

    @Test
    void cancel_earlyGivesFullWalletRefundAndReleasesSlots() {
        Booking b = booking(BookingStatus.CONFIRMED, NOW.plusHours(3));
        Payment pay = payment(b, PaymentMethod.WALLET);
        when(bookings.findById(100L)).thenReturn(Optional.of(b));
        when(payments.findByBookingId(100L)).thenReturn(Optional.of(pay));

        BookingDto dto = service.cancel(actor, 100L, "Plans changed");

        verify(wallets).credit(eq(5L), eq(new BigDecimal("400.00")), eq(WalletTxnType.REFUND), anyString());
        verify(slots).deleteByBookingId(100L);
        verify(events).publishEvent(any(SlotsReleasedEvent.class));          // waitlist gets its chance
        assertThat(dto.status()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(pay.getStatus()).isEqualTo(PaymentStatus.REFUNDED);
        assertThat(pay.getRefundedAmount()).isEqualByComparingTo("400.00");
    }

    @Test
    void cancel_lateGivesHalfRefund() {
        Booking b = booking(BookingStatus.CONFIRMED, NOW.plusMinutes(30));
        Payment pay = payment(b, PaymentMethod.WALLET);
        when(bookings.findById(100L)).thenReturn(Optional.of(b));
        when(payments.findByBookingId(100L)).thenReturn(Optional.of(pay));

        service.cancel(actor, 100L, null);

        verify(wallets).credit(eq(5L), eq(new BigDecimal("200.00")), eq(WalletTxnType.REFUND), anyString());
        assertThat(pay.getStatus()).isEqualTo(PaymentStatus.PART_REFUND);
        assertThat(pay.getRefundedAmount()).isEqualByComparingTo("200.00");
    }

    // ------------------------------------------------------------------ scheduler jobs

    @Test
    void expireHolds_expiresUnpaidHoldsAndFreesSlots() {
        Booking b = booking(BookingStatus.HOLD, START);
        b.setHoldExpiresAt(NOW.minusMinutes(1));
        when(bookings.findByStatusAndHoldExpiresAtBefore(BookingStatus.HOLD, NOW)).thenReturn(List.of(b));

        int n = service.expireHolds();

        assertThat(n).isEqualTo(1);
        assertThat(b.getStatus()).isEqualTo(BookingStatus.EXPIRED);
        verify(slots).deleteByBookingId(100L);
        verify(events).publishEvent(any(SlotsReleasedEvent.class));
    }

    @Test
    void markNoShows_keepsTwentyFivePercentRefundsRestAndCountsNoShow() {
        Booking b = booking(BookingStatus.CONFIRMED, NOW.minusMinutes(30));  // started 30 min ago, never checked in
        Payment pay = payment(b, PaymentMethod.WALLET);
        when(bookings.findByStatusAndStartTimeBefore(BookingStatus.CONFIRMED, NOW.minusMinutes(15)))
                .thenReturn(List.of(b));
        when(payments.findByBookingId(100L)).thenReturn(Optional.of(pay));

        int n = service.markNoShows();

        assertThat(n).isEqualTo(1);
        assertThat(b.getStatus()).isEqualTo(BookingStatus.NO_SHOW);
        verify(wallets).credit(eq(5L), eq(new BigDecimal("300.00")), eq(WalletTxnType.REFUND), anyString());   // 75 %
        assertThat(pay.getRefundedAmount()).isEqualByComparingTo("300.00");                                     // 25 % kept
        assertThat(pay.getStatus()).isEqualTo(PaymentStatus.PART_REFUND);
        assertThat(user.getNoShowCount()).isEqualTo(1);
        verify(slots, never()).deleteByBookingId(100L);                       // slots stay occupied
    }

    // ------------------------------------------------------------------ fixtures

    private CreateBookingRequest request() {
        return new CreateBookingRequest(7L, 11L, null, START, 20, 80, BookingSource.WEB);
    }

    private static EstimateResponse estimate() {
        return new EstimateResponse(14.0, 50.0, 40, 2, new BigDecimal("18.00"), new BigDecimal("400.00"), 5.0, 100.0,
                "NORMAL", BigDecimal.ONE);
    }

    private Booking booking(BookingStatus status, LocalDateTime start) {
        Booking b = new Booking();
        b.setId(100L);
        b.setBookingCode("VSL-TEST22");
        b.setUser(user);
        b.setVehicle(vehicle);
        b.setChargingPoint(point);
        b.setStation(station);
        b.setStartTime(start);
        b.setEndTime(start.plusMinutes(60));
        b.setSlots(2);
        b.setStatus(status);
        b.setSource(BookingSource.WEB);
        b.setSocStart(20);
        b.setSocTarget(80);
        b.setEstEnergyKwh(14.0);
        b.setEstCost(new BigDecimal("400.00"));
        b.setCreatedAt(NOW.minusHours(1));
        return b;
    }

    private Payment payment(Booking b, PaymentMethod method) {
        Payment p = new Payment();
        p.setId(123L);
        p.setBooking(b);
        p.setAmount(new BigDecimal("400.00"));
        p.setMethod(method);
        p.setStatus(PaymentStatus.PAID);
        p.setInvoiceNo("INV-2526-000123");
        p.setRefundedAmount(BigDecimal.ZERO);
        p.setPaidAt(NOW.minusHours(1));
        return p;
    }

    private RecommendationResponse recommendations() {
        StationSummaryDto other = new StationSummaryDto(2L, "Other Station", "Addr", "Powai", "Mumbai", 19.1, 72.9,
                StationTier.STANDARD, 1L, "VoltGrid", 3.0, List.of(), 2, 2, BigDecimal.TEN, 4.0, 10, 80.0, "POSITIVE",
                true, 0, 24, 1, 20.0, "LOW");
        RecommendedItem item = new RecommendedItem(1, 90.0, other, null, 8, NOW, START, START.plusHours(1), 2, 0, 40,
                BigDecimal.TEN, BigDecimal.ONE, 20.0, "LOW", Map.of(), List.of(), List.of());
        return new RecommendationResponse(NOW, null, null, 14.0, List.of(item), null, null);
    }
}
