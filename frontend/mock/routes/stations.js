// Stations: list (filters/sort/distance/pagination), detail, availability grid, forecast, reviews.
const state = require('../lib/state');
const { HttpError, reply, paginate, parseNaive, toNaive, dateOf, dowOf, hourOf, mulberry32, hashStr, HOUR, DAY, floorTo } = require('../lib/util');
const { slotState, SLOT } = require('../lib/availability');
const { liveSummary } = require('../lib/stations');
const { compatible } = require('../lib/estimator');

const num = (v) => (v === undefined || v === '' ? undefined : Number(v));
const SORTS = ['distance', 'rating', 'price', 'reliability'];

function list({ query }) {
  const sortKey = query.sort ? String(query.sort).trim().toLowerCase() : null;
  if (sortKey && !SORTS.includes(sortKey)) throw new HttpError(400, 'sort must be one of distance, rating, price, reliability');
  const lat = num(query.lat), lon = num(query.lon), radius = num(query.radiusKm), minKw = num(query.minKw);
  const q = (query.q || '').toLowerCase().trim();
  let rows = state.stations.filter((st) => {
    const s = st.summary;
    if (query.connector && !s.connectors.some((c) => c.code === query.connector)) return false;
    if (minKw && !s.connectors.some((c) => c.maxKw >= minKw)) return false;
    if (query.amenity && !st.amenities.some((a) => a.name.toLowerCase() === String(query.amenity).toLowerCase() || String(a.id) === String(query.amenity))) return false;
    if (query.zone && s.zone.toLowerCase() !== String(query.zone).toLowerCase()) return false;
    if (q && !(`${s.name} ${s.zone} ${s.address} ${s.city}`.toLowerCase().includes(q))) return false;
    return true;
  }).map((st) => liveSummary(st, lat, lon));
  if (query.openNow === 'true' || query.openNow === 'false') rows = rows.filter((s) => s.openNow === (query.openNow === 'true'));
  if (radius && lat !== undefined) rows = rows.filter((s) => s.distanceKm <= radius);
  const hasPos = lat !== undefined && lon !== undefined && !Number.isNaN(lat) && !Number.isNaN(lon);
  const key = sortKey || (hasPos ? 'distance' : 'name');
  const byName = (a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  const prim = { rating: (a, b) => b.avgRating - a.avgRating, price: (a, b) => a.minTariff - b.minTariff, reliability: (a, b) => b.reliabilityScore - a.reliabilityScore, distance: hasPos ? (a, b) => a.distanceKm - b.distanceKm : byName, name: byName }[key];
  rows.sort((a, b) => prim(a, b) || a.id - b.id);
  return paginate(rows, { ...query, size: Math.min(Math.max(parseInt(query.size, 10) || 12, 1), 100) });
}

function detail({ params }) {
  const st = state.findStation(params.id);
  if (!st) throw new HttpError(404, `Station ${params.id} not found`);
  return { ...st, summary: liveSummary(st) };
}

function availability({ params, query }) {
  const st = state.findStation(params.id);
  if (!st) throw new HttpError(404, `Station ${params.id} not found`);
  const now = state.nowMs();
  const date = query.date || dateOf(now);
  const day0 = parseNaive(date);
  if (Number.isNaN(day0)) throw new HttpError(400, 'Invalid date');
  const vehicle = query.vehicleId ? state.vehicles.find((v) => v.id === Number(query.vehicleId)) : null;
  const s = st.summary, dow = dowOf(day0);
  return {
    stationId: s.id, date, slotMinutes: 30, openHour: s.openHour, closeHour: s.closeHour, now: toNaive(now),
    points: st.points.map((p) => ({
      pointId: p.id, label: p.label, connectorCode: p.connectorCode, powerKw: p.powerKw, tariffPerKwh: p.tariffPerKwh,
      compatible: vehicle ? compatible(vehicle, p) : true,
      slots: Array.from({ length: 48 }, (_, i) => ({ start: toNaive(day0 + i * SLOT), state: slotState(st, p, day0 + i * SLOT) })),
    })),
    crowdingByHour: Array.from({ length: 24 }, (_, h) => Math.round(state.crowding(s.id, dow, h))),
  };
}

function forecast({ params }) {
  const st = state.findStation(params.id);
  if (!st) throw new HttpError(404, `Station ${params.id} not found`);
  const grid = [];
  for (let d = 1; d <= 7; d++) for (let h = 0; h < 24; h++) {
    const ci = state.crowding(st.summary.id, d, h);
    grid.push({ dayOfWeek: d, hour: h, expectedSessions: Math.round((ci / 100) * st.points.length * 0.9 * 100) / 100, crowdingIndex: ci, level: state.crowdingLevel(ci) });
  }
  const start = floorTo(state.nowMs(), HOUR) + HOUR;
  const next = Array.from({ length: 24 }, (_, i) => start + i * HOUR)
    .filter((t) => hourOf(t) >= st.summary.openHour && hourOf(t) < st.summary.closeHour)
    .map((t) => ({ start: toNaive(t), crowdingIndex: state.crowding(st.summary.id, dowOf(t), hourOf(t)) }))
    .sort((a, b) => a.crowdingIndex - b.crowdingIndex || a.start.localeCompare(b.start)).slice(0, 5).sort((a, b) => a.start.localeCompare(b.start));
  return { stationId: st.summary.id, grid, quietestNext24h: next };
}

const COMMENTS = [
  [5, 'Charger worked flawlessly, no queue and the lounge was comfortable. Highly recommended.'], [4, 'Fast charging and clean station. Slightly pricey at peak hours.'],
  [3, 'Okay experience. Had to wait about 15 minutes for a free bay.'], [5, 'Great location with a cafe nearby. Staff were helpful.'],
  [2, 'One connector was out of order and the app was slow. Not great.'], [4, 'Reliable station, reasonable tariff at night.'], [5, 'Super quick 80% charge, smooth payment.'], [1, 'Terrible: station was crowded and the charger kept failing.'],
];
const reviewsFor = (st) => {
  const rng = mulberry32(hashStr('rev' + st.summary.id));
  const names = ['Aarav M.', 'Priya N.', 'Rahul D.', 'Sneha I.', 'Karan S.', 'Meera P.', 'Vikram J.', 'Isha K.'];
  return COMMENTS.map(([rating, comment], i) => ({
    id: st.summary.id * 100 + i, userName: names[Math.floor(rng() * names.length)], rating, comment,
    sentimentLabel: rating >= 4 ? 'POSITIVE' : rating === 3 ? 'NEUTRAL' : 'NEGATIVE', sentimentScore: [-0.8, -0.5, 0, 0.3, 0.6, 0.8][Math.min(5, rating)] ?? 0,
    createdAt: toNaive(parseNaive('2026-09-30T10:00:00') - i * 3.3 * DAY),
  }));
};

module.exports = [
  { method: 'GET', pattern: '/api/stations', handler: list },
  { method: 'GET', pattern: '/api/stations/:id', handler: detail },
  { method: 'GET', pattern: '/api/stations/:id/availability', handler: availability },
  { method: 'GET', pattern: '/api/stations/:id/forecast', handler: forecast },
  { method: 'GET', pattern: '/api/stations/:id/reviews', handler: ({ params, query }) => {
    const st = state.findStation(params.id); if (!st) throw new HttpError(404, 'Station not found');
    const extra = (state.reviews || {})[st.summary.id] || [];
    return paginate([...extra, ...reviewsFor(st)], { size: 10, ...query });
  } },
  { method: 'POST', pattern: '/api/stations/:id/reviews', handler: ({ params, auth, body }) => {
    const u = auth(); const st = state.findStation(params.id); if (!st) throw new HttpError(404, 'Station not found');
    if (!body.rating || body.rating < 1 || body.rating > 5) throw new HttpError(400, 'Validation failed', { fieldErrors: [{ field: 'rating', message: 'Rating must be between 1 and 5' }] });
    const eligible = state.bookings.some((b) => b.userId === u.id && b.status === 'COMPLETED' && b.station?.id === st.summary.id);
    if (!eligible) throw new HttpError(403, 'Only drivers with a completed charging session at this station can review it.');
    state.reviews = state.reviews || {}; (state.reviews[st.summary.id] ||= []).unshift({ id: state.nextId('review'), userName: u.fullName, rating: body.rating, comment: body.comment || '', sentimentLabel: body.rating >= 4 ? 'POSITIVE' : body.rating === 3 ? 'NEUTRAL' : 'NEGATIVE', sentimentScore: 0.3, createdAt: state.now() });
    return reply(201, state.reviews[st.summary.id][0]);
  } },
];
