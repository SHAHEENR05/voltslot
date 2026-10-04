// Shared in-memory state for ALL mock route modules. Require it: const state = require('../lib/state');
// Everything resets when the server restarts.
const fs = require('fs');
const path = require('path');
const { parseNaive, toNaive, MIN } = require('./util');

const fx = (...p) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', ...p), 'utf8'));
const readFixture = fx;

const ANCHOR = '2026-10-03T09:30:00';
const state = {
  fx: readFixture,
  /** reference data */
  ref: {
    connectors: fx('reference/connectors.json'), vehicleModels: fx('reference/vehicle-models.json'), amenities: fx('reference/amenities.json'),
    zones: fx('reference/zones.json'), pricingBands: fx('reference/pricing-bands.json'),
  },
  /** stations: [{summary, amenities, points, ratingBreakdown, sentiment, uptimePct}] (StationDetailDto) */
  stations: fx('stations.json'),
  /** demand forecast: Map stationId -> 7x24 crowding grid (dow 1..7) */
  demand: new Map(),
  clock: { anchorMs: parseNaive(ANCHOR), startedAt: Date.now(), offsetMs: 0, mode: 'FIXED' },
  /** ---- extension points for other route modules ---- */
  users: [],            // user records: UserDto fields + password, status ('ACTIVE'|'BLOCKED'), createdAt
  vehicles: [],         // VehicleDto + ownerId
  notifications: [],    // NotificationDto + userId
  wallets: new Map(),   // userId -> { txns: [WalletTxnDto] }  (balance lives on user.walletBalance)
  bookings: [],         // BookingDto-ish records created by booking routes (+ userId)
  bookedSlots: new Set(), // `${pointId}|${slotStartIso}` taken by mock bookings -> availability shows BOOKED
  _ids: {},
};

/** state.nextId('booking') -> 1,2,3... */
state.nextId = (k, start = 1000) => { state._ids[k] = (state._ids[k] || start) + 1; return state._ids[k]; };
/** current APP time as naive ms (UTC-field wall clock) and ISO string */
state.nowMs = () => state.clock.anchorMs + (Date.now() - state.clock.startedAt) + state.clock.offsetMs;
state.now = () => toNaive(state.nowMs());
state.advance = (ms) => { state.clock.offsetMs += ms; };
state.resetClock = () => { state.clock.startedAt = Date.now(); state.clock.offsetMs = 0; };
state.findStation = (id) => state.stations.find((s) => s.summary.id === Number(id));
state.findPoint = (pointId) => { for (const s of state.stations) { const p = s.points.find((x) => x.id === Number(pointId)); if (p) return { station: s, point: p }; } return null; };
state.model = (id) => state.ref.vehicleModels.find((m) => m.id === Number(id));
state.findUser = (id) => state.users.find((u) => u.id === Number(id));
state.publicUser = (u) => { const { password, status, createdAt, ...rest } = u; return rest; };

for (const r of fx('demand_forecast.json')) {
  if (!state.demand.has(r.stationId)) state.demand.set(r.stationId, Array.from({ length: 8 }, () => new Array(24).fill(0)));
  state.demand.get(r.stationId)[r.dayOfWeek][r.hourOfDay] = r.crowdingIndex;
}
/** crowding index (0..100) for station/dow/hour */
state.crowding = (stationId, dow, hour) => (state.demand.get(stationId)?.[dow]?.[hour]) ?? 0;
state.crowdingLevel = (i) => (i >= 65 ? 'HIGH' : i >= 35 ? 'MEDIUM' : 'LOW');

// ---- demo users -------------------------------------------------------------------------------
const mk = (id, fullName, email, password, role, extra = {}) => ({
  id, fullName, email, password, phone: '98200' + String(10000 + id * 1111).slice(0, 5), role, city: 'Mumbai', operatorId: null, operatorName: null, fleetId: null, fleetName: null,
  reminderEnabled: true, reminderLeadHours: 12, noShowCount: 0, walletBalance: 1000, homeLat: null, homeLon: null, status: 'ACTIVE', createdAt: '2025-10-01T10:00:00', ...extra,
});
state.users.push(
  mk(1, 'Admin VoltSlot', 'admin@voltslot.in', 'Admin@123', 'ADMIN', { walletBalance: 0 }),
  mk(2, 'Operator VoltGrid', 'operator@voltslot.in', 'Operator@123', 'OPERATOR', { operatorId: 1, operatorName: 'VoltGrid', walletBalance: 0 }),
  mk(3, 'Fleet Manager', 'fleet@voltslot.in', 'Fleet@123', 'FLEET_MANAGER', { fleetId: 1, fleetName: 'SwiftLogix Deliveries', walletBalance: 50000, city: 'Mumbai' }),
  mk(4, 'Aarav Mehta', 'demo@voltslot.in', 'User@123', 'USER', { city: 'Thane', walletBalance: 2450.5, homeLat: 19.2183, homeLon: 72.9781 }),
  mk(5, 'Priya Nair', 'priya@voltslot.in', 'User@123', 'USER', { city: 'Mumbai', walletBalance: 1800, homeLat: 19.1136, homeLon: 72.8697 }),
  mk(6, 'Rahul Deshmukh', 'rahul@voltslot.in', 'User@123', 'USER', { city: 'Navi Mumbai', walletBalance: 640, homeLat: 19.0771, homeLon: 73.0071 }),
  mk(7, 'Sneha Iyer', 'sneha@voltslot.in', 'User@123', 'USER', { city: 'Mumbai', walletBalance: 320, homeLat: 19.0176, homeLon: 72.8562 }),
);
state._ids.user = 100;

const veh = (ownerId, modelId, regNumber, nickname, avgDailyKm, fleetId = null) => {
  const m = state.model(modelId);
  return { id: state.nextId('vehicle'), modelId, make: m.make, model: m.model, variant: m.variant, category: m.category, batteryKwh: m.batteryKwh, acMaxKw: m.acMaxKw, dcMaxKw: m.dcMaxKw, rangeKm: m.rangeKm, kmPerKwh: m.kmPerKwh, connectorCodes: m.connectorCodes, regNumber, nickname, avgDailyKm, fleetId, ownerId };
};
state.vehicles.push(
  veh(4, 1, 'MH04 EV 2481', 'Nexon', 42), veh(4, 9, 'MH04 EV 7710', 'Ather', 25),
  veh(5, 3, 'MH02 EV 1905', 'Punch', 30), veh(6, 4, 'MH43 EV 5533', 'ZS', 55), veh(7, 10, 'MH01 EV 0042', 'Ola', 22),
);
const fleetModels = [12, 12, 12, 12, 12, 12, 13, 13, 13, 12, 13, 12];
fleetModels.forEach((mid, i) => state.vehicles.push(veh(3, mid, `MH04 FL ${4100 + i * 7}`, `Fleet-${String(i + 1).padStart(2, '0')}`, 80 + i * 4, 1)));

// ---- wallet + notifications for the demo user ----------------------------------------------------
const txn = (userId, type, amount, ref, createdAt) => {
  const w = state.wallets.get(userId) || { txns: [] }; state.wallets.set(userId, w);
  const u = state.findUser(userId);
  w.txns.unshift({ id: state.nextId('txn'), type, amount, balanceAfter: u.walletBalance, reference: ref, createdAt });
};
state.addTxn = (userId, type, amount, reference) => {
  const u = state.findUser(userId); const sign = type === 'TOPUP' || type === 'REFUND' ? 1 : -1;
  u.walletBalance = Math.round((u.walletBalance + sign * amount) * 100) / 100;
  const w = state.wallets.get(userId) || { txns: [] }; state.wallets.set(userId, w);
  const t = { id: state.nextId('txn'), type, amount, balanceAfter: u.walletBalance, reference, createdAt: state.now() };
  w.txns.unshift(t); return t;
};
[[4, 'TOPUP', 2000, 'Top-up via UPI', '2026-09-20T18:12:00'], [4, 'DEBIT', 384.5, 'Booking VSL-7K3M9X', '2026-09-27T19:30:00'], [4, 'REFUND', 100, 'Refund VSL-2H8P4Q', '2026-09-29T08:05:00'], [4, 'DEBIT', 265, 'Booking VSL-5R2N8D', '2026-10-01T20:10:00']]
  .forEach(([u, t, a, r, c]) => txn(u, t, a, r, c));
[5, 6, 7, 3].forEach((u) => txn(u, 'TOPUP', state.findUser(u).walletBalance, 'Opening balance', '2026-09-01T10:00:00'));

state.addNotification = (userId, n) => { const rec = { id: state.nextId('notif'), userId, type: 'SYSTEM', title: '', message: '', payload: null, read: false, status: 'DONE', createdAt: state.now(), ...n }; state.notifications.unshift(rec); return rec; };
const note = (userId, type, title, message, createdAt, extra = {}) => state.notifications.push({ id: state.nextId('notif'), userId, type, title, message, payload: null, read: false, status: 'DONE', createdAt, ...extra });
note(4, 'RECHARGE_REMINDER', 'Time to recharge your Tata Nexon EV ⚡', 'You usually charge every ~6 days; your last charge was 5 days ago.', '2026-10-03T09:00:00', { status: 'ACTIVE', payload: JSON.stringify({ vehicleId: 1, stationId: 3, pointId: 13, slotStart: '2026-10-03T19:30:00', dueAt: '2026-10-03T12:00:00' }) });
note(4, 'CHARGE_COMPLETE', 'Charge complete', 'You added 19.4 kWh at VoltGrid Powai Hub. CO2 avoided: 16.3 kg.', '2026-09-28T21:15:00', { read: true });
note(4, 'BOOKING_CONFIRMED', 'Booking confirmed', 'VSL-5R2N8D at Thane West Hub is confirmed for 1 Oct, 20:30.', '2026-10-01T20:10:00', { read: true });
note(4, 'SYSTEM', 'Welcome to VoltSlot', 'Smart recommendations and predictive reminders are on for your account.', '2026-09-20T10:00:00', { read: true });
note(6, 'RECHARGE_REMINDER', 'Time to recharge your MG ZS EV ⚡', 'Your charge is overdue by about a day.', '2026-10-02T21:00:00', { status: 'ACTIVE' });

module.exports = state;
