// Operator console mock: dashboard, stations CRUD (in memory, shared with the locator), points CRUD/status, day schedule, walk-in.
const state = require('../lib/state');
const { HttpError, reply, fieldErrors, parseNaive, toNaive, dateOf, hashStr, mulberry32, round, MIN, HOUR, DAY } = require('../lib/util');
const { estimate, compatible } = require('../lib/estimator');
const { slotState, dayGrid, SLOT } = require('../lib/availability');
const { liveSummary } = require('../lib/stations');
const { makeBooking } = require('./fleet');

const LIVE = ['HOLD', 'CONFIRMED', 'CHECKED_IN'];
const operatorOf = (u) => {
  if (u.role === 'ADMIN') return null;
  if (!u.operatorId) throw new HttpError(403, 'This account is not linked to an operator');
  return u.operatorId;
};
const mine = (u) => { const op = operatorOf(u); return state.stations.filter((s) => op === null || s.summary.operatorId === op); };
const requireStation = (u, id) => {
  const st = state.findStation(id);
  if (!st) throw new HttpError(404, `Station ${id} not found`);
  const op = operatorOf(u);
  if (op !== null && st.summary.operatorId !== op) throw new HttpError(403, 'This station belongs to another operator');
  return st;
};
const requirePoint = (u, id) => {
  const f = state.findPoint(id);
  if (!f) throw new HttpError(404, `Charging point ${id} not found`);
  requireStation(u, f.station.summary.id);
  return f;
};
const connectorById = (id) => state.ref.connectors.find((c) => c.id === Number(id));

function refreshSummary(st) {
  const s = st.summary;
  const by = new Map();
  st.points.forEach((p) => { const e = by.get(p.connectorCode) || { code: p.connectorCode, count: 0, maxKw: 0 }; e.count++; e.maxKw = Math.max(e.maxKw, p.powerKw); by.set(p.connectorCode, e); });
  s.connectors = [...by.values()];
  s.totalPoints = st.points.length;
  s.activePoints = st.points.filter((p) => p.status === 'ACTIVE').length;
  s.minTariff = st.points.length ? Math.min(...st.points.map((p) => p.tariffPerKwh)) : 0;
}

// ---------------------------------------------------------------- schedule generation
const NAMES = ['Aarav Mehta', 'Priya Nair', 'Rahul Deshmukh', 'Sneha Iyer', 'Kabir Shah', 'Meera Pillai', 'Vikram Rao', 'Ananya Joshi', 'Rohan Kulkarni', 'Isha Kapoor', 'Arjun Patil', 'Nisha Menon'];
const SOURCES = ['WEB', 'WEB', 'REMINDER', 'TRIP', 'WEB', 'FLEET'];

/** bookings of one date for a point -> ScheduleBookingRow[] (real records from state.bookings + deterministic background demand) */
function pointRows(st, p, date) {
  const dayStart = parseNaive(date), dayEnd = dayStart + DAY, now = state.nowMs();
  const rows = [], covered = new Array(48).fill(false);
  state.bookings.filter((b) => b.point?.id === p.id && ['HOLD', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'NO_SHOW'].includes(b.status)).forEach((b) => {
    const s = parseNaive(b.startTime), e = parseNaive(b.endTime);
    if (s >= dayEnd || e <= dayStart) return;
    if (s >= dayStart) { for (let t = Math.max(s, dayStart); t < Math.min(e, dayEnd); t += SLOT) covered[Math.floor((t - dayStart) / SLOT)] = true; }
    const u = state.findUser(b.userId);
    rows.push({ bookingId: b.id, bookingCode: b.bookingCode, status: b.status, start: b.startTime, end: b.endTime, vehicle: b.vehicle.nickname ? `${b.vehicle.regNumber} (${b.vehicle.nickname})` : b.vehicle.regNumber, userName: u?.fullName || 'Customer', source: b.source });
  });
  if (p.status === 'ACTIVE') {
    const g = dayGrid(st, p, date);
    let i = 0;
    while (i < 48) {
      if (!g[i] || covered[i]) { i++; continue; }
      let j = i; while (j < 48 && g[j] && !covered[j]) j++;
      const s = dayStart + i * SLOT, e = dayStart + j * SLOT;
      const h = hashStr(`${p.id}|${s}`);
      let status = 'CONFIRMED';
      if (e <= now) status = h % 17 === 0 ? 'NO_SHOW' : 'COMPLETED'; else if (s <= now) status = 'CHECKED_IN';
      const reg = `MH${String(1 + (h % 48)).padStart(2, '0')} EV ${String(1000 + (h % 8999))}`;
      rows.push({ bookingId: 900000 + (h % 90000), bookingCode: 'VSL-' + h.toString(36).toUpperCase().slice(0, 6), status, start: toNaive(s), end: toNaive(e), vehicle: reg, userName: NAMES[h % NAMES.length], source: SOURCES[h % SOURCES.length] });
      i = j;
    }
  }
  return rows.sort((a, b) => parseNaive(a.start) - parseNaive(b.start));
}

function stationSchedule(st, date) {
  return { stationId: st.summary.id, stationName: st.summary.name, date, points: st.points.map((p) => ({ pointId: p.id, label: p.label, connectorCode: p.connectorCode, powerKw: p.powerKw, status: p.status, bookings: pointRows(st, p, date) })) };
}

function dashboard(u) {
  const list = mine(u);
  const today = dateOf(state.nowMs()), now = state.nowMs();
  let bookingsToday = 0, inProgress = 0, upcoming = 0, revenue = 0, energy = 0, points = 0, active = 0;
  const live = list.map((st) => {
    const s = liveSummary(st);
    let busy = 0;
    st.points.forEach((p) => {
      points++; if (p.status === 'ACTIVE') active++;
      pointRows(st, p, today).forEach((r) => {
        bookingsToday++;
        const sMs = parseNaive(r.start), eMs = parseNaive(r.end);
        if (r.status === 'CHECKED_IN') inProgress++;
        if (r.status === 'CONFIRMED' && sMs > now) upcoming++;
        if (r.status === 'COMPLETED') { const kwh = round(((eMs - sMs) / HOUR) * Math.min(p.powerKw, 40) * 0.55, 1); energy += kwh; revenue += kwh * p.tariffPerKwh; }
        if (['CONFIRMED', 'CHECKED_IN'].includes(r.status) && sMs <= now && eMs > now) busy++;
      });
    });
    return { stationId: st.summary.id, name: st.summary.name, totalPoints: st.points.length, activePoints: st.points.filter((p) => p.status === 'ACTIVE').length, busyNow: Math.min(busy, st.points.length), crowdingIndexNow: s.crowdingIndexNow, crowdingLevelNow: s.crowdingLevelNow };
  });
  return { operatorName: u.operatorName || (u.role === 'ADMIN' ? 'All operators' : 'Operator'), stations: list.length, points, activePoints: active, bookingsToday, inProgress, upcomingToday: upcoming, revenueToday: round(revenue, 2), energyTodayKwh: round(energy, 1), stationsLive: live };
}

// ---------------------------------------------------------------- station / point validation
function validateStation(b) {
  const e = [];
  if (!b.name || !String(b.name).trim()) e.push(['name', 'Name is required']);
  if (!b.address || !String(b.address).trim()) e.push(['address', 'Address is required']);
  if (!b.zone) e.push(['zone', 'must not be blank']);
  if (!b.city) e.push(['city', 'must not be blank']);
  if (typeof b.latitude !== 'number') e.push(['latitude', 'must not be null']);
  if (typeof b.longitude !== 'number') e.push(['longitude', 'must not be null']);
  if (e.length) throw fieldErrors(e);
  const o = b.openHour ?? 0, c = b.closeHour ?? 24;
  if (o >= c) throw new HttpError(400, 'openHour must be earlier than closeHour');
}
function validatePoint(b) {
  const e = [];
  if (!b.label || !String(b.label).trim()) e.push(['label', 'must not be blank']);
  if (!b.connectorTypeId) e.push(['connectorTypeId', 'must not be null']);
  if (typeof b.powerKw !== 'number' || b.powerKw <= 0) e.push(['powerKw', 'must be greater than 0']);
  if (b.tariffPerKwh === undefined || b.tariffPerKwh === null || b.tariffPerKwh === '') e.push(['tariffPerKwh', 'must not be null']);
  else if (Number(b.tariffPerKwh) < 1) e.push(['tariffPerKwh', 'Tariff must be at least 1.00']);
  else if (Number(b.tariffPerKwh) > 2000) e.push(['tariffPerKwh', 'Tariff must be at most 2000.00']);
  if (e.length) throw fieldErrors(e);
  if (!connectorById(b.connectorTypeId)) throw new HttpError(404, `Connector type ${b.connectorTypeId} not found`);
}
const toPoint = (b, id, status) => {
  const c = connectorById(b.connectorTypeId);
  return { id, label: String(b.label).trim(), connectorCode: c.code, connectorName: c.displayName, currentType: c.currentType, powerKw: Number(b.powerKw), tariffPerKwh: Number(b.tariffPerKwh), status: status || b.status || 'ACTIVE' };
};
const futureLive = (pred) => state.bookings.some((b) => LIVE.includes(b.status) && parseNaive(b.endTime) > state.nowMs() && pred(b));
const amenityList = (ids) => (ids || []).map((id) => state.ref.amenities.find((a) => a.id === Number(id))).filter(Boolean);
const detail = (st) => ({ ...st, summary: liveSummary(st) });

module.exports = [
  { method: 'GET', pattern: '/api/operator/dashboard', handler: ({ auth }) => dashboard(auth('OPERATOR', 'ADMIN')) },
  { method: 'GET', pattern: '/api/operator/stations', handler: ({ auth }) => mine(auth('OPERATOR', 'ADMIN')).map((s) => liveSummary(s)) },
  { method: 'POST', pattern: '/api/operator/stations', handler: ({ auth, body }) => {
    const u = auth('OPERATOR', 'ADMIN'); validateStation(body);
    const operatorId = u.role === 'ADMIN' ? body.operatorId : u.operatorId;
    if (!operatorId) throw new HttpError(400, 'operatorId is required when an administrator creates a station');
    const opName = state.stations.find((s) => s.summary.operatorId === Number(operatorId))?.summary.operatorName || u.operatorName || 'Operator';
    const id = state.nextId('station', 100);
    const st = {
      summary: { id, name: body.name.trim(), address: body.address.trim(), zone: body.zone, city: body.city, latitude: body.latitude, longitude: body.longitude, tier: body.tier || 'STANDARD', operatorId: Number(operatorId), operatorName: opName,
        distanceKm: null, connectors: [], totalPoints: 0, activePoints: 0, minTariff: 0, avgRating: 0, reviewCount: 0, reliabilityScore: 80, sentimentLabel: 'NEUTRAL', openNow: true, openHour: body.openHour ?? 0, closeHour: body.closeHour ?? 24, freeNowPoints: 0, crowdingIndexNow: 0, crowdingLevelNow: 'LOW' },
      amenities: amenityList(body.amenityIds), points: [], ratingBreakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, sentiment: { positivePct: 0, neutralPct: 100, negativePct: 0 }, uptimePct: 100,
    };
    state.stations.push(st);
    return reply(201, detail(st), { Location: `/api/stations/${id}` });
  } },
  { method: 'PUT', pattern: '/api/operator/stations/:id', handler: ({ auth, params, body }) => {
    const u = auth('OPERATOR', 'ADMIN'); const st = requireStation(u, params.id); validateStation(body);
    Object.assign(st.summary, { name: body.name.trim(), address: body.address.trim(), zone: body.zone, city: body.city, latitude: body.latitude, longitude: body.longitude, tier: body.tier || st.summary.tier, openHour: body.openHour ?? st.summary.openHour, closeHour: body.closeHour ?? st.summary.closeHour });
    if (body.amenityIds) st.amenities = amenityList(body.amenityIds);
    return detail(st);
  } },
  { method: 'DELETE', pattern: '/api/operator/stations/:id', handler: ({ auth, params }) => {
    const u = auth('OPERATOR', 'ADMIN'); const st = requireStation(u, params.id);
    if (futureLive((b) => b.station?.id === st.summary.id)) throw new HttpError(409, 'Station has upcoming or running bookings - cancel or complete them first');
    state.stations.splice(state.stations.indexOf(st), 1);
    return reply(204, null);
  } },
  { method: 'POST', pattern: '/api/operator/stations/:id/points', handler: ({ auth, params, body }) => {
    const u = auth('OPERATOR', 'ADMIN'); const st = requireStation(u, params.id); validatePoint(body);
    const p = toPoint(body, state.nextId('point', 500)); st.points.push(p); refreshSummary(st);
    return reply(201, p, { Location: `/api/operator/points/${p.id}` });
  } },
  { method: 'PUT', pattern: '/api/operator/points/:id/status', handler: ({ auth, params, body }) => {
    const u = auth('OPERATOR', 'ADMIN'); const { station, point } = requirePoint(u, params.id);
    if (!['ACTIVE', 'MAINTENANCE', 'OFFLINE'].includes(body.status)) throw fieldErrors([['status', 'must not be null']]);
    point.status = body.status; refreshSummary(station); return point;
  } },
  { method: 'PUT', pattern: '/api/operator/points/:id', handler: ({ auth, params, body }) => {
    const u = auth('OPERATOR', 'ADMIN'); const { station, point } = requirePoint(u, params.id); validatePoint(body);
    Object.assign(point, toPoint(body, point.id, body.status || point.status)); refreshSummary(station); return point;
  } },
  { method: 'DELETE', pattern: '/api/operator/points/:id', handler: ({ auth, params }) => {
    const u = auth('OPERATOR', 'ADMIN'); const { station, point } = requirePoint(u, params.id);
    if (futureLive((b) => b.point?.id === point.id)) throw new HttpError(409, 'Point has upcoming or running bookings - cancel or complete them first');
    if (state.bookings.some((b) => b.point?.id === point.id)) throw new HttpError(409, 'Point has booking history and cannot be deleted - set its status to OFFLINE instead');
    station.points.splice(station.points.indexOf(point), 1); refreshSummary(station);
    return reply(204, null);
  } },
  { method: 'GET', pattern: '/api/operator/stations/:id/schedule', handler: ({ auth, params, query }) => {
    const u = auth('OPERATOR', 'ADMIN'); const st = requireStation(u, params.id);
    const date = query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date) ? query.date : dateOf(state.nowMs());
    return stationSchedule(st, date);
  } },
  { method: 'POST', pattern: '/api/operator/walk-ins', handler: ({ auth, body }) => {
    const u = auth('OPERATOR', 'ADMIN');
    const e = [];
    if (!body.chargingPointId) e.push(['chargingPointId', 'must not be null']);
    if (!body.vehicleRegNumber || !String(body.vehicleRegNumber).trim()) e.push(['vehicleRegNumber', 'must not be blank']);
    if (!body.startTime) e.push(['startTime', 'must not be null']);
    if (!(body.durationMinutes >= 30)) e.push(['durationMinutes', 'must be greater than or equal to 30']);
    else if (body.durationMinutes > 720) e.push(['durationMinutes', 'must be less than or equal to 720']);
    if (body.energyKwh !== undefined && body.energyKwh !== null && !(body.energyKwh > 0)) e.push(['energyKwh', 'must be greater than 0']);
    if (e.length) throw fieldErrors(e);
    const { station, point } = requirePoint(u, body.chargingPointId);
    const startMs = parseNaive(body.startTime);
    if (startMs > state.nowMs()) throw new HttpError(400, 'A walk-in session cannot start in the future');
    const norm = (s) => String(s).replace(/\s+/g, '').toUpperCase();
    const v = state.vehicles.find((x) => norm(x.regNumber) === norm(body.vehicleRegNumber));
    if (!v) throw new HttpError(404, `Vehicle with registration ${body.vehicleRegNumber} not found`);
    if (!compatible(v, point)) throw new HttpError(400, `Vehicle ${v.regNumber} cannot use this charging point`);
    const slots = Math.ceil(body.durationMinutes / 30);
    for (let k = 0; k < slots; k++) if (state.bookedSlots.has(`${point.id}|${toNaive(Math.floor(startMs / SLOT) * SLOT + k * SLOT)}`)) throw new HttpError(409, 'The charging point is already booked for that time');
    const owner = state.findUser(v.ownerId) || u;
    const startGrid = Math.floor(startMs / SLOT) * SLOT;
    const est = estimate({ vehicle: v, point, socStart: 20, socTarget: 80, startMs: startGrid });
    const kwhVal = body.energyKwh || round(Math.min(est.energyKwh, (body.durationMinutes / 60) * est.acceptedKw * 0.9), 1);
    const fakeEst = { ...est, slots, energyKwh: kwhVal, estimatedCost: round(kwhVal * est.effectiveTariff, 2) };
    const b = makeBooking({ user: owner, vehicle: v, station, point, startMs: startGrid, socStart: 20, socTarget: 80, source: 'WALK_IN', status: 'COMPLETED', est: fakeEst });
    b.session = { startedAt: toNaive(startMs), endedAt: toNaive(startMs + body.durationMinutes * MIN), energyKwh: kwhVal, socEnd: 80, amount: fakeEst.estimatedCost, co2AvoidedKg: est.co2AvoidedKg };
    b.payment.method = 'UPI';
    const { userId, ...out } = b;
    return reply(201, out, { Location: `/api/bookings/${b.id}` });
  } },
];
