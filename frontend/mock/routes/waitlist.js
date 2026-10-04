// Waiting list: join / list / leave. When a booking releases slots (cancel / expired hold) the first matching WAITING entry
// is promoted: a HOLD (source WAITLIST, 10 min to pay) is created and a WAITLIST_PROMOTED notification is sent (see WaitlistService).
const state = require('../lib/state');
const { HttpError, reply, fieldErrors, parseNaive, floorTo, DAY } = require('../lib/util');
const { compatible } = require('../lib/estimator');
const { SLOT } = require('../lib/availability');
const core = require('../lib/bookingCore');

const HORIZON_DAYS = 14;
const dto = (w) => {
  const st = state.findStation(w.stationId), v = state.vehicles.find((x) => x.id === w.vehicleId);
  return {
    id: w.id, station: { id: st.summary.id, name: st.summary.name }, vehicleLabel: v ? `${v.regNumber} (${v.make} ${v.model})` : `Vehicle ${w.vehicleId}`,
    desiredStart: w.desiredStart, slots: w.slots, status: w.status, promotedBookingId: w.promotedBookingId ?? null, createdAt: w.createdAt,
  };
};

core.releaseHooks.push(({ stationId, fromMs, toMs }) => {
  const now = state.nowMs();
  const st = state.findStation(stationId);
  for (const w of state.waitlist.filter((x) => x.stationId === stationId && x.status === 'WAITING').sort((a, b) => a.id - b.id)) {
    const wantStart = parseNaive(w.desiredStart), wantEnd = wantStart + w.slots * SLOT;
    if (!(wantStart < toMs && wantEnd > fromMs) || wantStart < floorTo(now, SLOT)) continue;
    const vehicle = state.vehicles.find((v) => v.id === w.vehicleId), user = state.findUser(w.userId);
    if (!vehicle || !user) continue;
    const free = st.points.filter((p) => p.status === 'ACTIVE' && compatible(vehicle, p)).find((p) => core.slotsFree(st, p, wantStart, w.slots));
    if (!free) continue;
    try {
      const hold = core.createHold({ user, vehicle, point: free, station: st, startTime: w.desiredStart, socStart: 20, socTarget: 80, source: 'WAITLIST', holdMinutes: core.WAITLIST_HOLD_MINUTES });
      w.status = 'PROMOTED'; w.promotedBookingId = hold.id;
      state.addNotification(w.userId, { type: 'WAITLIST_PROMOTED', title: 'A slot is available for you!', message: `A slot opened at ${st.summary.name} at ${w.desiredStart.slice(11, 16)}. It is held for you for 10 minutes - confirm and pay to keep it.`, payload: JSON.stringify({ bookingId: hold.id }) });
      return;
    } catch (e) { /* somebody else got it / limits: try the next entry */ }
  }
});

module.exports = [
  { method: 'POST', pattern: '/api/waitlist', handler: ({ auth, body }) => {
    const u = auth(); core.sweep();
    const errs = [];
    if (!body.vehicleId) errs.push(['vehicleId', 'vehicleId is required']);
    if (!body.stationId) errs.push(['stationId', 'stationId is required']);
    if (!body.desiredStart) errs.push(['desiredStart', 'desiredStart is required']);
    if (!Number.isInteger(body.slots)) errs.push(['slots', 'slots is required']);
    else if (body.slots < 1) errs.push(['slots', 'slots must be at least 1']);
    else if (body.slots > 16) errs.push(['slots', 'slots must be at most 16']);
    if (errs.length) throw fieldErrors(errs);
    const v = state.vehicles.find((x) => x.id === Number(body.vehicleId));
    if (!v) throw new HttpError(404, `Vehicle ${body.vehicleId} not found`);
    if (!(u.role === 'FLEET_MANAGER' ? v.fleetId === u.fleetId : v.ownerId === u.id)) throw new HttpError(403, 'This vehicle does not belong to you');
    const st = state.findStation(body.stationId);
    if (!st) throw new HttpError(404, `Station ${body.stationId} not found`);
    const start = parseNaive(body.desiredStart), now = state.nowMs();
    if (Number.isNaN(start) || start % SLOT !== 0) throw new HttpError(400, 'Desired start must be on a 30-minute boundary (:00 or :30)');
    if (start < floorTo(now, SLOT) || start > now + HORIZON_DAYS * DAY) throw new HttpError(400, `Desired start must be in the future and within ${HORIZON_DAYS} days`);
    if (state.waitlist.some((w) => w.userId === u.id && w.status === 'WAITING' && w.vehicleId === v.id && w.stationId === st.summary.id && w.desiredStart === body.desiredStart)) {
      throw new HttpError(409, 'You are already on the waiting list for this time');
    }
    const w = { id: state.nextId('waitlist'), userId: u.id, vehicleId: v.id, stationId: st.summary.id, desiredStart: body.desiredStart, slots: body.slots, status: 'WAITING', promotedBookingId: null, createdAt: state.now() };
    state.waitlist.push(w);
    return reply(201, dto(w), { Location: `/api/waitlist/${w.id}` });
  } },
  { method: 'GET', pattern: '/api/waitlist', handler: ({ auth }) => { const u = auth(); core.sweep(); return state.waitlist.filter((w) => w.userId === u.id).sort((a, b) => b.id - a.id).map(dto); } },
  { method: 'DELETE', pattern: '/api/waitlist/:id', handler: ({ auth, params }) => {
    const u = auth();
    const w = state.waitlist.find((x) => x.id === Number(params.id));
    if (!w) throw new HttpError(404, `Waitlist entry ${params.id} not found`);
    if (w.userId !== u.id && u.role !== 'ADMIN') throw new HttpError(403, 'This waiting-list entry belongs to another user');
    if (w.status !== 'WAITING') throw new HttpError(409, `Only a WAITING entry can be cancelled (current status: ${w.status})`);
    w.status = 'CANCELLED';
    return reply(204, null);
  } },
];
