// Bookings: estimate, create HOLD (409 + alternatives), confirm (402), cancel, check-in, complete, list, get, invoice + station review POST.
// All logic lives in ../lib/bookingCore.js (shared with the waitlist route). Field names follow BookingDtos.java exactly.
const state = require('../lib/state');
const { HttpError, reply, fieldErrors, paginate, parseNaive, toNaive, floorTo, MIN, HOUR } = require('../lib/util');
const { estimate, compatible } = require('../lib/estimator');
const core = require('../lib/bookingCore');
const { SLOT } = require('../lib/availability');

core.seed();

const mine = (u, id) => {
  core.sweep();
  const b = state.bookings.find((x) => x.id === Number(id));
  if (!b) throw new HttpError(404, `Booking ${id} not found`);
  if (b.userId !== u.id && u.role !== 'ADMIN') throw new HttpError(403, 'This booking belongs to another user');
  return b;
};
const isInt = (v) => Number.isInteger(v);

function validateSoc(body, errs) {
  if (!isInt(body.socStart)) errs.push(['socStart', 'must not be null']);
  else if (body.socStart < 0 || body.socStart > 99) errs.push(['socStart', 'must be between 0 and 99']);
  if (!isInt(body.socTarget)) errs.push(['socTarget', 'must not be null']);
  else if (body.socTarget < 1 || body.socTarget > 100) errs.push(['socTarget', 'must be between 1 and 100']);
}

function estimateRoute({ auth, body }) {
  const u = auth();
  const errs = [];
  if (!body.vehicleId) errs.push(['vehicleId', 'must not be null']);
  if (!body.chargingPointId) errs.push(['chargingPointId', 'must not be null']);
  validateSoc(body, errs);
  if (errs.length) throw fieldErrors(errs);
  const v = core.vehicleOf(u, body.vehicleId);
  const fp = state.findPoint(body.chargingPointId);
  if (!fp) throw new HttpError(404, `Charging point ${body.chargingPointId} not found`);
  if (body.socTarget <= body.socStart) throw new HttpError(400, 'Target charge must be higher than the current charge');
  if (!compatible(v, fp.point)) throw new HttpError(400, `This vehicle cannot charge on connector ${fp.point.connectorCode}`);
  const startMs = body.startTime ? parseNaive(body.startTime) : floorTo(state.nowMs(), SLOT);
  return estimate({ vehicle: v, point: fp.point, socStart: body.socStart, socTarget: body.socTarget, startMs });
}

function create({ auth, body }) {
  const u = auth();
  const errs = [];
  if (!body.vehicleId) errs.push(['vehicleId', 'vehicleId is required']);
  if (!body.startTime) errs.push(['startTime', 'startTime is required']);
  validateSoc(body, errs);
  if (errs.length) throw fieldErrors(errs);
  const v = core.vehicleOf(u, body.vehicleId);
  let point = null, station;
  if (body.chargingPointId) {
    const fp = state.findPoint(body.chargingPointId);
    if (!fp) throw new HttpError(404, `Charging point ${body.chargingPointId} not found`);
    point = fp.point; station = fp.station;
    if (body.stationId && Number(body.stationId) !== station.summary.id) throw new HttpError(400, 'The charging point does not belong to the given station');
  } else if (body.stationId) {
    station = state.findStation(body.stationId);
    if (!station) throw new HttpError(404, `Station ${body.stationId} not found`);
  } else throw new HttpError(400, 'Either chargingPointId or stationId is required');
  const source = ['WEB', 'MOBILE', 'WALK_IN', 'WAITLIST', 'REMINDER', 'FLEET', 'TRIP'].includes(body.source) ? body.source : 'WEB';
  const b = core.createHold({ user: u, vehicle: v, point, station, startTime: body.startTime, socStart: body.socStart, socTarget: body.socTarget, source, holdMinutes: source === 'WAITLIST' ? core.WAITLIST_HOLD_MINUTES : core.HOLD_MINUTES });
  return reply(201, core.publicDto(b), { Location: `/api/bookings/${b.id}` });
}

function confirm({ auth, params, body }) {
  const u = auth();
  if (!body.paymentMethod) throw fieldErrors([['paymentMethod', 'paymentMethod is required']]);
  if (!core.PAY_METHODS.includes(body.paymentMethod)) throw new HttpError(400, 'Malformed JSON request or invalid value in the request body');
  const b = mine(u, params.id);
  const now = state.nowMs();
  if (b.status !== 'HOLD') throw new HttpError(409, `Only a booking on HOLD can be confirmed (current status: ${b.status})`);
  if (b.holdExpiresAt && parseNaive(b.holdExpiresAt) <= now) throw new HttpError(409, 'The hold has expired. Please create the booking again.');
  const amount = core.money(b.estCost);
  if (body.paymentMethod === 'WALLET') {
    const owner = state.findUser(b.userId);
    if (owner.walletBalance < amount) throw new HttpError(402, `Insufficient wallet balance: need ${amount.toFixed(2)} but only ${owner.walletBalance.toFixed(2)} available. Please top up your wallet.`);
    state.addTxn(owner.id, 'DEBIT', amount, `BOOKING ${b.bookingCode}`);
  }
  b.payment = { amount, method: body.paymentMethod, status: 'PAID', invoiceNo: core.invoiceNo(), refundedAmount: 0 };
  b.status = 'CONFIRMED'; b.holdExpiresAt = null;
  state.addNotification(b.userId, { type: 'BOOKING_CONFIRMED', title: 'Booking confirmed', message: `Your slot at ${b.station.name} on ${b.startTime.slice(0, 10)} at ${b.startTime.slice(11, 16)} is confirmed. Paid ₹${amount.toFixed(2)} (${body.paymentMethod}). Invoice ${b.payment.invoiceNo}.`, payload: JSON.stringify({ bookingId: b.id }) });
  return core.publicDto(b);
}

function cancel({ auth, params, body }) {
  const u = auth();
  const b = mine(u, params.id);
  if (b.status !== 'HOLD' && b.status !== 'CONFIRMED') throw new HttpError(409, `Only HOLD or CONFIRMED bookings can be cancelled (current status: ${b.status})`);
  if (body && body.reason && String(body.reason).length > 100) throw fieldErrors([['reason', 'size must be between 0 and 100']]);
  const now = state.nowMs();
  let refund = 0;
  if (b.payment && b.payment.status === 'PAID') {
    refund = core.refundFor(b.payment.amount, core.startMsOf(b), now);
    if (refund > 0 && b.payment.method === 'WALLET') core.creditWallet(b.userId, refund, `REFUND ${b.bookingCode}`);
    b.payment.refundedAmount = refund;
    b.payment.status = refund >= b.payment.amount ? 'REFUNDED' : 'PART_REFUND';
  }
  b.status = 'CANCELLED'; b.cancelledAt = state.now(); b.holdExpiresAt = null;
  b.cancelReason = (body && String(body.reason || '').trim().slice(0, 100)) || 'Cancelled by user';
  core.release(b);
  state.addNotification(b.userId, { type: 'BOOKING_CANCELLED', title: 'Booking cancelled', message: `Booking ${b.bookingCode} at ${b.station.name} was cancelled.${refund > 0 ? ` Refund: ₹${refund.toFixed(2)}.` : ''}`, payload: JSON.stringify({ bookingId: b.id }) });
  return core.publicDto(b);
}

function checkIn({ auth, params }) {
  const b = mine(auth(), params.id);
  if (b.status !== 'CONFIRMED') throw new HttpError(409, `Only a CONFIRMED booking can be checked in (current status: ${b.status})`);
  if (!core.inCheckInWindow(b, state.nowMs())) throw new HttpError(400, `Check-in is possible from 15 minutes before until 15 minutes after the start time (${b.startTime})`);
  b.status = 'CHECKED_IN'; b.checkedInAt = state.now();
  return core.publicDto(b);
}

function complete({ auth, params, body }) {
  const b = mine(auth(), params.id);
  if (b.status !== 'CHECKED_IN') throw new HttpError(409, `Only a CHECKED_IN booking can be completed (current status: ${b.status})`);
  if (body && body.socEnd !== undefined && body.socEnd !== null) {
    if (!isInt(body.socEnd) || body.socEnd < 1 || body.socEnd > 100) throw fieldErrors([['socEnd', 'must be between 1 and 100']]);
  }
  core.complete(b, body && body.socEnd);
  return core.publicDto(b);
}

function list({ auth, query }) {
  const u = auth();
  core.sweep();
  const now = state.nowMs();
  let statuses = null;
  if (query.status) {
    const s = String(query.status).trim().toUpperCase();
    if (!['HOLD', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'EXPIRED'].includes(s)) throw new HttpError(400, `Unknown booking status: ${query.status}`);
    statuses = [s];
  }
  let rows = state.bookings.filter((b) => b.userId === u.id);
  if (query.upcoming === 'true') {
    rows = rows.filter((b) => core.startMsOf(b) >= now - 3 * HOUR && (statuses || core.LIVE).includes(b.status)).sort((a, b) => core.startMsOf(a) - core.startMsOf(b));
  } else {
    if (query.upcoming === 'false') rows = rows.filter((b) => core.startMsOf(b) < now);
    if (statuses) rows = rows.filter((b) => statuses.includes(b.status));
    rows.sort((a, b) => core.startMsOf(b) - core.startMsOf(a));
  }
  const page = paginate(rows.map(core.publicDto), { size: 10, ...query });
  return page;
}

function invoice({ auth, params }) {
  const b = mine(auth(), params.id);
  if (!b.payment) throw new HttpError(404, `No invoice yet: booking ${b.bookingCode} has not been paid`);
  const owner = state.findUser(b.userId);
  const fp = state.findPoint(b.point.id);
  const v = state.vehicles.find((x) => x.id === b.vehicle.id);
  const est = estimate({ vehicle: v, point: fp.point, socStart: b.socStart, socTarget: b.session ? b.session.socEnd : b.socTarget, startMs: core.startMsOf(b) });
  return {
    invoiceNo: b.payment.invoiceNo, bookingCode: b.bookingCode, issuedAt: b.createdAt, customerName: owner.fullName,
    stationName: b.station.name, stationAddress: b.station.address, vehicle: `${b.vehicle.regNumber} (${b.vehicle.make} ${b.vehicle.model})`,
    connector: b.point.connectorCode, energyKwh: b.session ? b.session.energyKwh : b.estEnergyKwh, effectiveTariff: est.effectiveTariff,
    amount: b.payment.amount, refundedAmount: b.payment.refundedAmount || 0, method: b.payment.method, status: b.payment.status,
  };
}

// ---- station reviews (POST). GET stays in stations.js (it reads state.reviews[stationId]).
const POS = ['great', 'excellent', 'clean', 'fast', 'smooth', 'helpful', 'reliable', 'love', 'good', 'quick', 'recommend', 'comfortable'];
const NEG = ['slow', 'broken', 'dirty', 'bad', 'terrible', 'crowded', 'queue', 'waited', 'wait', 'expensive', 'rude', 'out of order', 'failed', 'faulty'];
function sentimentOf(text) {
  const t = String(text || '').toLowerCase(); let s = 0;
  POS.forEach((w) => { if (t.includes(w)) s += 1; }); NEG.forEach((w) => { if (t.includes(w)) s -= 1; });
  const score = Math.max(-1, Math.min(1, s / 3));
  return { score: Math.round(score * 1000) / 1000, label: score > 0.15 ? 'POSITIVE' : score < -0.15 ? 'NEGATIVE' : 'NEUTRAL' };
}
function postReview({ params, auth, body }) {
  const u = auth();
  const st = state.findStation(params.id);
  if (!st) throw new HttpError(404, `Station ${params.id} not found`);
  const errs = [];
  if (!isInt(body.rating)) errs.push(['rating', 'Rating is required']);
  else if (body.rating < 1) errs.push(['rating', 'must be greater than or equal to 1']);
  else if (body.rating > 5) errs.push(['rating', 'must be less than or equal to 5']);
  if (body.comment && String(body.comment).length > 500) errs.push(['comment', 'size must be between 0 and 500']);
  if (errs.length) throw fieldErrors(errs);
  if (!state.bookings.some((b) => b.userId === u.id && b.status === 'COMPLETED' && b.station.id === st.summary.id)) {
    throw new HttpError(403, 'Only drivers who have charged at this station can review it');
  }
  if (body.bookingId) {
    const b = state.bookings.find((x) => x.id === Number(body.bookingId));
    if (!b) throw new HttpError(404, `Booking ${body.bookingId} not found`);
    if (b.userId !== u.id) throw new HttpError(403, 'This booking belongs to another user');
    if (b.station.id !== st.summary.id) throw new HttpError(400, 'This booking was not made at the selected station');
    if (state.reviewedBookings.has(b.id)) throw new HttpError(409, 'This booking has already been reviewed');
    state.reviewedBookings.add(b.id);
  }
  const s = sentimentOf(body.comment);
  const name = u.fullName.split(/\s+/); const short = name.length > 1 ? `${name[0]} ${name[name.length - 1][0]}.` : name[0];
  const r = { id: state.nextId('review'), userName: short, rating: body.rating, comment: body.comment ? String(body.comment).trim() : null, sentimentLabel: s.label, sentimentScore: s.score, createdAt: state.now() };
  state.reviews = state.reviews || {};
  (state.reviews[st.summary.id] ||= []).unshift(r);
  const sum = st.summary; const n = sum.reviewCount;
  sum.avgRating = Math.round(((sum.avgRating * n + body.rating) / (n + 1)) * 100) / 100; sum.reviewCount = n + 1;
  return reply(201, r, { Location: `/api/stations/${st.summary.id}/reviews` });
}

module.exports = [
  { method: 'POST', pattern: '/api/bookings/estimate', handler: estimateRoute },
  { method: 'POST', pattern: '/api/bookings', handler: create },
  { method: 'GET', pattern: '/api/bookings', handler: list },
  { method: 'POST', pattern: '/api/bookings/:id/confirm', handler: confirm },
  { method: 'POST', pattern: '/api/bookings/:id/cancel', handler: cancel },
  { method: 'POST', pattern: '/api/bookings/:id/check-in', handler: checkIn },
  { method: 'POST', pattern: '/api/bookings/:id/complete', handler: complete },
  { method: 'GET', pattern: '/api/bookings/:id/invoice', handler: invoice },
  { method: 'GET', pattern: '/api/bookings/:id', handler: ({ auth, params }) => core.publicDto(mine(auth(), params.id)) },
  { method: 'POST', pattern: '/api/stations/:id/reviews', handler: postReview },
];
