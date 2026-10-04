// POST /api/trips/plan - straight-line corridor planner (same model as TripPlannerService: road factor 1.3, 28/45 km/h blend, 10 % reserve).
const state = require('../lib/state');
const { HttpError, fieldErrors, haversine, round, parseNaive, toNaive, MIN } = require('../lib/util');
const { recommend } = require('./recommendations');
const { liveSummary } = require('../lib/stations');

const ROAD = 1.3, CITY_KMH = 28, HWY_KMH = 45, CITY_KM = 20, CORRIDOR_KM = 6, LO = 0.35, HI = 0.85, IDEAL = 0.6, MAX_STOPS = 6, MAX_TARGET = 80;
const driveMinutes = (road) => Math.ceil((Math.min(road, CITY_KM) / CITY_KMH + Math.max(0, road - CITY_KM) / HWY_KMH) * 60);
const usable = (range, soc, reserve) => Math.max(0, (range * (soc - reserve)) / 100);

/** [kmAlongLine, kmFromLine] of point p on the straight line a->b (local equirectangular projection). */
function project(aLat, aLon, bLat, bLon, pLat, pLon) {
  const kx = 111.32 * Math.cos(((aLat + bLat) / 2) * Math.PI / 180), ky = 110.57;
  const bx = (bLon - aLon) * kx, by = (bLat - aLat) * ky, px = (pLon - aLon) * kx, py = (pLat - aLat) * ky;
  const len = Math.hypot(bx, by) || 1e-9;
  const along = (px * bx + py * by) / len;
  const cross = Math.abs(px * by - py * bx) / len;
  return [along, cross];
}

function plan(req, user) {
  const errs = [];
  ['originLat', 'originLon', 'destLat', 'destLon'].forEach((k) => { if (typeof req[k] !== 'number') errs.push([k, 'must not be null']); });
  if (req.startSocPercent == null) errs.push(['startSocPercent', 'must not be null']);
  else if (req.startSocPercent < 5 || req.startSocPercent > 100) errs.push(['startSocPercent', 'must be between 5 and 100']);
  if (req.reserveSocPercent != null && (req.reserveSocPercent < 0 || req.reserveSocPercent > 40)) errs.push(['reserveSocPercent', 'must be between 0 and 40']);
  if (errs.length) throw fieldErrors(errs);

  const departMs = req.departAt ? parseNaive(req.departAt) : state.nowMs();
  const reserve = req.reserveSocPercent ?? 10, startSoc = req.startSocPercent;
  const notes = [];
  let vehicle = null, range = 250;
  if (req.vehicleId) {
    vehicle = state.vehicles.find((v) => v.id === Number(req.vehicleId));
    if (!vehicle || !user || (vehicle.ownerId !== user.id && !(user.role === 'FLEET_MANAGER' && vehicle.fleetId === user.fleetId))) throw new HttpError(404, 'Vehicle not found');
    range = vehicle.rangeKm;
    notes.push(`Vehicle: ${vehicle.make} ${vehicle.model} (range about ${range} km).`);
  } else notes.push('No vehicle selected - assuming a generic car with 250 km range and a CCS2 port.');

  const { originLat: oLat, originLon: oLon, destLat: dLat, destLon: dLon } = req;
  const straight = haversine(oLat, oLon, dLat, dLon);
  const totalRoad = straight * ROAD;
  const needsCharging = totalRoad > usable(range, startSoc, reserve);
  const polyline = [[oLat, oLon]], legs = [];
  const caps = vehicle ? vehicle.connectorCodes : ['CCS2'];

  // corridor stations with a compatible DC point
  const corridor = [];
  for (const st of state.stations) {
    const s = st.summary;
    const [along, cross] = project(oLat, oLon, dLat, dLon, s.latitude, s.longitude);
    if (cross > CORRIDOR_KM || along < 0 || along > straight) continue;
    const dcIds = st.points.filter((p) => p.status === 'ACTIVE' && p.currentType === 'DC' && caps.includes(p.connectorCode)).map((p) => p.id);
    if (dcIds.length) corridor.push({ id: s.id, along, dcIds });
  }

  let cLat = oLat, cLon = oLon, soc = startSoc, time = departMs, driving = 0, stops = 0, feasible = true, reached = false, arrivalSoc = 0;
  const driveLeg = (a, b, c, d, road, mins, s0, s1, t0) => ({ type: 'DRIVE', fromLat: a, fromLon: b, toLat: c, toLon: d, distanceKm: round(road, 1), durationMin: mins, socStart: Math.round(s0), socEnd: Math.round(s1), startTime: toNaive(t0), endTime: toNaive(t0 + mins * MIN), station: null, pointId: null, pointLabel: null, connectorCode: null, slotStart: null, slotEnd: null, crowdingLevel: null, estimatedCost: null });

  for (;;) {
    const remaining = haversine(cLat, cLon, dLat, dLon) * ROAD, reachable = usable(range, soc, reserve);
    if (remaining <= reachable) {
      const m = driveMinutes(remaining), end = Math.max(0, soc - (remaining / range) * 100);
      legs.push(driveLeg(cLat, cLon, dLat, dLon, remaining, m, soc, end, time));
      time += m * MIN; driving += m; arrivalSoc = Math.round(end); polyline.push([dLat, dLon]); reached = true; break;
    }
    if (reachable <= 0) { feasible = false; notes.push(`The starting charge (${startSoc} %) is at or below the ${reserve} % reserve, so no leg can be driven safely. Charge first or lower the reserve.`); break; }
    if (stops >= MAX_STOPS) { feasible = false; notes.push(`More than ${MAX_STOPS} charging stops would be needed - trip not planned.`); break; }
    const posAlong = project(oLat, oLon, dLat, dLon, cLat, cLon)[0];
    const reachStraight = reachable / ROAD;
    const lo = posAlong + LO * reachStraight, hi = Math.min(posAlong + HI * reachStraight, straight);
    const inWin = corridor.filter((c) => c.along >= lo && c.along <= hi);
    if (!inWin.length) { feasible = false; notes.push(`No compatible DC fast-charging station within ${CORRIDOR_KM} km of the route between ${Math.round(lo)} and ${Math.round(hi)} km (straight-line, measured from the origin). Start with a higher charge or pick another route.`); break; }
    const idealAlong = Math.min(posAlong + IDEAL * reachStraight, straight);
    const frac = straight <= 0 ? 0 : idealAlong / straight;
    const iLat = oLat + (dLat - oLat) * frac, iLon = oLon + (dLon - oLon) * frac;
    const toIdealRoad = Math.max(0, (idealAlong - posAlong) * ROAD);
    const arrSocEst = Math.max(1, Math.min(99, Math.round(soc - (toIdealRoad / range) * 100)));
    const remAfter = Math.max(0, (straight - idealAlong) * ROAD);
    const needed = Math.ceil(reserve + (remAfter / range) * 100 + 5);
    const target = Math.min(100, Math.max(arrSocEst + 10, Math.min(MAX_TARGET, needed)));
    const arrivalAtIdeal = time + driveMinutes(toIdealRoad) * MIN;
    const ids = new Set(inWin.map((c) => c.id)), byId = new Map(inWin.map((c) => [c.id, c]));
    const res = recommend({ latitude: iLat, longitude: iLon, vehicleId: vehicle?.id, connectorCodes: vehicle ? undefined : ['CCS2'], arrivalTime: toNaive(arrivalAtIdeal), socStart: arrSocEst, socTarget: target, preset: 'BALANCED', radiusKm: Math.max(25, reachStraight * 0.5 + CORRIDOR_KM + 5), limit: 30 });
    const items = res.items.filter((it) => ids.has(it.station.id));
    const chosen = items.find((it) => byId.get(it.station.id).dcIds.includes(it.point.pointId)) || items[0];
    if (!chosen) { feasible = false; notes.push('Stations exist near the route but none has a free compatible slot for the expected arrival time.'); break; }

    const sLat = chosen.station.latitude, sLon = chosen.station.longitude;
    const legRoad = haversine(cLat, cLon, sLat, sLon) * ROAD, legMin = driveMinutes(legRoad);
    const socAt = Math.max(1, soc - (legRoad / range) * 100);
    legs.push(driveLeg(cLat, cLon, sLat, sLon, legRoad, legMin, soc, socAt, time));
    time += legMin * MIN; driving += legMin;
    const slotStart = parseNaive(chosen.slotStart);
    const chargeStart = slotStart < time ? time : slotStart, chargeEnd = chargeStart + chosen.chargeMinutes * MIN;
    const full = state.findStation(chosen.station.id);
    legs.push({ type: 'CHARGE', fromLat: sLat, fromLon: sLon, toLat: sLat, toLon: sLon, distanceKm: 0, durationMin: chosen.chargeMinutes, socStart: Math.round(socAt), socEnd: target, startTime: toNaive(chargeStart), endTime: toNaive(chargeEnd), station: liveSummary(full, oLat, oLon), pointId: chosen.point.pointId, pointLabel: chosen.point.label, connectorCode: chosen.point.connectorCode, slotStart: chosen.slotStart, slotEnd: chosen.slotEnd, crowdingLevel: chosen.crowdingLevel, estimatedCost: chosen.estimatedCost });
    stops++;
    notes.push(`Stop ${stops}: ${chosen.station.name} (${chosen.station.zone}), ${chosen.point.label} ${chosen.point.connectorCode} ${Math.round(chosen.point.powerKw)} kW, charge to ${target} %${chosen.waitMinutes > 0 ? `, expect about ${chosen.waitMinutes} min wait for a free slot` : ', no waiting'}, crowding ${chosen.crowdingLevel}.`);
    time = chargeEnd; soc = target; cLat = sLat; cLon = sLon; polyline.push([sLat, sLon]);
  }
  if (!needsCharging) notes.push(`Destination is within usable range (${Math.round(usable(range, startSoc, reserve))} km at ${startSoc} % with a ${reserve} % reserve) - no charging stop needed.`);
  if (reached) notes.push(`Expected arrival battery: about ${arrivalSoc} %.`);
  notes.push(`Approximate straight-line corridor: road distance is estimated as ${ROAD} x the straight-line distance and speeds blend 28 km/h city with 45 km/h highway; a real navigation app may differ.`);
  return { distanceKm: round(totalRoad, 1), drivingMinutes: driving, needsCharging, feasible, arrivalSocPercent: reached ? arrivalSoc : 0, departAt: toNaive(departMs), arriveAt: reached ? toNaive(time) : null, legs, polyline, notes };
}

module.exports = [
  { method: 'POST', pattern: '/api/trips/plan', handler: ({ body, user }) => plan(body, user) },
];
