// Identical to the formulas in docs/spec/00_overview.md (EstimatorService).
const state = require('./state');
const { hourOf, round } = require('./util');

const CO2 = { CAR: 0.12, TWO_WHEELER: 0.04, THREE_WHEELER: 0.08, LCV: 0.22 };
const GENERIC = { id: null, batteryKwh: 40, acMaxKw: 7.2, dcMaxKw: 50, kmPerKwh: 7, category: 'CAR', connectorCodes: ['CCS2', 'TYPE2'] };

const bandOf = (hour) => state.ref.pricingBands.find((b) => b.hourOfDay === hour) || { bandName: 'NORMAL', multiplier: 1 };
const acceptedKw = (vehicle, point) => Math.min(point.powerKw, point.currentType === 'AC' ? vehicle.acMaxKw : vehicle.dcMaxKw);
const compatible = (vehicle, point) => vehicle.connectorCodes.includes(point.connectorCode) && acceptedKw(vehicle, point) > 0;

/** estimate({vehicle, point, socStart, socTarget, startMs}) -> same fields as POST /bookings/estimate */
function estimate({ vehicle, point, socStart = 20, socTarget = 80, startMs }) {
  const v = vehicle || GENERIC;
  const kw = acceptedKw(v, point);
  if (kw <= 0) return null;
  const wall = ((socTarget - socStart) / 100) * v.batteryKwh / 0.92;
  const e80 = Math.max(0, Math.min(socTarget, 80) - socStart) / 100 * v.batteryKwh / 0.92;
  const eAbove = Math.max(0, socTarget - Math.max(socStart, 80)) / 100 * v.batteryKwh / 0.92;
  const hours = e80 / kw + eAbove / (0.4 * kw);
  const durationMinutes = Math.ceil(hours * 60) + 3;
  const band = bandOf(hourOf(startMs));
  const effectiveTariff = round(point.tariffPerKwh * band.multiplier, 2);
  const kmAdded = ((socTarget - socStart) / 100) * v.batteryKwh * v.kmPerKwh;
  return {
    energyKwh: round(wall, 2), acceptedKw: kw, durationMinutes, slots: Math.ceil(durationMinutes / 30), effectiveTariff,
    estimatedCost: round(wall * effectiveTariff, 2), co2AvoidedKg: round(kmAdded * (CO2[v.category] || 0.12), 2), kmAdded: round(kmAdded, 1),
    bandName: band.bandName, multiplier: band.multiplier,
  };
}
module.exports = { estimate, acceptedKw, compatible, GENERIC, bandOf };
