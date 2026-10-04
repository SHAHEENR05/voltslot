package com.chargeiq.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.chargeiq.dto.BookingDtos.EstimateResponse;
import com.chargeiq.entity.ChargingPoint;
import com.chargeiq.entity.PricingBand;
import com.chargeiq.entity.VehicleModel;
import com.chargeiq.entity.enums.CurrentType;
import com.chargeiq.entity.enums.VehicleCategory;
import com.chargeiq.exception.BadRequestException;
import com.chargeiq.repository.PricingBandRepository;

/**
 * Charging time / energy / cost calculator.
 * <p>
 * This is the single place where the physics and the tariff rules live, so the booking engine, the
 * recommendation engine, the fleet scheduler and the trip planner all give identical numbers. The formulas are
 * the ones in the shared specification (and in the Python data generator):
 * <pre>
 *   acceptedKw  = min(point kW, vehicle AC/DC limit)            (0 = incompatible)
 *   wallEnergy  = (target-start)/100 * battery / 0.92           (92 % charging efficiency)
 *   taper       : up to 80 % SoC at acceptedKw, above 80 % at 40 % of acceptedKw
 *   duration    = ceil(hours*60) + 3 min handshake ; slots = ceil(duration/30)
 *   tariff      = point tariff * time-of-day multiplier (OFFPEAK .85 / NORMAL 1.0 / PEAK 1.2)
 *   cost        = round(wallEnergy * effective tariff, 2)
 * </pre>
 * The 24 pricing bands are read lazily from the database once and cached; if a row is missing the documented
 * constants are used, so the service also works with an empty table (e.g. in unit tests).
 */
@Service
@Transactional
public class EstimatorService {

    /** Vehicle data the estimator needs. Built from a {@link VehicleModel} or, when only connectors are known, generically. */
    public record VehicleSpec(double batteryKwh, double acMaxKw, double dcMaxKw, double kmPerKwh,
                              VehicleCategory category, Set<String> connectorCodes) { }

    private static final double CHARGE_EFFICIENCY = 0.92;
    private static final double TAPER_FACTOR = 0.4;
    private static final int TAPER_FROM_SOC = 80;
    private static final int HANDSHAKE_MINUTES = 3;
    private static final int SLOT_MINUTES = 30;

    private final PricingBandRepository pricingBands;

    // Lazy cache of the 24 hourly bands. 'multipliers' is written last so a non-null value means both arrays are ready.
    private volatile BigDecimal[] multipliers;
    private volatile String[] bandNames;

    public EstimatorService(PricingBandRepository pricingBands) {
        this.pricingBands = pricingBands;
    }

    /** Converts a catalogue vehicle model into the lightweight spec used for calculations. */
    public static VehicleSpec specOf(VehicleModel m) {
        Set<String> codes = m.getConnectors().stream()
                .map(ct -> ct.getCode())
                .collect(Collectors.toSet());
        return new VehicleSpec(m.getBatteryKwh(), m.getAcMaxKw(), m.getDcMaxKw(), m.getKmPerKwh(), m.getCategory(), codes);
    }

    /** A "typical car" used when the caller only tells us which connectors it can use. */
    public static VehicleSpec genericSpec(Collection<String> connectorCodes) {
        Set<String> codes = new HashSet<>();
        if (connectorCodes != null) {
            for (String c : connectorCodes) {
                if (c != null && !c.isBlank()) {
                    codes.add(c.trim().toUpperCase(Locale.ROOT));
                }
            }
        }
        return new VehicleSpec(40.0, 7.4, 50.0, 6.0, VehicleCategory.CAR, codes);
    }

    /** Power the vehicle can really draw from this point; 0 when the connector does not match. */
    public double acceptedKw(VehicleSpec v, ChargingPoint p) {
        String code = p.getConnectorType().getCode();
        if (code == null || !v.connectorCodes().contains(code)) {
            return 0.0;
        }
        double vehicleLimit = p.getConnectorType().getCurrentType() == CurrentType.AC ? v.acMaxKw() : v.dcMaxKw();
        return Math.max(0.0, Math.min(p.getPowerKw(), vehicleLimit));
    }

    public boolean compatible(VehicleSpec v, ChargingPoint p) {
        return acceptedKw(v, p) > 0.0;
    }

    /**
     * Full estimate for charging {@code socStart -> socTarget} on a point.
     *
     * @param start planned start time; {@code null} means "no time known" and the neutral NORMAL band (x1.0) is used
     * @throws BadRequestException when the vehicle cannot use the point or the SoC range is invalid
     */
    public EstimateResponse estimate(VehicleSpec v, ChargingPoint p, LocalDateTime start, int socStart, int socTarget) {
        if (socStart < 0 || socTarget > 100 || socTarget <= socStart) {
            throw new BadRequestException("socTarget must be greater than socStart (both between 0 and 100)");
        }
        double kw = acceptedKw(v, p);
        if (kw <= 0.0) {
            throw new BadRequestException("This vehicle cannot charge at the selected point (connector not compatible)");
        }

        // Energy drawn from the wall (battery energy / efficiency).
        double wallEnergy = (socTarget - socStart) / 100.0 * v.batteryKwh() / CHARGE_EFFICIENCY;

        // Taper: fast up to 80 %, slow (40 % of accepted power) above.
        double energyTo80 = Math.max(0, Math.min(socTarget, TAPER_FROM_SOC) - socStart) / 100.0 * v.batteryKwh() / CHARGE_EFFICIENCY;
        double energyAbove = Math.max(0, socTarget - Math.max(socStart, TAPER_FROM_SOC)) / 100.0 * v.batteryKwh() / CHARGE_EFFICIENCY;
        double hours = energyTo80 / kw + energyAbove / (TAPER_FACTOR * kw);

        int durationMin = (int) Math.ceil(hours * 60) + HANDSHAKE_MINUTES;
        int slots = (int) Math.ceil(durationMin / (double) SLOT_MINUTES);

        BigDecimal mult = start == null ? BigDecimal.ONE : multiplier(start.getHour());
        String band = start == null ? "NORMAL" : bandName(start.getHour());
        BigDecimal effective = p.getTariffPerKwh().multiply(mult);
        BigDecimal cost = BigDecimal.valueOf(wallEnergy).multiply(effective).setScale(2, RoundingMode.HALF_UP);

        double kmAdded = (socTarget - socStart) / 100.0 * v.batteryKwh() * v.kmPerKwh();
        double co2 = kmAdded * co2Factor(v.category());

        return new EstimateResponse(round2(wallEnergy), kw, durationMin, slots,
                effective.setScale(2, RoundingMode.HALF_UP), cost, round2(co2), round2(kmAdded), band, mult);
    }

    /** Time-of-day tariff multiplier for an hour 0..23. */
    public BigDecimal multiplier(int hourOfDay) {
        ensureBands();
        return multipliers[Math.floorMod(hourOfDay, 24)];
    }

    /** Band label (OFFPEAK / NORMAL / PEAK) for an hour 0..23. */
    public String bandName(int hourOfDay) {
        ensureBands();
        return bandNames[Math.floorMod(hourOfDay, 24)];
    }

    // ------------------------------------------------------------------ helpers

    /** Loads the bands once; hours without a DB row keep the documented default. */
    private void ensureBands() {
        if (multipliers != null) {
            return;
        }
        synchronized (this) {
            if (multipliers != null) {
                return;
            }
            BigDecimal[] m = new BigDecimal[24];
            String[] n = new String[24];
            for (int h = 0; h < 24; h++) {
                m[h] = defaultMultiplier(h);
                n[h] = defaultBand(h);
            }
            for (PricingBand b : pricingBands.findAll()) {
                Integer h = b.getHourOfDay();
                if (h != null && h >= 0 && h < 24 && b.getMultiplier() != null) {
                    m[h] = b.getMultiplier();
                    if (b.getBandName() != null) {
                        n[h] = b.getBandName();
                    }
                }
            }
            bandNames = n;
            multipliers = m;
        }
    }

    private static String defaultBand(int h) {
        if (h >= 18 && h <= 21) {
            return "PEAK";
        }
        if (h >= 6 && h <= 17) {
            return "NORMAL";
        }
        return "OFFPEAK";
    }

    private static BigDecimal defaultMultiplier(int h) {
        switch (defaultBand(h)) {
            case "PEAK":
                return new BigDecimal("1.20");
            case "NORMAL":
                return new BigDecimal("1.00");
            default:
                return new BigDecimal("0.85");
        }
    }

    /** Tail-pipe CO2 avoided per km by driving electric, by vehicle category. */
    private static double co2Factor(VehicleCategory c) {
        if (c == VehicleCategory.TWO_WHEELER) {
            return 0.04;
        }
        if (c == VehicleCategory.THREE_WHEELER) {
            return 0.08;
        }
        if (c == VehicleCategory.LCV) {
            return 0.22;
        }
        return 0.12;
    }

    private static double round2(double x) {
        return BigDecimal.valueOf(x).setScale(2, RoundingMode.HALF_UP).doubleValue();
    }
}
