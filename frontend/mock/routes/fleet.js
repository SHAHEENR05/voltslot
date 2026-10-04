// Fleet manager mock: GET /api/fleet/overview, POST /api/fleet/schedule, POST /api/fleet/schedule/apply
const state = require('../lib/state');
const { HttpError, fieldErrors, parseNaive, toNaive, haversine, round, hourOf, dowOf, hashStr, mulberry32, MIN, HOUR, DAY } = require('../lib/util');
const { estimate, compatible } = require('../lib/estimator');
const { slotState, SLOT } = require('../lib/availability');

const LIVE = ['HOLD', 'CONFIRMED', 'CHECKED_IN'];
const stationRef = (st) => ({ id: st.summary.id, name: st.summary.name, zone: st.summary.zone, address: st.summary.address, latitude: st.summary.latitude, longitude: st.summary.longitude });

/** Builds a BookingDto-shaped record (+ userId) and registers its slots in state.bookedSlots. */
function makeBooking({ user, vehicle, station, point, startMs, socStart, socTarget, source = 'FLEET', status = 'CONFIRMED', est }) {
  const e = est || estimate({ vehicle, point, socStart, socTarget, startMs });
  const endMs = startMs + e.slots * SLOT;
  const code = 'VSL-' + hashStr(`${vehicle.id}|${point.id}|${startMs}|${state.nextId('bkcode')}`).toString(36).toUpperCase().slice(0, 6).padStart(6, 'X');
  const rec = {
    id: state.nextId('booking'), userId: user.id, bookingCode: code, status, source, startTime: toNaive(startMs), endTime: toNaive(endMs), slots: e.slots,
    station: stationRef(station), point: { id: point.id, label: point.label, connectorCode: point.connectorCode, powerKw: point.powerKw, tariffPerKwh: point.tariffPerKwh },
    vehicle: { id: vehicle.id, nickname: vehicle.nickname, regNumber: vehicle.regNumber, make: vehicle.make, model: vehicle.model },
    socStart, socTarget, estEnergyKwh: e.energyKwh, estCost: e.estimatedCost, holdExpiresAt: null, checkedInAt: null, cancelledAt: null, cancelReason: null, createdAt: state.now(),
    payment: { amount: e.estimatedCost, method: 'WALLET', status: 'PAID', invoiceNo: 'INV-' + code.slice(4), refundedAmount: 0 },
    session: null, canCancel: status === 'CONFIRMED', canCheckIn: false, refundIfCancelled: e.estimatedCost, qrPayload: code,
  };
  for (let t = startMs; t < endMs; t += SLOT) state.bookedSlots.add(`${point.id}|${toNaive(t)}`);
  state.bookings.push(rec);
  return rec;
}

// ---------------------------------------------------------------- overview
const fleetVehicles = (fleetId) => state.vehicles.filter((v) => v.fleetId === fleetId);
const publicVehicle = (v) => { const { ownerId: _o, ...rest } = v; return rest; };

/** deterministic history per vehicle: cadence in days, last charge, next due -> prediction state */
function predictionOf(v, nowMs) {
  const rng = mulberry32(hashStr('pred' + v.id));
  const cadenceDays = 1.5 + rng() * 2.5;
  const lastMs = nowMs - Math.round((0.4 + rng() * 3.6) * DAY);
  const nextDueMs = lastMs + Math.round(cadenceDays * DAY);
  const leadMs = 12 * HOUR;
  let st = 'UPCOMING';
  if (nextDueMs <= nowMs) st = 'OVERDUE'; else if (nextDueMs - nowMs <= leadMs) st = 'DUE_SOON';
  const noData = v.id % 11 === 0;
  return { lastMs, nextDueMs, state: noData ? 'NO_DATA' : st, noData, rng };
}

function overview(user) {
  if (!user.fleetId && user.role !== 'ADMIN') throw new HttpError(403, 'This account is not linked to a fleet');
  const fleetId = user.fleetId || 1;
  const nowMs = state.nowMs();
  const list = fleetVehicles(fleetId);
  const upcoming = state.bookings.filter((b) => LIVE.includes(b.status) && parseNaive(b.endTime) > nowMs && list.some((v) => v.id === b.vehicle.id)).sort((a, b) => parseNaive(a.startTime) - parseNaive(b.startTime));
  const nextBy = new Map();
  upcoming.forEach((b) => { if (!nextBy.has(b.vehicle.id)) nextBy.set(b.vehicle.id, b); });
  let sessions = 0, energy = 0, spend = 0;
  const rows = list.map((v, i) => {
    const p = predictionOf(v, nowMs);
    const s30 = 6 + Math.round(p.rng() * 9);
    const e30 = round(s30 * (v.batteryKwh * 0.55) , 1);
    sessions += s30; energy += e30; spend += e30 * 16.5;
    let nb = nextBy.get(v.id);
    if (!nb && i % 3 === 1) { // a few seeded upcoming bookings so the table is not empty
      const st = state.stations[(i * 5) % state.stations.length];
      nb = { bookingCode: 'VSL-FL' + String(40 + i * 3).padStart(2, '0') + 'X', startTime: toNaive(Math.ceil((nowMs + (5 + i) * HOUR) / SLOT) * SLOT), station: { name: st.summary.name } };
    }
    return {
      vehicle: publicVehicle(v), lastChargeAt: toNaive(p.lastMs), nextDueAt: p.noData ? null : toNaive(p.nextDueMs), predictionState: p.state,
      upcomingBookingCode: nb ? nb.bookingCode : null, upcomingStart: nb ? nb.startTime : null, upcomingStation: nb ? nb.station.name : null,
    };
  });
  const seeded = rows.filter((r) => r.upcomingBookingCode).length;
  return { fleetId, fleetName: user.fleetName || 'SwiftLogix Deliveries', vehicleCount: list.length, upcomingBookings: seeded, sessions30d: sessions, energy30dKwh: round(energy, 1), spend30d: round(spend, 2), vehicles: rows };
}

// ---------------------------------------------------------------- scheduler
function schedule(user, body) {
  const errs = [];
  if (!Array.isArray(body.vehicleIds) || !body.vehicleIds.length) errs.push(['vehicleIds', 'Select at least one vehicle']);
  if (!body.windowStart) errs.push(['windowStart', 'must not be null']);
  if (!body.windowEnd) errs.push(['windowEnd', 'must not be null']);
  if (errs.length) throw fieldErrors(errs);
  const ws = parseNaive(body.windowStart), we = parseNaive(body.windowEnd);
  if (!(we > ws)) throw new HttpError(400, 'windowEnd must be after windowStart');
  const socStart = body.socStart ?? 20, socTarget = body.socTarget ?? 80;
  if (socTarget <= socStart) throw new HttpError(400, 'socTarget must be higher than socStart');
  const preset = body.preset || 'BALANCED';
  const maxPer = body.maxPerStation > 0 ? body.maxPerStation : null;
  const lat = body.startLat ?? 19.076, lon = body.startLon ?? 72.8777;
  const nowMs = state.nowMs();

  const vehicles = [...new Set(body.vehicleIds)].map((id) => {
    const v = state.vehicles.find((x) => x.id === Number(id));
    if (!v) throw new HttpError(404, `Vehicle ${id} not found`);
    if (v.fleetId !== (user.fleetId || 1)) throw new HttpError(403, 'Vehicle does not belong to your fleet');
    return v;
  });
  const due = new Map(vehicles.map((v) => { const p = predictionOf(v, nowMs); return [v.id, p.noData ? Infinity : p.nextDueMs]; }));
  vehicles.sort((a, b) => due.get(a.id) - due.get(b.id) || a.id - b.id);

  const tentative = new Set(), perStation = new Map(), plan = [], unassigned = [];
  const label = (v) => `${v.nickname || v.model} · ${v.regNumber}`;
  vehicles.forEach((v, idx) => {
    let anyCompatible = false, anyFree = false, skippedLimit = false;
    const cands = [];
    for (const st of state.stations) {
      const s = st.summary;
      const dist = haversine(lat, lon, s.latitude, s.longitude);
      if (dist > 45) continue;
      if (maxPer && (perStation.get(s.id) || 0) >= maxPer) { skippedLimit = true; continue; }
      const eta = Math.ceil((dist * 1.35) / 24 * 60);
      const earliest = Math.max(ws, nowMs + eta * MIN);
      for (const p of st.points) {
        if (p.status !== 'ACTIVE' || !compatible(v, p)) continue;
        anyCompatible = true;
        const est0 = estimate({ vehicle: v, point: p, socStart, socTarget, startMs: earliest });
        let t = Math.ceil(earliest / SLOT) * SLOT;
        for (; t + est0.slots * SLOT <= we && t <= we - SLOT; t += SLOT) {
          let ok = true;
          for (let k = 0; k < est0.slots; k++) { const ts = t + k * SLOT; if (slotState(st, p, ts) !== 'FREE' || tentative.has(`${p.id}|${toNaive(ts)}`)) { ok = false; break; } }
          if (ok) { anyFree = true; const est = estimate({ vehicle: v, point: p, socStart, socTarget, startMs: t }); cands.push({ st, p, est, start: t, end: t + est.slots * SLOT, dist, ci: state.crowding(s.id, dowOf(t), hourOf(t)), wait: Math.max(0, Math.round((t - Math.ceil(earliest / SLOT) * SLOT) / MIN)) }); break; }
        }
      }
    }
    if (!cands.length) {
      let why = !anyCompatible ? 'No compatible active charging point within 45 km of the start location' : !anyFree ? 'Every compatible slot is booked or finishes after the window ends' : 'No slot available';
      if (skippedLimit) why += ' (stations at the per-station limit were skipped)';
      unassigned.push({ vehicleId: v.id, vehicleLabel: label(v), reason: why });
      return;
    }
    const W = { BALANCED: [1, 1, 1, 1], FASTEST: [0.4, 3, 0.3, 0.3], CHEAPEST: [0.3, 0.5, 0.3, 3], LEAST_CROWDED: [0.4, 0.5, 3, 0.3] }[preset] || [1, 1, 1, 1];
    const mx = (f) => Math.max(...cands.map(f)) || 1;
    const mDist = mx((c) => c.dist), mFin = mx((c) => c.end - ws), mCi = mx((c) => c.ci), mCost = mx((c) => c.est.estimatedCost);
    cands.forEach((c) => { c.score = W[0] * c.dist / mDist + W[1] * (c.end - ws) / mFin + W[2] * c.ci / mCi + W[3] * c.est.estimatedCost / mCost; });
    cands.sort((a, b) => a.score - b.score);
    const c = cands[0];
    for (let t = c.start; t < c.end; t += SLOT) tentative.add(`${c.p.id}|${toNaive(t)}`);
    perStation.set(c.st.summary.id, (perStation.get(c.st.summary.id) || 0) + 1);
    const dueTxt = due.get(v.id) === Infinity ? 'no prediction yet' : `due ${toNaive(due.get(v.id)).slice(5, 16).replace('T', ' ')}`;
    const why = [`Priority ${idx + 1} of ${vehicles.length} (${dueTxt})`];
    why.push(c.wait === 0 ? 'no wait' : `${c.wait} min wait`);
    why.push(`${c.p.powerKw} kW ${c.p.connectorCode}`);
    why.push(`${state.crowdingLevel(c.ci).toLowerCase()} crowding`);
    plan.push({
      vehicleId: v.id, vehicleLabel: label(v), stationId: c.st.summary.id, stationName: c.st.summary.name, pointId: c.p.id, pointLabel: c.p.label, connectorCode: c.p.connectorCode,
      slotStart: toNaive(c.start), slotEnd: toNaive(c.end), socStart, socTarget, estimatedCost: c.est.estimatedCost, waitMinutes: c.wait, reason: why.join(' · '),
    });
  });
  const total = plan.reduce((s, i) => s + i.estimatedCost, 0);
  const avgWait = plan.length ? Math.round(plan.reduce((s, i) => s + i.waitMinutes, 0) / plan.length * 10) / 10 : 0;
  return { plan, unassigned, totalCost: round(total, 2), avgWaitMinutes: avgWait, stationsUsed: new Set(plan.map((i) => i.stationId)).size };
}

function apply(user, body) {
  if (!Array.isArray(body.items) || !body.items.length) throw fieldErrors([['items', 'must not be empty']]);
  const created = [], failures = [];
  for (const it of body.items) {
    try {
      const v = state.vehicles.find((x) => x.id === Number(it.vehicleId));
      if (!v || v.fleetId !== (user.fleetId || 1)) throw new Error('Vehicle does not belong to your fleet');
      const found = state.findPoint(it.pointId);
      if (!found) throw new Error('Charging point not found');
      if (found.point.status !== 'ACTIVE') throw new Error('Charging point is not available');
      const startMs = parseNaive(it.slotStart);
      if (startMs < state.nowMs() - SLOT) throw new Error('Slot start is in the past');
      const est = estimate({ vehicle: v, point: found.point, socStart: it.socStart, socTarget: it.socTarget, startMs });
      if (!est) throw new Error('Vehicle cannot use this charging point');
      for (let k = 0; k < est.slots; k++) if (slotState(found.station, found.point, startMs + k * SLOT) === 'BOOKED') throw new Error('Slot was taken in the meantime');
      if (user.walletBalance < est.estimatedCost) throw new Error(`Insufficient wallet balance (₹${est.estimatedCost.toFixed(2)} needed, ₹${user.walletBalance.toFixed(2)} available)`);
      const b = makeBooking({ user, vehicle: v, station: found.station, point: found.point, startMs, socStart: it.socStart, socTarget: it.socTarget, est });
      state.addTxn(user.id, 'DEBIT', est.estimatedCost, `Booking ${b.bookingCode}`);
      created.push(b);
    } catch (e) { failures.push({ vehicleId: it.vehicleId, reason: e.message }); }
  }
  return { created: created.map(({ userId, ...b }) => b), failures };
}

module.exports = [
  { method: 'GET', pattern: '/api/fleet/overview', handler: ({ auth }) => overview(auth('FLEET_MANAGER', 'ADMIN')) },
  { method: 'POST', pattern: '/api/fleet/schedule', handler: ({ auth, body }) => schedule(auth('FLEET_MANAGER', 'ADMIN'), body) },
  { method: 'POST', pattern: '/api/fleet/schedule/apply', handler: ({ auth, body }) => apply(auth('FLEET_MANAGER', 'ADMIN'), body) },
];
module.exports.makeBooking = makeBooking;
