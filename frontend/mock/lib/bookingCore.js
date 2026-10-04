// Booking engine shared by routes/bookings.js and routes/waitlist.js (and usable by any other mock module).
//   state.bookings  : array of FULL BookingDto-shaped records (+ userId). Other modules may push HOLD bookings into it.
//   state.bookedSlots: Set of `${pointId}|${slotStartIso}` -> shows as BOOKED in /availability (see lib/availability.js).
// Business rules mirror backend/service/BookingService.java (hold 5 min, refund >= 60 min 100 % else 50 %, check-in +-15 min,
// no-show keeps 25 %, max 5 active future bookings, 14 day horizon, 30-minute grid).
const state = require('./state');
const { HttpError, MIN, HOUR, DAY, parseNaive, toNaive, floorTo, round, hourOf } = require('./util');
const { estimate, compatible, acceptedKw } = require('./estimator');
const { slotState, SLOT } = require('./availability');

const HOLD_MINUTES = 5;
const WAITLIST_HOLD_MINUTES = 10;
const FULL_REFUND_MINUTES = 60;
const CHECK_IN_WINDOW = 15;
const MAX_ACTIVE_FUTURE = 5;
const HORIZON_DAYS = 14;
const LIVE = ['HOLD', 'CONFIRMED', 'CHECKED_IN'];
const PAY_METHODS = ['WALLET', 'UPI', 'CARD'];

/** hooks other modules (waitlist) register: fn({stationId, pointId, fromMs, toMs}) after slots are released */
const releaseHooks = [];

state.waitlist = state.waitlist || [];
state.reviewedBookings = state.reviewedBookings || new Set();

// ---------------------------------------------------------------------------------------------------------------- helpers
const keyOf = (pointId, ms) => `${pointId}|${toNaive(ms)}`;
const startMsOf = (b) => parseNaive(b.startTime);
const endMsOf = (b) => parseNaive(b.endTime);
const money = (n) => round(Number(n), 2);

function code() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = 'VSL-'; for (let i = 0; i < 6; i++) c += A[Math.floor(Math.random() * A.length)];
  return state.bookings.some((b) => b.bookingCode === c) ? code() : c;
}
const invoiceNo = () => `INV-2026-${String(state.nextId('invoice', 4400)).padStart(6, '0')}`;

function occupy(b) { for (let i = 0; i < b.slots; i++) state.bookedSlots.add(keyOf(b.point.id, startMsOf(b) + i * SLOT)); }
function release(b, notify = true) {
  for (let i = 0; i < b.slots; i++) state.bookedSlots.delete(keyOf(b.point.id, startMsOf(b) + i * SLOT));
  if (notify) releaseHooks.forEach((h) => { try { h({ stationId: b.station.id, pointId: b.point.id, fromMs: startMsOf(b), toMs: endMsOf(b) }); } catch (e) { console.error('release hook', e); } });
}

const refundFor = (paid, startMs, nowMs) => round(Number(paid) * (nowMs + FULL_REFUND_MINUTES * MIN <= startMs ? 1 : 0.5), 2);
const inCheckInWindow = (b, nowMs) => nowMs >= startMsOf(b) - CHECK_IN_WINDOW * MIN && nowMs <= startMsOf(b) + CHECK_IN_WINDOW * MIN;

const stationRef = (st) => ({ id: st.summary.id, name: st.summary.name, zone: st.summary.zone, address: st.summary.address, latitude: st.summary.latitude, longitude: st.summary.longitude });
const pointRef = (p) => ({ id: p.id, label: p.label, connectorCode: p.connectorCode, powerKw: p.powerKw, tariffPerKwh: p.tariffPerKwh });
const vehicleRef = (v) => ({ id: v.id, nickname: v.nickname || null, regNumber: v.regNumber, make: v.make, model: v.model });

/** vehicle the user may book for (own vehicles; fleet managers: fleet vehicles). 404 otherwise (like requireVehicle). */
function vehicleOf(u, id) {
  const v = state.vehicles.find((x) => x.id === Number(id) && (u.role === 'FLEET_MANAGER' ? x.fleetId === u.fleetId : x.ownerId === u.id || u.role === 'ADMIN'));
  if (!v) throw new HttpError(404, `Vehicle ${id} not found`);
  return v;
}

// ---------------------------------------------------------------------------------------------------------------- DTO
/** BookingDto for the API: derived fields (canCancel / canCheckIn / refundIfCancelled / qrPayload) are computed at read time. */
function publicDto(b) {
  const now = state.nowMs();
  const canCancel = b.status === 'HOLD' || b.status === 'CONFIRMED';
  const canCheckIn = b.status === 'CONFIRMED' && inCheckInWindow(b, now);
  const paid = b.payment && b.payment.status === 'PAID' ? b.payment.amount : 0;
  const { userId, ...rest } = b;
  return {
    ...rest,
    holdExpiresAt: b.status === 'HOLD' ? b.holdExpiresAt : b.holdExpiresAt ?? null,
    checkedInAt: b.checkedInAt ?? null, cancelledAt: b.cancelledAt ?? null, cancelReason: b.cancelReason ?? null,
    payment: b.payment ?? null, session: b.session ?? null,
    canCancel, canCheckIn,
    refundIfCancelled: canCancel && paid ? refundFor(paid, startMsOf(b), now) : 0,
    qrPayload: `VSL|${b.bookingCode}|${b.id}`,
  };
}

// ---------------------------------------------------------------------------------------------------------------- clock driven transitions
function creditWallet(userId, amount, ref) { if (amount > 0) state.addTxn(userId, 'REFUND', amount, ref); }

function complete(b, socEndOrNull) {
  const socEnd = socEndOrNull || b.socTarget;
  if (socEnd <= b.socStart) throw new HttpError(400, `Final charge must be higher than the starting charge (${b.socStart}%)`);
  const v = state.vehicles.find((x) => x.id === b.vehicle.id), fp = state.findPoint(b.point.id);
  const est = estimate({ vehicle: v, point: fp.point, socStart: b.socStart, socTarget: socEnd, startMs: startMsOf(b) });
  const startedAt = b.checkedInAt || b.startTime;
  b.session = { startedAt, endedAt: toNaive(parseNaive(startedAt) + est.durationMinutes * MIN), energyKwh: est.energyKwh, socEnd, amount: est.estimatedCost, co2AvoidedKg: est.co2AvoidedKg };
  if (b.payment && est.estimatedCost < b.payment.amount) {
    const diff = money(b.payment.amount - est.estimatedCost);
    if (b.payment.method === 'WALLET') creditWallet(b.userId, diff, `REFUND ${b.bookingCode} (final bill)`);
    b.payment.amount = est.estimatedCost;
  }
  b.status = 'COMPLETED';
  state.addNotification(b.userId, { type: 'CHARGE_COMPLETE', title: 'Charging complete', message: `You charged ${est.energyKwh.toFixed(1)} kWh at ${b.station.name} (${b.socStart}% to ${socEnd}%). CO2 avoided: ${est.co2AvoidedKg.toFixed(1)} kg. Bill: ₹${est.estimatedCost}.`, payload: JSON.stringify({ bookingId: b.id }) });
  return b;
}

/** Applies everything the real JobScheduler does against the app clock: expire holds, mark no-shows, auto-complete sessions, expire waitlist. */
function sweep() {
  const now = state.nowMs();
  for (const b of state.bookings) {
    if (b.status === 'HOLD' && b.holdExpiresAt && parseNaive(b.holdExpiresAt) <= now) { b.status = 'EXPIRED'; release(b); }
    else if (b.status === 'CONFIRMED' && now > startMsOf(b) + CHECK_IN_WINDOW * MIN) {
      let refund = 0;
      if (b.payment && b.payment.status === 'PAID') {
        refund = round(b.payment.amount * 0.75, 2);
        if (b.payment.method === 'WALLET') creditWallet(b.userId, refund, `REFUND ${b.bookingCode} (no-show, 25% retained)`);
        b.payment.refundedAmount = refund; b.payment.status = 'PART_REFUND';
      }
      b.status = 'NO_SHOW';
      const u = state.findUser(b.userId); if (u) u.noShowCount = (u.noShowCount || 0) + 1;
      state.addNotification(b.userId, { type: 'NO_SHOW', title: 'Missed booking', message: `You did not arrive for booking ${b.bookingCode} at ${b.station.name}. A 25% fee was retained.`, payload: JSON.stringify({ bookingId: b.id }) });
    } else if (b.status === 'CHECKED_IN' && endMsOf(b) <= now) { try { complete(b, null); } catch (e) { /* ignore */ } }
  }
  for (const w of state.waitlist) if (w.status === 'WAITING' && parseNaive(w.desiredStart) < now) w.status = 'EXPIRED';
}

// ---------------------------------------------------------------------------------------------------------------- availability / candidates
function slotsFree(st, p, startMs, n) {
  const s = st.summary;
  for (let i = 0; i < n; i++) {
    const t = startMs + i * SLOT;
    const h = hourOf(t);
    if (h < s.openHour || h >= s.closeHour) return false;
    if (slotState(st, p, t) !== 'FREE') return false;
  }
  return true;
}
const insideHours = (st, startMs, n) => { for (let i = 0; i < n; i++) { const h = hourOf(startMs + i * SLOT); if (h < st.summary.openHour || h >= st.summary.closeHour) return false; } return true; };

function candidatePoints(st, pointOrNull, vehicle) {
  if (pointOrNull) {
    if (!compatible(vehicle, pointOrNull)) throw new HttpError(400, `This vehicle cannot charge on connector ${pointOrNull.connectorCode}`);
    if (pointOrNull.status !== 'ACTIVE') throw new HttpError(400, `Charging point ${pointOrNull.label} is not active`);
    return [pointOrNull];
  }
  const list = st.points.filter((p) => p.status === 'ACTIVE' && compatible(vehicle, p))
    .sort((a, b) => acceptedKw(vehicle, b) - acceptedKw(vehicle, a) || a.tariffPerKwh - b.tariffPerKwh || a.id - b.id);
  if (!list.length) throw new HttpError(400, `No active charging point at ${st.summary.name} is compatible with this vehicle`);
  return list;
}

function alternatives(vehicle, st, startMs, socStart, socTarget) {
  const now = floorTo(state.nowMs(), SLOT);
  const cands = st.points.filter((p) => p.status === 'ACTIVE' && compatible(vehicle, p));
  const need = new Map(cands.map((p) => [p.id, estimate({ vehicle, point: p, socStart, socTarget, startMs }).slots]));
  const opts = [];
  for (let t = Math.max(now, startMs - 3 * HOUR); t <= startMs + 3 * HOUR; t += SLOT) {
    for (const p of cands) if (slotsFree(st, p, t, need.get(p.id))) opts.push({ pointId: p.id, label: p.label, start: toNaive(t) });
  }
  opts.sort((a, b) => Math.abs(parseNaive(a.start) - startMs) - Math.abs(parseNaive(b.start) - startMs) || a.pointId - b.pointId);
  let other = [];
  try {
    const { recommend } = require('../routes/recommendations');
    const res = recommend({ latitude: st.summary.latitude, longitude: st.summary.longitude, vehicleId: vehicle.id, arrivalTime: toNaive(startMs), socStart, socTarget, limit: 6 });
    other = res.items.filter((i) => i.station.id !== st.summary.id).slice(0, 3);
  } catch (e) { /* alternatives are best effort */ }
  return { sameStation: opts.slice(0, 6), otherStations: other };
}

// ---------------------------------------------------------------------------------------------------------------- create HOLD
function createHold({ user, vehicle, point, station, startTime, socStart, socTarget, source = 'WEB', holdMinutes = HOLD_MINUTES }) {
  sweep();
  const nowMs = state.nowMs();
  const startMs = parseNaive(startTime);
  if (Number.isNaN(startMs)) throw new HttpError(400, 'Malformed JSON request or invalid value in the request body');
  if (startMs % SLOT !== 0) throw new HttpError(400, 'Start time must be on a 30-minute boundary (:00 or :30)');
  if (startMs < floorTo(nowMs, SLOT)) throw new HttpError(400, 'Start time is in the past');
  if (startMs > nowMs + HORIZON_DAYS * DAY) throw new HttpError(400, `Bookings can be made at most ${HORIZON_DAYS} days ahead`);
  if (socTarget <= socStart) throw new HttpError(400, 'Target charge must be higher than the current charge');

  const cands = candidatePoints(station, point, vehicle);
  const est = new Map(cands.map((p) => [p.id, estimate({ vehicle, point: p, socStart, socTarget, startMs })]));
  if (!cands.some((p) => insideHours(station, startMs, est.get(p.id).slots))) {
    throw new HttpError(400, `The session does not fit into the opening hours of ${station.summary.name} (${station.summary.openHour}:00 - ${station.summary.closeHour}:00)`);
  }
  const first = est.get(cands[0].id);
  const firstEnd = startMs + first.slots * SLOT;
  if (state.bookings.some((b) => b.vehicle.id === vehicle.id && LIVE.includes(b.status) && startMsOf(b) < firstEnd && endMsOf(b) > startMs)) {
    throw new HttpError(409, 'This vehicle already has a booking that overlaps this time');
  }
  if (user.role !== 'FLEET_MANAGER' && state.bookings.filter((b) => b.userId === user.id && LIVE.includes(b.status) && startMsOf(b) > nowMs).length >= MAX_ACTIVE_FUTURE) {
    throw new HttpError(400, `You already have ${MAX_ACTIVE_FUTURE} active upcoming bookings. Complete or cancel one first.`);
  }
  const chosen = cands.find((p) => slotsFree(station, p, startMs, est.get(p.id).slots));
  if (!chosen) throw new HttpError(409, 'This slot is no longer available', { alternatives: alternatives(vehicle, station, startMs, socStart, socTarget) });

  const e = est.get(chosen.id);
  const b = {
    id: state.nextId('booking'), userId: user.id, bookingCode: code(), status: 'HOLD', source,
    startTime: toNaive(startMs), endTime: toNaive(startMs + e.slots * SLOT), slots: e.slots,
    station: stationRef(station), point: pointRef(chosen), vehicle: vehicleRef(vehicle),
    socStart, socTarget, estEnergyKwh: e.energyKwh, estCost: e.estimatedCost,
    holdExpiresAt: toNaive(nowMs + holdMinutes * MIN), checkedInAt: null, cancelledAt: null, cancelReason: null,
    createdAt: toNaive(nowMs), payment: null, session: null,
  };
  state.bookings.push(b); occupy(b);
  return b;
}

// ---------------------------------------------------------------------------------------------------------------- seed demo data
function seed() {
  const u = state.findUser(4); if (!u || state.bookings.some((b) => b.userId === 4)) return;
  const now = state.nowMs();
  const own = state.vehicles.filter((x) => x.ownerId === 4);
  const demoVeh = { 1: own.find((x) => /Nexon/.test(x.model)) || own[0], 2: own.find((x) => /Ather/.test(x.model)) || own[1] || own[0] };
  const mk = ({ stationId, vehicleId, pointLabel, startIso, socStart, socTarget, status, method = 'UPI', codeStr, createdOffsetH = 30, createdIso }) => {
    const st = state.findStation(stationId), v = demoVeh[vehicleId];
    const p = st.points.find((x) => x.label === pointLabel);
    const startMs = parseNaive(startIso), e = estimate({ vehicle: v, point: p, socStart, socTarget, startMs });
    const b = {
      id: state.nextId('booking'), userId: 4, bookingCode: codeStr || code(), status, source: 'WEB',
      startTime: toNaive(startMs), endTime: toNaive(startMs + e.slots * SLOT), slots: e.slots, station: stationRef(st), point: pointRef(p), vehicle: vehicleRef(v),
      socStart, socTarget, estEnergyKwh: e.energyKwh, estCost: e.estimatedCost, holdExpiresAt: null, checkedInAt: null, cancelledAt: null, cancelReason: null,
      createdAt: createdIso || toNaive(startMs - createdOffsetH * HOUR), payment: { amount: e.estimatedCost, method, status: 'PAID', invoiceNo: invoiceNo(), refundedAmount: 0 }, session: null,
    };
    if (status === 'COMPLETED') {
      b.checkedInAt = toNaive(startMs + 4 * MIN);
      b.session = { startedAt: b.checkedInAt, endedAt: toNaive(startMs + 4 * MIN + e.durationMinutes * MIN), energyKwh: e.energyKwh, socEnd: socTarget, amount: e.estimatedCost, co2AvoidedKg: e.co2AvoidedKg };
    }
    state.bookings.push(b);
    if (startMs >= now - HOUR) occupy(b);
    return b;
  };
  // 5 past COMPLETED (newest first by time)
  mk({ stationId: 3, vehicleId: 1, pointLabel: 'DC-2', startIso: '2026-10-01T20:30:00', socStart: 40, socTarget: 67, status: 'COMPLETED', method: 'WALLET', codeStr: 'VSL-5R2N8D' });
  mk({ stationId: 2, vehicleId: 1, pointLabel: 'DC-1', startIso: '2026-09-27T19:30:00', socStart: 10, socTarget: 42, status: 'COMPLETED', method: 'WALLET', codeStr: 'VSL-7K3M9X' });
  mk({ stationId: 1, vehicleId: 1, pointLabel: 'DC-2', startIso: '2026-09-22T08:00:00', socStart: 22, socTarget: 80, status: 'COMPLETED', method: 'CARD' });
  mk({ stationId: 6, vehicleId: 1, pointLabel: state.findStation(6).points.find((p) => p.currentType === 'DC' && p.connectorCode === 'CCS2').label, startIso: '2026-09-16T13:00:00', socStart: 25, socTarget: 75, status: 'COMPLETED', method: 'UPI' });
  mk({ stationId: 9, vehicleId: 2, pointLabel: state.findStation(9).points.find((p) => p.connectorCode === 'LECCS')?.label || 'DC-1', startIso: '2026-09-10T11:30:00', socStart: 12, socTarget: 90, status: 'COMPLETED', method: 'UPI' });
  // 2 upcoming CONFIRMED (on the Ather so the Nexon's recharge reminder stays active)
  const ather = (id) => { const st = state.findStation(id); return st.points.find((p) => p.connectorCode === 'LECCS'); };
  const at3 = ather(3), at2 = ather(2);
  mk({ stationId: 3, vehicleId: 2, pointLabel: at3.label, startIso: '2026-10-03T19:30:00', socStart: 20, socTarget: 85, status: 'CONFIRMED', method: 'WALLET', createdIso: '2026-10-02T21:10:00' });
  mk({ stationId: 2, vehicleId: 2, pointLabel: at2.label, startIso: '2026-10-05T08:00:00', socStart: 15, socTarget: 80, status: 'CONFIRMED', method: 'UPI', createdIso: '2026-10-03T07:45:00' });
}

module.exports = {
  HOLD_MINUTES, WAITLIST_HOLD_MINUTES, LIVE, PAY_METHODS, releaseHooks, keyOf, startMsOf, endMsOf, money, invoiceNo,
  occupy, release, refundFor, inCheckInWindow, vehicleOf, publicDto, sweep, complete, createHold, alternatives, slotsFree, creditWallet, stationRef, vehicleRef, seed,
};
