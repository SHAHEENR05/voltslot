// Vehicles CRUD (in memory). USER -> own vehicles, FLEET_MANAGER -> fleet vehicles.
const state = require('../lib/state');
const { HttpError, reply, fieldErrors, parseNaive } = require('../lib/util');

const dto = ({ ownerId, ...v }) => v;
const visible = (u) => state.vehicles.filter((v) => (u.role === 'FLEET_MANAGER' ? v.fleetId === u.fleetId : v.ownerId === u.id));
const own = (u, id) => { const v = visible(u).find((x) => x.id === Number(id)); if (!v) throw new HttpError(404, 'Vehicle not found'); return v; };
function validate(body, creating) {
  const errs = [];
  if (!body.modelId || !state.model(body.modelId)) errs.push(['modelId', 'Vehicle model is required']);
  if (!body.regNumber?.trim()) errs.push(['regNumber', 'Registration number is required']);
  if (body.avgDailyKm !== undefined && body.avgDailyKm !== null && (body.avgDailyKm < 1 || body.avgDailyKm > 500)) errs.push(['avgDailyKm', 'must be between 1 and 500']);
  if (errs.length) throw fieldErrors(errs);
}
function apply(v, body) {
  const m = state.model(body.modelId);
  Object.assign(v, { modelId: m.id, make: m.make, model: m.model, variant: m.variant, category: m.category, batteryKwh: m.batteryKwh, acMaxKw: m.acMaxKw, dcMaxKw: m.dcMaxKw, rangeKm: m.rangeKm, kmPerKwh: m.kmPerKwh, connectorCodes: m.connectorCodes, regNumber: body.regNumber.trim().toUpperCase(), nickname: body.nickname || null, avgDailyKm: body.avgDailyKm || 30 });
  return v;
}

module.exports = [
  { method: 'GET', pattern: '/api/vehicles', handler: ({ auth }) => visible(auth()).map(dto) },
  { method: 'POST', pattern: '/api/vehicles', handler: ({ auth, body }) => {
    const u = auth(); validate(body);
    if (state.vehicles.some((v) => v.regNumber.toUpperCase() === body.regNumber.trim().toUpperCase())) throw new HttpError(409, 'A vehicle with this registration number already exists', { fieldErrors: [{ field: 'regNumber', message: 'Already registered' }] });
    const v = apply({ id: state.nextId('vehicle'), ownerId: u.id, fleetId: u.role === 'FLEET_MANAGER' ? u.fleetId : null }, body);
    state.vehicles.push(v); return reply(201, dto(v));
  } },
  { method: 'PUT', pattern: '/api/vehicles/:id', handler: ({ auth, params, body }) => { const u = auth(); const v = own(u, params.id); validate(body); return dto(apply(v, body)); } },
  { method: 'DELETE', pattern: '/api/vehicles/:id', handler: ({ auth, params }) => {
    const u = auth(); const v = own(u, params.id);
    const now = state.nowMs();
    if (state.bookings.some((b) => b.vehicle?.id === v.id && ['HOLD', 'CONFIRMED', 'CHECKED_IN'].includes(b.status) && parseNaive(b.endTime) > now)) throw new HttpError(409, 'Vehicle has upcoming bookings. Cancel them first.');
    state.vehicles.splice(state.vehicles.indexOf(v), 1); return reply(204, null);
  } },
];
