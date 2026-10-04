// Admin console mock: users (~40 generated incl. the 7 demo accounts), role/status, stats, warehouse refresh, reminders run-now.
// The clock endpoints (/api/admin/clock/advance|reset) live in routes/clock.js (foundation) and are reused as is.
const state = require('../lib/state');
const { HttpError, fieldErrors, paginate, toNaive, parseNaive, mulberry32, hashStr, DAY } = require('../lib/util');

const FIRST = ['Aditya', 'Bhavna', 'Chetan', 'Divya', 'Esha', 'Farhan', 'Gauri', 'Harsh', 'Indira', 'Jayesh', 'Kavya', 'Lakshmi', 'Manish', 'Neha', 'Omkar', 'Pooja', 'Quincy', 'Ritu', 'Sahil', 'Tanvi', 'Uday', 'Varun', 'Wasim', 'Yash', 'Zoya', 'Nikhil', 'Deepa', 'Siddharth', 'Rekha', 'Tarun', 'Ishaan', 'Kriti', 'Pranav'];
const LAST = ['Sharma', 'Verma', 'Gupta', 'Kulkarni', 'Reddy', 'Khan', 'Bose', 'Chopra', 'Naik', 'Pawar', 'Sinha', 'Rane', 'Jain', 'Thakur', 'More', 'Bhat'];
const CITIES = ['Mumbai', 'Thane', 'Navi Mumbai', 'Pune', 'Mumbai', 'Mumbai'];
const OPERATORS = {};
state.stations.forEach((s) => { OPERATORS[s.summary.operatorId] = s.summary.operatorName; });
const FLEETS = { 1: 'SwiftLogix Deliveries', 2: 'GreenRide Cabs', 3: 'Metro Courier Co', 4: 'UrbanMile Logistics', 5: 'ZipCart Fulfilment', 6: 'Aqua Freight' };

(function seed() {
  if (state.users.some((u) => u.id >= 8 && u.id <= 45)) return;
  const rng = mulberry32(2026);
  let n = 0;
  for (let id = 8; id <= 44; id++) {
    const f = FIRST[n % FIRST.length], l = LAST[(n * 5) % LAST.length]; n++;
    let role = 'USER', operatorId = null, operatorName = null, fleetId = null, fleetName = null;
    if (id === 12 || id === 25) { role = 'OPERATOR'; operatorId = id === 12 ? 2 : 3; operatorName = OPERATORS[operatorId]; }
    if (id === 18 || id === 33) { role = 'FLEET_MANAGER'; fleetId = id === 18 ? 2 : 3; fleetName = FLEETS[fleetId]; }
    state.users.push({
      id, fullName: `${f} ${l}`, email: `${f}.${l}`.toLowerCase() + '@example.in', password: 'User@123', phone: '9' + String(Math.floor(rng() * 1e9)).padStart(9, '0'), role, city: CITIES[id % CITIES.length], operatorId, operatorName, fleetId, fleetName,
      reminderEnabled: true, reminderLeadHours: 12, noShowCount: rng() < 0.2 ? 1 + Math.floor(rng() * 4) : 0, walletBalance: Math.round(rng() * 4000), homeLat: null, homeLon: null,
      status: id === 21 || id === 38 ? 'BLOCKED' : 'ACTIVE', createdAt: toNaive(parseNaive('2026-10-01T10:00:00') - Math.floor(rng() * 300) * DAY),
    });
  }
  state.users.sort((a, b) => a.id - b.id);
})();

const opName = (id) => OPERATORS[id] || state.stations.find((s) => s.summary.operatorId === id)?.summary.operatorName || null;
function dto(u) {
  const h = hashStr('login' + u.id);
  return {
    id: u.id, fullName: u.fullName, email: u.email, role: u.role, status: u.status || 'ACTIVE', city: u.city || null, operatorId: u.operatorId || null, operatorName: u.operatorName || null,
    noShowCount: u.noShowCount || 0, createdAt: u.createdAt || '2026-01-01T10:00:00', lastLoginAt: u.id <= 7 ? toNaive(state.nowMs() - (h % 6) * 3600000) : (h % 9 === 0 ? null : toNaive(state.nowMs() - (h % 40) * DAY - (h % 20) * 3600000)),
  };
}

module.exports = [
  { method: 'GET', pattern: '/api/admin/users', handler: ({ auth, query }) => {
    auth('ADMIN');
    const q = (query.q || '').trim().toLowerCase();
    const list = state.users.filter((u) => (!q || u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      && (!query.role || u.role === query.role) && (!query.status || (u.status || 'ACTIVE') === query.status)).map(dto);
    if (query.role && !['USER', 'OPERATOR', 'ADMIN', 'FLEET_MANAGER'].includes(query.role)) throw new HttpError(400, 'Unknown role: ' + query.role);
    return paginate(list, query);
  } },
  { method: 'PUT', pattern: '/api/admin/users/:id/role', handler: ({ auth, params, body }) => {
    const admin = auth('ADMIN');
    const u = state.findUser(params.id); if (!u) throw new HttpError(404, `User ${params.id} not found`);
    if (!['USER', 'OPERATOR', 'ADMIN', 'FLEET_MANAGER'].includes(body.role)) throw fieldErrors([['role', 'must not be null']]);
    if (u.id === admin.id) throw new HttpError(400, 'You cannot change your own role');
    u.operatorId = null; u.operatorName = null; u.fleetId = null; u.fleetName = null;
    if (body.role === 'OPERATOR') {
      if (!body.operatorId) throw new HttpError(400, 'operatorId is required for role OPERATOR');
      if (!opName(Number(body.operatorId))) throw new HttpError(404, `Operator ${body.operatorId} not found`);
      u.operatorId = Number(body.operatorId); u.operatorName = opName(u.operatorId);
    }
    if (body.role === 'FLEET_MANAGER') {
      if (!body.fleetId) throw new HttpError(400, 'fleetId is required for role FLEET_MANAGER');
      if (!FLEETS[body.fleetId]) throw new HttpError(404, `Fleet ${body.fleetId} not found`);
      u.fleetId = Number(body.fleetId); u.fleetName = FLEETS[u.fleetId];
    }
    u.role = body.role; return dto(u);
  } },
  { method: 'PUT', pattern: '/api/admin/users/:id/status', handler: ({ auth, params, body }) => {
    const admin = auth('ADMIN');
    const u = state.findUser(params.id); if (!u) throw new HttpError(404, `User ${params.id} not found`);
    if (!['ACTIVE', 'BLOCKED'].includes(body.status)) throw fieldErrors([['status', 'must not be null']]);
    if (u.id === admin.id && body.status === 'BLOCKED') throw new HttpError(400, 'You cannot block your own account');
    u.status = body.status; return dto(u);
  } },
  { method: 'GET', pattern: '/api/admin/stats', handler: ({ auth }) => {
    auth('ADMIN');
    const f = state.fx('analytics/admin_stats.json').counts;
    const counts = { users: Math.max(f.users, state.users.length), operators: f.operators, fleets: f.fleets, stations: state.stations.length, chargingPoints: state.stations.reduce((s, x) => s + x.points.length, 0),
      vehicles: f.vehicles + state.vehicles.length - 12 - 5, bookings: f.bookings + state.bookings.length, sessions: f.charging_sessions, reviews: f.reviews };
    const today = toNaive(state.nowMs()).slice(0, 10);
    const live = state.bookings.filter((b) => ['HOLD', 'CONFIRMED', 'CHECKED_IN'].includes(b.status)).length;
    const todays = state.bookings.filter((b) => b.startTime.startsWith(today) && !['CANCELLED', 'EXPIRED'].includes(b.status)).length;
    return { counts, bookingsToday: 48 + todays, bookingsLive: 261 + live, now: state.now(), clockMode: state.clock.mode };
  } },
  { method: 'POST', pattern: '/api/admin/warehouse/refresh', handler: async ({ auth }) => {
    auth('ADMIN');
    const f = state.fx('analytics/admin_stats.json').counts;
    await new Promise((r) => setTimeout(r, 900));
    const rows = { dw_dim_date: f.dw_dim_date, dw_dim_time: 1440, dw_dim_station: f.dw_dim_station, dw_dim_user: f.dw_dim_user, dw_dim_vehicle: f.dw_dim_vehicle, dw_dim_connector: 5, dw_fact_booking: f.dw_fact_booking, dw_fact_session: f.dw_fact_session };
    return { rows, millis: 1480 + Math.floor(Math.random() * 400) };
  } },
  { method: 'GET', pattern: '/api/admin/clock', handler: ({ auth }) => { auth('ADMIN'); return { now: state.now(), mode: state.clock.mode, anchor: toNaive(state.clock.anchorMs), offsetSeconds: Math.round(state.clock.offsetMs / 1000) }; } },
  { method: 'POST', pattern: '/api/admin/reminders/run-now', handler: ({ auth }) => { auth('ADMIN'); return { created: state.notifications.filter((n) => n.type === 'RECHARGE_REMINDER' && n.status === 'ACTIVE').length > 2 ? 0 : 2 }; } },
];
module.exports.FLEETS = FLEETS;
