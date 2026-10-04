package com.chargeiq.service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.chargeiq.dto.ReferenceDtos.AmenityDto;
import com.chargeiq.dto.ReferenceDtos.ConnectorDto;
import com.chargeiq.dto.ReferenceDtos.PricingBandDto;
import com.chargeiq.dto.ReferenceDtos.VehicleModelDto;
import com.chargeiq.dto.ReferenceDtos.ZoneDto;
import com.chargeiq.entity.PricingBand;
import com.chargeiq.entity.VehicleModel;
import com.chargeiq.entity.enums.StationStatus;
import com.chargeiq.repository.AmenityRepository;
import com.chargeiq.repository.ConnectorTypeRepository;
import com.chargeiq.repository.PricingBandRepository;
import com.chargeiq.repository.StationRepository;
import com.chargeiq.repository.VehicleModelRepository;

/**
 * Read-only lookup data for the UI drop-downs: connector types, vehicle catalogue, amenities, city zones and the
 * time-of-day pricing bands. Everything is mapped to DTOs here so lazy collections are read inside the transaction.
 */
@Service
@Transactional(readOnly = true)
public class ReferenceService {

    private final ConnectorTypeRepository connectorRepo;
    private final VehicleModelRepository modelRepo;
    private final AmenityRepository amenityRepo;
    private final StationRepository stationRepo;
    private final PricingBandRepository bandRepo;

    public ReferenceService(ConnectorTypeRepository c, VehicleModelRepository m, AmenityRepository a,
                            StationRepository s, PricingBandRepository b) {
        this.connectorRepo = c;
        this.modelRepo = m;
        this.amenityRepo = a;
        this.stationRepo = s;
        this.bandRepo = b;
    }

    public List<ConnectorDto> connectors() {
        return connectorRepo.findAll().stream()
                .sorted(Comparator.comparing(ct -> ct.getCode()))
                .map(ct -> new ConnectorDto(ct.getId(), ct.getCode(), ct.getDisplayName(), ct.getCurrentType(), ct.getTypicalKw()))
                .collect(Collectors.toList());
    }

    /** Vehicle catalogue with the connector codes each model supports (sorted for a stable response). */
    public List<VehicleModelDto> vehicleModels() {
        List<VehicleModelDto> out = new ArrayList<>();
        for (VehicleModel m : modelRepo.findAllByOrderByMakeAscModelAsc()) {
            List<String> codes = m.getConnectors().stream()
                    .map(ct -> ct.getCode())
                    .sorted()
                    .collect(Collectors.toList());
            out.add(new VehicleModelDto(m.getId(), m.getMake(), m.getModel(), m.getVariant(), m.getCategory(),
                    m.getBatteryKwh(), m.getAcMaxKw(), m.getDcMaxKw(), m.getRangeKm(), m.getKmPerKwh(), codes));
        }
        return out;
    }

    public List<AmenityDto> amenities() {
        return amenityRepo.findAll().stream()
                .sorted(Comparator.comparing(a -> a.getName()))
                .map(a -> new AmenityDto(a.getId(), a.getName(), a.getIcon()))
                .collect(Collectors.toList());
    }

    /** City zones that have active stations, with the station count and the average coordinate (map centre). */
    public List<ZoneDto> zones() {
        List<ZoneDto> out = new ArrayList<>();
        // row = [zone, count, avgLatitude, avgLongitude]
        for (Object[] r : stationRepo.zoneSummary(StationStatus.ACTIVE)) {
            out.add(new ZoneDto((String) r[0], ((Number) r[1]).longValue(),
                    ((Number) r[2]).doubleValue(), ((Number) r[3]).doubleValue()));
        }
        return out;
    }

    /** The 24 hourly pricing bands; hours missing from the table fall back to the documented defaults. */
    public List<PricingBandDto> pricingBands() {
        PricingBand[] byHour = new PricingBand[24];
        for (PricingBand b : bandRepo.findAll()) {
            if (b.getHourOfDay() != null && b.getHourOfDay() >= 0 && b.getHourOfDay() < 24) {
                byHour[b.getHourOfDay()] = b;
            }
        }
        List<PricingBandDto> out = new ArrayList<>(24);
        for (int h = 0; h < 24; h++) {
            if (byHour[h] != null) {
                out.add(new PricingBandDto(h, byHour[h].getBandName(), byHour[h].getMultiplier()));
            } else if (h >= 18 && h <= 21) {
                out.add(new PricingBandDto(h, "PEAK", new BigDecimal("1.20")));
            } else if (h >= 6 && h <= 17) {
                out.add(new PricingBandDto(h, "NORMAL", new BigDecimal("1.00")));
            } else {
                out.add(new PricingBandDto(h, "OFFPEAK", new BigDecimal("0.85")));
            }
        }
        return out;
    }
}
