package com.chargeiq.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.chargeiq.dto.BookingDtos.EstimateResponse;
import com.chargeiq.entity.ChargingPoint;
import com.chargeiq.entity.ConnectorType;
import com.chargeiq.entity.PricingBand;
import com.chargeiq.entity.VehicleModel;
import com.chargeiq.entity.enums.CurrentType;
import com.chargeiq.entity.enums.VehicleCategory;
import com.chargeiq.exception.BadRequestException;
import com.chargeiq.repository.PricingBandRepository;

/** Pure unit tests (no Spring): the estimator formulas of the specification, hand-calculated. */
class EstimatorServiceTest {

    private PricingBandRepository bandRepo;
    private EstimatorService estimator;
    /** 40 kWh car: AC 7.4 kW, DC 50 kW, 6 km/kWh, CCS2 + TYPE2. */
    private EstimatorService.VehicleSpec car;

    @BeforeEach
    void setUp() {
        bandRepo = mock(PricingBandRepository.class);       // findAll() -> empty list => documented default bands
        estimator = new EstimatorService(bandRepo);
        car = new EstimatorService.VehicleSpec(40.0, 7.4, 50.0, 6.0, VehicleCategory.CAR, Set.of("CCS2", "TYPE2"));
    }

    private static ChargingPoint point(String code, CurrentType type, double kw, String tariff) {
        ConnectorType ct = new ConnectorType();
        ct.setCode(code);
        ct.setDisplayName(code);
        ct.setCurrentType(type);
        ct.setTypicalKw(kw);
        ChargingPoint p = new ChargingPoint();
        p.setId(1L);
        p.setConnectorType(ct);
        p.setPowerKw(kw);
        p.setTariffPerKwh(new BigDecimal(tariff));
        return p;
    }

    @Test
    void acceptedPowerIsLimitedByVehicleAndZeroWhenConnectorMissing() {
        // DC 60 kW charger, car accepts max 50 kW DC
        assertEquals(50.0, estimator.acceptedKw(car, point("CCS2", CurrentType.DC, 60, "18.00")), 1e-9);
        // AC 22 kW charger, car accepts max 7.4 kW AC
        assertEquals(7.4, estimator.acceptedKw(car, point("TYPE2", CurrentType.AC, 22, "10.00")), 1e-9);
        // charger slower than the car limit
        assertEquals(25.0, estimator.acceptedKw(car, point("CCS2", CurrentType.DC, 25, "18.00")), 1e-9);
        // connector the car does not have
        ChargingPoint chademo = point("CHADEMO", CurrentType.DC, 50, "16.00");
        assertEquals(0.0, estimator.acceptedKw(car, chademo), 1e-9);
        assertFalse(estimator.compatible(car, chademo));
        assertTrue(estimator.compatible(car, point("CCS2", CurrentType.DC, 60, "18.00")));
    }

    @Test
    void estimateTwentyToEightyAtPeakHour() {
        ChargingPoint p = point("CCS2", CurrentType.DC, 60, "18.00");
        // 19:00 is PEAK (x1.2)
        EstimateResponse e = estimator.estimate(car, p, LocalDateTime.of(2026, 10, 3, 19, 0), 20, 80);

        // wall energy = 0.6 * 40 / 0.92 = 26.087 kWh ; hours = 26.087/50 = 0.5217 -> 31.3 min -> ceil 32 + 3 = 35 min -> 2 slots
        assertEquals(26.09, e.energyKwh(), 0.005);
        assertEquals(50.0, e.acceptedKw(), 1e-9);
        assertEquals(35, e.durationMinutes());
        assertEquals(2, e.slots());
        assertEquals("PEAK", e.bandName());
        assertEquals(0, new BigDecimal("1.20").compareTo(e.multiplier()));
        assertEquals(new BigDecimal("21.60"), e.effectiveTariff());
        // cost = 26.0869565 * 21.60 = 563.48
        assertEquals(new BigDecimal("563.48"), e.estimatedCost());
        // km added = 0.6 * 40 * 6 = 144 ; CO2 = 144 * 0.12 = 17.28
        assertEquals(144.0, e.kmAdded(), 0.005);
        assertEquals(17.28, e.co2AvoidedKg(), 0.005);
    }

    @Test
    void taperAboveEightyPercentIsSlower() {
        ChargingPoint p = point("CCS2", CurrentType.DC, 60, "18.00");
        // 20 -> 100: energy_to_80 = 26.087 kWh @50 kW = 0.5217 h ; energy_above = 8.696 kWh @20 kW = 0.4348 h
        // total 0.9565 h = 57.39 min -> 58 + 3 = 61 min -> 3 slots
        EstimateResponse e = estimator.estimate(car, p, null, 20, 100);
        assertEquals(61, e.durationMinutes());
        assertEquals(3, e.slots());
        assertEquals(34.78, e.energyKwh(), 0.005);
        // taper makes 80->100 (20 points) much slower than 60->80 (also 20 points)
        EstimateResponse flat = estimator.estimate(car, p, null, 60, 80);
        EstimateResponse tail = estimator.estimate(car, p, null, 80, 100);
        assertTrue(tail.durationMinutes() > flat.durationMinutes());
    }

    @Test
    void nullStartMeansNormalBandAndMultiplierOne() {
        EstimateResponse e = estimator.estimate(car, point("CCS2", CurrentType.DC, 60, "18.00"), null, 20, 80);
        assertEquals("NORMAL", e.bandName());
        assertEquals(0, BigDecimal.ONE.compareTo(e.multiplier()));
        assertEquals(new BigDecimal("18.00"), e.effectiveTariff());
    }

    @Test
    void defaultPricingBands() {
        assertEquals("OFFPEAK", estimator.bandName(23));
        assertEquals("OFFPEAK", estimator.bandName(0));
        assertEquals("OFFPEAK", estimator.bandName(5));
        assertEquals("NORMAL", estimator.bandName(6));
        assertEquals("NORMAL", estimator.bandName(17));
        assertEquals("PEAK", estimator.bandName(18));
        assertEquals("PEAK", estimator.bandName(21));
        assertEquals("OFFPEAK", estimator.bandName(22));
        assertEquals(0, new BigDecimal("0.85").compareTo(estimator.multiplier(2)));
        assertEquals(0, new BigDecimal("1.20").compareTo(estimator.multiplier(20)));
    }

    @Test
    void databaseBandsOverrideDefaultsAndMissingHoursFallBack() {
        PricingBand b = new PricingBand();
        b.setHourOfDay(12);
        b.setBandName("SPECIAL");
        b.setMultiplier(new BigDecimal("2.00"));
        when(bandRepo.findAll()).thenReturn(List.of(b));
        EstimatorService fresh = new EstimatorService(bandRepo);
        assertEquals("SPECIAL", fresh.bandName(12));
        assertEquals(0, new BigDecimal("2.00").compareTo(fresh.multiplier(12)));
        assertEquals("PEAK", fresh.bandName(19)); // hour without a DB row -> default
    }

    @Test
    void incompatibleOrInvalidInputIsRejected() {
        ChargingPoint chademo = point("CHADEMO", CurrentType.DC, 50, "16.00");
        assertThrows(BadRequestException.class, () -> estimator.estimate(car, chademo, null, 20, 80));
        ChargingPoint ok = point("CCS2", CurrentType.DC, 60, "18.00");
        assertThrows(BadRequestException.class, () -> estimator.estimate(car, ok, null, 80, 60));
        assertThrows(BadRequestException.class, () -> estimator.estimate(car, ok, null, 20, 120));
    }

    @Test
    void specFactories() {
        ConnectorType ccs = new ConnectorType();
        ccs.setCode("CCS2");
        VehicleModel m = new VehicleModel();
        m.setBatteryKwh(30.0);
        m.setAcMaxKw(3.3);
        m.setDcMaxKw(0.0);
        m.setKmPerKwh(7.0);
        m.setCategory(VehicleCategory.TWO_WHEELER);
        m.setConnectors(Set.of(ccs));
        EstimatorService.VehicleSpec s = EstimatorService.specOf(m);
        assertEquals(30.0, s.batteryKwh());
        assertEquals(VehicleCategory.TWO_WHEELER, s.category());
        assertEquals(Set.of("CCS2"), s.connectorCodes());

        EstimatorService.VehicleSpec g = EstimatorService.genericSpec(List.of("ccs2", "TYPE2"));
        assertEquals(40.0, g.batteryKwh());
        assertEquals(7.4, g.acMaxKw());
        assertEquals(50.0, g.dcMaxKw());
        assertEquals(6.0, g.kmPerKwh());
        assertEquals(VehicleCategory.CAR, g.category());
        assertEquals(Set.of("CCS2", "TYPE2"), g.connectorCodes());
    }
}
