// Smart recharge reminders: predictions per vehicle, ACTIVE reminder popups with a slot suggestion, snooze / dismiss / book / refresh / demo-trigger.
// Reminders are stored as RECHARGE_REMINDER rows in the shared `state.notifications` (status ACTIVE | SNOOZED | DISMISSED | DONE) exactly like the real backend.
const state = require('../lib/state');
const { HttpError, reply, fieldErrors, parseNaive, toNaive, round, hashStr, mulberry32, HOUR, DAY, MIN } = require('../lib/util');
const { recommend } = require('./recommendations');

const DEFAULT_HOME = { lat: 19.2183, lon: 72.9781 };

// ---- prediction "history" per vehicle (keyed by registration number so ids do not matter) -------------------------
// last = end of the last charge, median = typical cadence in days, intervals = last gaps (for the sparkline)
const DEMO = {
  'MH04 EV 2481': { last: '2026-09-27T19:00:00', median: 6.0, sessions: 9, conf: 0.82, kwh: 21.4, hour: 19, station: 3, intervals: [5.8, 6.3, 6.0, 5.6, 6.4, 6.1] },
  'MH04 EV 7710': { last: '2026-10-02T07:30:00', median: 3.5, sessions: 7, conf: 0.71, kwh: 2.6, hour: 7, station: 2, intervals: [3.2, 3.8, 3.5, 4.1, 3.0, 3.4] },
  'MH02 EV 1905': { last: '2026-09-30T21:00:00', median: 4.5, sessions: 6, conf: 0.66, kwh: 17.8, hour: 21, station: 6, intervals: [4.2, 4.9, 4.4, 4.8, 4.1, 4.6] },
  'MH43 EV 5533': { last: '2026-09-28T20:00:00', median: 4.0, sessions: 8, conf: 0.74, kwh: 26.3, hour: 20, station: 5, intervals: [3.8, 4.3, 4.0, 3.6, 4.4, 4.1] },
  'MH01 EV 0042': { last: '2026-09-29T18:00:00', median: 0, sessions: 2, conf: 0, kwh: 0, hour: 0, station: null, intervals: [3.1] },
};
const preds = new Map(); // vehicleId -> { lastMs, median, sessions, conf, kwh, hour, station, intervals, nextDueMs, noData }

function baseFor(v) {
  if (preds.has(v.id)) return preds.get(v.id);
  const d = DEMO[v.regNumber];
  let b;
  if (d) {
    b = { ...d, lastMs: parseNaive(d.last), noData: d.sessions < 3 };
  } else {
    // deterministic generated history (fleet vehicles etc.)
    const rnd = mulberry32(hashStr(v.regNumber));
    const median = round(1.2 + rnd() * 4, 1);
    const sessions = 2 + Math.floor(rnd() * 9);
    const frac = 0.35 + rnd() * 1.1; // how far through the cycle we are (>1 = overdue)
    const lastMs = Math.round((state.nowMs() - frac * median * DAY) / MIN) * MIN;
    const intervals = Array.from({ length: Math.min(6, sessions - 1) }, () => round(median * (0.8 + rnd() * 0.4), 2));
    b = { median, sessions, conf: round(Math.min(0.95, 0.4 + rnd() * 0.5) * Math.min(1, sessions / 6), 2), kwh: round(v.batteryKwh * (0.4 + rnd() * 0.25), 1), hour: 6 + Math.floor(rnd() * 16), station: 1 + Math.floor(rnd() * 32), intervals, lastMs, noData: sessions < 3 };
  }
  b.nextDueMs = b.noData ? null : b.lastMs + Math.round(b.median * DAY);
  preds.set(v.id, b);
  return b;
}

const vehiclesOf = (u) => state.vehicles.filter((v) => (u.role === 'FLEET_MANAGER' ? v.fleetId === u.fleetId : v.ownerId === u.id));
const label = (v) => `${v.make} ${v.model}${v.nickname ? ` "${v.nickname}"` : ''} · ${v.regNumber}`;
const hasLiveBooking = (vid) => state.bookings.some((b) => b.vehicle?.id === vid && ['HOLD', 'CONFIRMED', 'CHECKED_IN'].includes(b.status) && parseNaive(b.endTime) > state.nowMs());

function stateOf(b, u, nowMs) {
  if (b.noData || b.nextDueMs == null) return 'NO_DATA';
  if (nowMs > b.nextDueMs) return 'OVERDUE';
  if (nowMs >= b.nextDueMs - (u.reminderLeadHours || 12) * HOUR) return 'DUE_SOON';
  return 'UPCOMING';
}

function cadence(b) {
  // sparkline points: interval i ends on the date of session start i (walk back from the last session)
  const out = []; let t = b.lastMs;
  for (let i = b.intervals.length - 1; i >= 0; i--) { out.unshift({ date: toNaive(t).slice(0, 10), intervalDays: b.intervals[i] }); t -= Math.round(b.intervals[i] * DAY); }
  return out;
}

function prediction(v, u) {
  const b = baseFor(v), now = state.nowMs();
  const st = state.findStation(b.station);
  if (b.noData) {
    const fallback = round((v.rangeKm * 0.6) / (v.avgDailyKm || 40), 2);
    return { vehicleId: v.id, vehicleLabel: label(v), state: 'NO_DATA', lastChargeAt: toNaive(b.lastMs), medianIntervalDays: fallback, avgEnergyKwh: 0, preferredHour: 0, preferredStationId: null, preferredStationName: null, sessionsUsed: b.sessions, confidence: 0, nextDueAt: toNaive(b.lastMs + Math.round(fallback * DAY)), hoursUntilDue: 0, cadenceHistory: cadence(b), suggestion: null };
  }
  return {
    vehicleId: v.id, vehicleLabel: label(v), state: stateOf(b, u, now), lastChargeAt: toNaive(b.lastMs), medianIntervalDays: b.median, avgEnergyKwh: b.kwh,
    preferredHour: b.hour, preferredStationId: st?.summary.id ?? null, preferredStationName: st?.summary.name ?? null, sessionsUsed: b.sessions, confidence: b.conf,
    nextDueAt: toNaive(b.nextDueMs), hoursUntilDue: round((b.nextDueMs - now) / HOUR, 1), cadenceHistory: cadence(b), suggestion: null,
  };
}

// ---- slot suggestion (BALANCED recommendation around home, arriving at the preferred hour) ---------------------------
function buildSuggestion(u, v, b) {
  try {
    const now = state.nowMs();
    const pref = state.findStation(b.station);
    const home = u.homeLat != null && u.homeLon != null ? { lat: u.homeLat, lon: u.homeLon } : pref ? { lat: pref.summary.latitude, lon: pref.summary.longitude } : DEFAULT_HOME;
    const day = Math.max(b.nextDueMs, now);
    let wanted = Math.floor(day / DAY) * DAY + (b.hour || 19) * HOUR;
    const earliest = now + HOUR;
    if (wanted < earliest) wanted = earliest;
    const res = recommend({ latitude: home.lat, longitude: home.lon, vehicleId: v.id, socStart: 20, socTarget: 80, arrivalTime: toNaive(wanted), preset: 'BALANCED', limit: 4 });
    if (!res.items.length) return null;
    // prefer the driver's usual station when it is nearly as good as the winner
    let it = res.items[0];
    const usual = res.items.find((x) => x.station.id === b.station);
    if (usual && usual !== it && usual.score >= it.score - 6) it = usual;
    const reasons = it.reasons.slice(0, 2).join('; ');
    return {
      stationId: it.station.id, stationName: it.station.name, zone: it.station.zone, pointId: it.point.pointId, connectorCode: it.point.connectorCode,
      slotStart: it.slotStart, slotEnd: it.slotEnd, crowdingLevel: it.crowdingLevel, crowdingIndex: it.crowdingIndex, estimatedCost: it.estimatedCost,
      chargeMinutes: it.chargeMinutes, distanceKm: round(it.station.distanceKm ?? 0, 1), reason: `${it.station.id === b.station ? 'Your usual station. ' : 'Best overall match: '}${reasons}.`,
    };
  } catch (e) { return null; }
}

const inr0 = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
function messageFor(u, b, s) {
  const now = state.nowMs();
  const cad = Math.max(1, Math.round(b.median));
  const since = Math.floor((now - b.lastMs) / DAY);
  const sinceText = since <= 0 ? 'earlier today' : `${since} ${since === 1 ? 'day' : 'days'} ago`;
  const first = (u.fullName || 'there').trim().split(/\s+/)[0];
  let m = `You usually charge every ~${cad} ${cad === 1 ? 'day' : 'days'}. Your last charge was ${sinceText}. ${first}, `;
  if (!s) return m + 'open VoltSlot to find a free slot nearby.';
  const today = s.slotStart.slice(0, 10) === toNaive(now).slice(0, 10);
  const t = today ? `at ${s.slotStart.slice(11, 16)}` : `on ${new Date(parseNaive(s.slotStart)).toUTCString().slice(0, 11).replace(',', '')} at ${s.slotStart.slice(11, 16)}`;
  return `${m}${s.crowdingLevel === 'LOW' ? 'a quiet slot' : 'a slot'} is free at ${s.stationName} ${t} (${inr0(s.estimatedCost)}).`;
}

// ---- notification helpers ------------------------------------------------------------------------------------------------
const payloadOf = (n) => { try { return n.payload ? JSON.parse(n.payload) : {}; } catch { return {}; } };
const remindersOf = (u) => state.notifications.filter((n) => n.userId === u.id && n.type === 'RECHARGE_REMINDER');
const forVehicle = (u, vid) => remindersOf(u).filter((n) => payloadOf(n).vehicleId === vid);

// fix the foundation seed so its payloads reference real vehicle ids
for (const [uid, reg] of [[4, 'MH04 EV 2481'], [6, 'MH43 EV 5533']]) {
  const v = state.vehicles.find((x) => x.regNumber === reg);
  const n = state.notifications.find((x) => x.userId === uid && x.type === 'RECHARGE_REMINDER');
  if (v && n) {
    const b = baseFor(v);
    n.payload = JSON.stringify({ vehicleId: v.id, stationId: b.station, slotStart: null, dueAt: toNaive(b.nextDueMs) });
    n.createdAt = toNaive(Math.min(parseNaive(n.createdAt), b.nextDueMs - 1 * HOUR));
    if (uid === 6) { n.title = 'Time to recharge your ZS EV'; n.message = 'You usually charge every ~4 days. Your last charge was 4 days ago.'; }
    if (uid === 4) { n.title = 'Time to recharge your Nexon EV'; }
  }
}

function reactivateSnoozes(u) {
  const now = state.nowMs();
  remindersOf(u).forEach((n) => { if (n.status === 'SNOOZED' && n.snoozedUntil && parseNaive(n.snoozedUntil) <= now) { n.status = 'ACTIVE'; n.snoozedUntil = null; n.read = false; } });
}

/** the scheduler: raise a reminder for every due vehicle of this user. Returns the number created. */
function evaluate(u) {
  if (u.role !== 'USER' || !u.reminderEnabled) return 0;
  reactivateSnoozes(u);
  const now = state.nowMs(); let created = 0;
  for (const v of vehiclesOf(u)) {
    const b = baseFor(v);
    if (b.noData) continue;
    if (now < b.nextDueMs - (u.reminderLeadHours || 12) * HOUR || now > b.nextDueMs + 72 * HOUR) continue;
    if (hasLiveBooking(v.id)) continue;
    const existing = forVehicle(u, v.id);
    if (existing.some((n) => n.status === 'ACTIVE' || n.status === 'SNOOZED')) continue;
    if (existing.some((n) => n.status === 'DISMISSED' && payloadOf(n).lastChargeAt === toNaive(b.lastMs))) continue; // dismissed in this cycle
    const s = buildSuggestion(u, v, b);
    state.addNotification(u.id, { type: 'RECHARGE_REMINDER', status: 'ACTIVE', title: `Time to recharge your ${v.model}`, message: messageFor(u, b, s), payload: JSON.stringify({ vehicleId: v.id, stationId: s?.stationId ?? null, slotStart: s?.slotStart ?? null, dueAt: toNaive(b.nextDueMs), lastChargeAt: toNaive(b.lastMs) }) });
    created++;
  }
  return created;
}
state.runReminders = () => state.users.reduce((s, u) => s + evaluate(u), 0); // for the admin "Run reminders now" button

function activeFor(u) {
  evaluate(u);
  const out = [];
  for (const n of remindersOf(u).filter((x) => x.status === 'ACTIVE').sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const v = state.vehicles.find((x) => x.id === payloadOf(n).vehicleId);
    if (!v) continue;
    const b = baseFor(v);
    if (b.noData) continue;
    if (hasLiveBooking(v.id)) { n.status = 'DONE'; continue; }
    const s = buildSuggestion(u, v, b);
    const now = state.nowMs();
    out.push({
      notificationId: n.id, vehicle: { id: v.id, label: label(v), make: v.make, model: v.model }, dueAt: toNaive(b.nextDueMs), hoursUntilDue: round((b.nextDueMs - now) / HOUR, 1),
      overdue: now > b.nextDueMs, headline: `Time to recharge your ${v.model}`, message: messageFor(u, b, s), confidence: b.conf, medianIntervalDays: b.median, lastChargeAt: toNaive(b.lastMs), suggestion: s,
    });
  }
  return out;
}

const own = (u, id) => {
  const n = remindersOf(u).find((x) => x.id === Number(id));
  if (!n) throw new HttpError(404, 'Reminder not found');
  return n;
};
const handled = () => new HttpError(409, 'This reminder has already been handled');

const CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const bookingCode = (id) => { let h = hashStr('ciq' + id); let s = ''; for (let i = 0; i < 6; i++) { s += CODE[h % CODE.length]; h = Math.floor(h / CODE.length) || hashStr(s + id); } return `VSL-${s}`; };

module.exports = [
  { method: 'GET', pattern: '/api/reminders/predictions', handler: ({ auth }) => { const u = auth(); reactivateSnoozes(u); return vehiclesOf(u).map((v) => prediction(v, u)); } },
  { method: 'GET', pattern: '/api/reminders/active', handler: ({ auth }) => activeFor(auth()) },
  { method: 'POST', pattern: '/api/reminders/refresh', handler: ({ auth }) => { const u = auth(); evaluate(u); return { active: activeFor(u).length }; } },
  { method: 'POST', pattern: '/api/reminders/demo-trigger', handler: ({ auth, body }) => {
    const u = auth();
    if (!body.vehicleId) throw fieldErrors([['vehicleId', 'must not be null']]);
    const v = vehiclesOf(u).find((x) => x.id === Number(body.vehicleId));
    if (!v) throw new HttpError(404, 'Vehicle not found');
    const b = baseFor(v);
    if (b.noData) throw new HttpError(400, 'This vehicle needs at least 3 completed charging sessions before a recharge time can be predicted');
    if (!u.reminderEnabled) throw new HttpError(400, 'Recharge reminders are switched off in your profile');
    if (hasLiveBooking(v.id)) throw new HttpError(409, 'This vehicle already has an upcoming booking, so no reminder is needed');
    b.nextDueMs = state.nowMs();
    forVehicle(u, v.id).forEach((n) => {
      if (n.status === 'DISMISSED') n.status = 'DONE';
      else if (n.status === 'SNOOZED' || n.status === 'ACTIVE') { n.status = 'ACTIVE'; n.snoozedUntil = null; n.read = false; }
    });
    evaluate(u);
    return { message: 'Reminder triggered' };
  } },
  { method: 'POST', pattern: '/api/reminders/:id/snooze', handler: ({ auth, params, body }) => {
    const u = auth(); const n = own(u, params.id);
    const h = Number(body.hours);
    if (!h || h < 1 || h > 168) throw fieldErrors([['hours', 'must be between 1 and 168']]);
    if (n.status !== 'ACTIVE' && n.status !== 'SNOOZED') throw handled();
    n.status = 'SNOOZED'; n.snoozedUntil = toNaive(state.nowMs() + h * HOUR); n.read = true;
    return { message: `Reminder snoozed for ${h} hours` };
  } },
  { method: 'POST', pattern: '/api/reminders/:id/dismiss', handler: ({ auth, params }) => {
    const u = auth(); const n = own(u, params.id);
    n.status = 'DISMISSED'; n.snoozedUntil = null; n.read = true;
    const p = payloadOf(n); const v = state.vehicles.find((x) => x.id === p.vehicleId);
    if (v) { p.lastChargeAt = toNaive(baseFor(v).lastMs); n.payload = JSON.stringify(p); }
    return { message: 'Reminder dismissed' };
  } },
  { method: 'POST', pattern: '/api/reminders/:id/book', handler: ({ auth, params }) => {
    const u = auth(); const n = own(u, params.id);
    if (n.status !== 'ACTIVE' && n.status !== 'SNOOZED') throw handled();
    const v = state.vehicles.find((x) => x.id === payloadOf(n).vehicleId);
    if (!v) throw new HttpError(404, 'Vehicle for this reminder no longer exists');
    const b = baseFor(v);
    const s = buildSuggestion(u, v, b);
    if (!s) throw new HttpError(400, 'No suitable charging slot is available right now - please search manually');
    const found = state.findPoint(s.pointId);
    const st = found.station.summary, pt = found.point;
    const start = parseNaive(s.slotStart), end = parseNaive(s.slotEnd);
    const slots = Math.max(1, Math.round((end - start) / (30 * MIN)));
    const energy = round((60 / 100) * v.batteryKwh / 0.92, 2);
    const id = state.nextId('booking');
    const nowIso = state.now();
    const booking = {
      id, bookingCode: bookingCode(id), status: 'HOLD', source: 'REMINDER', startTime: s.slotStart, endTime: s.slotEnd, slots,
      station: { id: st.id, name: st.name, zone: st.zone, address: st.address, latitude: st.latitude, longitude: st.longitude },
      point: { id: pt.id, label: pt.label, connectorCode: pt.connectorCode, powerKw: pt.powerKw, tariffPerKwh: pt.tariffPerKwh },
      vehicle: { id: v.id, nickname: v.nickname, regNumber: v.regNumber, make: v.make, model: v.model },
      socStart: 20, socTarget: 80, estEnergyKwh: energy, estCost: s.estimatedCost, holdExpiresAt: toNaive(state.nowMs() + 5 * MIN),
      checkedInAt: null, cancelledAt: null, cancelReason: null, createdAt: nowIso, payment: null, session: null,
      canCancel: true, canCheckIn: false, refundIfCancelled: 0, qrPayload: `VSL|${bookingCode(id)}`, userId: u.id,
    };
    for (let i = 0; i < slots; i++) state.bookedSlots.add(`${pt.id}|${toNaive(start + i * 30 * MIN)}`);
    state.bookings.push(booking);
    n.status = 'DONE'; n.read = true;
    const { userId, ...dto } = booking;
    return reply(201, dto, { Location: `/api/bookings/${id}` });
  } },
];
