// POST /api/recommendations - deterministic implementation of the RecommendationService spec (20_backend_spec.md).
const state = require('../lib/state');
const { HttpError, fieldErrors, haversine, round, parseNaive, toNaive, dowOf, hourOf, MIN, HOUR, ceilTo } = require('../lib/util');
const { estimate, compatible, GENERIC, acceptedKw } = require('../lib/estimator');
const { findEarliest, SLOT } = require('../lib/availability');
const { liveSummary } = require('../lib/stations');

const PRESETS = {
  BALANCED: { distance: 0.22, wait: 0.22, crowding: 0.2, price: 0.14, reliability: 0.12, speed: 0.1 },
  FASTEST: { distance: 0.2, wait: 0.25, crowding: 0.05, price: 0.05, reliability: 0.05, speed: 0.4 },
  CHEAPEST: { distance: 0.15, wait: 0.1, crowding: 0.1, price: 0.5, reliability: 0.1, speed: 0.05 },
  LEAST_CROWDED: { distance: 0.15, wait: 0.2, crowding: 0.45, price: 0.05, reliability: 0.1, speed: 0.05 },
};
const KEYS = ['distance', 'wait', 'crowding', 'price', 'reliability', 'speed'];

function normaliseWeights(preset, custom) {
  const base = { ...PRESETS[preset] };
  if (custom) {
    const c = { ...custom }; if (c.waiting !== undefined && c.wait === undefined) c.wait = c.waiting;
    const given = KEYS.filter((k) => typeof c[k] === 'number');
    if (given.length) { KEYS.forEach((k) => { base[k] = typeof c[k] === 'number' ? Math.max(0, c[k]) : base[k]; }); }
  }
  const sum = KEYS.reduce((s, k) => s + base[k], 0) || 1;
  KEYS.forEach((k) => { base[k] = round(base[k] / sum, 4); });
  return base;
}

function recommend(body, extra = {}) {
  const errs = [];
  if (typeof body.latitude !== 'number') errs.push(['latitude', 'latitude is required']);
  if (typeof body.longitude !== 'number') errs.push(['longitude', 'longitude is required']);
  if (errs.length) throw fieldErrors(errs);
  const basePreset = PRESETS[body.preset] ? body.preset : 'BALANCED';
  const cw = body.weights || {};
  const custom = ['distance', 'wait', 'waiting', 'crowding', 'price', 'reliability', 'speed'].some((k) => typeof cw[k] === 'number');
  const preset = custom ? null : basePreset; // real backend reports preset=null when custom weights are sent
  const weights = normaliseWeights(basePreset, body.weights);
  const radius = body.radiusKm || 25, limit = body.limit || 8;
  const socStart = body.socStart ?? 20, socTarget = body.socTarget ?? 80;
  if (socTarget <= socStart) throw fieldErrors([['socTarget', 'Target charge must be higher than the start charge']]);
  const now = state.nowMs();
  const vehicle = body.vehicleId ? state.vehicles.find((v) => v.id === Number(body.vehicleId)) : null;
  if (body.vehicleId && !vehicle) throw new HttpError(404, 'Vehicle not found');
  const v = vehicle || { ...GENERIC, connectorCodes: body.connectorCodes?.length ? body.connectorCodes : GENERIC.connectorCodes };
  const requested = body.arrivalTime ? parseNaive(body.arrivalTime) : now;

  const cands = [];
  for (const st of state.stations) {
    const s = st.summary;
    const distanceKm = haversine(body.latitude, body.longitude, s.latitude, s.longitude);
    if (distanceKm > radius) continue;
    const eta = Math.ceil((distanceKm * 1.35) / 24 * 60);
    const arrival = Math.max(requested, now + eta * MIN);
    const arrivalGrid = ceilTo(arrival, SLOT);
    let best = null;
    for (const p of st.points) {
      if (p.status !== 'ACTIVE' || !compatible(v, p)) continue;
      const est0 = estimate({ vehicle: v, point: p, socStart, socTarget, startMs: arrivalGrid });
      const start = findEarliest(st, p, arrival, est0.slots, 12);
      if (start === null) continue;
      const est = estimate({ vehicle: v, point: p, socStart, socTarget, startMs: start });
      const cand = { st, p, est, start, wait: Math.max(0, Math.floor((start - arrival) / MIN)) };
      // best point = earliest start, then lower cost, then lower point id (as RecommendationService.better)
      if (!best || start < best.start || (start === best.start && (est.estimatedCost < best.est.estimatedCost || (est.estimatedCost === best.est.estimatedCost && p.id < best.p.id)))) best = cand;
    }
    if (!best) continue;
    const ci = state.crowding(s.id, dowOf(best.start), hourOf(best.start));
    cands.push({ ...best, distanceKm, eta, arrival, ci, accepted: best.est.acceptedKw });
  }
  const empty = (msg) => ({ generatedAt: state.now(), preset, weights, energyKwhNeeded: round(((socTarget - socStart) / 100) * v.batteryKwh / 0.92, 2), items: [], nearestBaseline: null, savings: { minutesSaved: 0, rupeesSaved: 0, summary: msg }, ...extra });
  if (!cands.length) return empty('No compatible station with a free slot was found nearby.');
  cands.sort((a, b) => a.st.summary.id - b.st.summary.id);
  const costs = cands.map((c) => c.est.estimatedCost);
  const minC = Math.min(...costs), maxC = Math.max(...costs);
  for (const c of cands) {
    const comp = {
      distance: 1 - Math.min(c.distanceKm / radius, 1), wait: 1 - Math.min(c.wait / 90, 1), crowding: 1 - Math.min(1, c.ci / 100),
      price: 1 - (c.est.estimatedCost - minC) / (maxC - minC + 1e-6), reliability: Math.min(1, c.st.summary.reliabilityScore / 100), speed: Math.min(c.accepted / 120, 1),
    };
    c.breakdown = {}; let hundredths = 0;
    for (const k of KEYS) {
      const x = Math.max(0, Math.min(1, comp[k])), h = Math.round(weights[k] * x * 10000);
      hundredths += h; c.breakdown[k] = { score: round(x, 4), weight: weights[k], contribution: h / 100 }; // score/weight are 0..1 fractions; contribution in points
    }
    c.score = hundredths / 100;
  }
  let nearest = cands[0];
  for (const c of cands) if (c.distanceKm < nearest.distanceKm) nearest = c;
  const ranked = [...cands].sort((a, b) => Math.round(b.score * 1e9) - Math.round(a.score * 1e9) || a.st.summary.id - b.st.summary.id).slice(0, limit);

  const winner = (cmp) => ranked.reduce((m, c) => (cmp(c) < cmp(m) ? c : m), ranked[0]); // first (lowest id order of ranked ties handled below)
  const tagMap = new Map(ranked.map((c) => [c, []]));
  const addTag = (label, fn) => { let w = ranked[0]; for (const c of ranked) { const d = fn(c) - fn(w); if (d < 0 || (d === 0 && c.st.summary.id < w.st.summary.id)) w = c; } tagMap.get(w).push(label); };
  addTag('Nearest', (c) => c.distanceKm); addTag('Fastest', (c) => c.wait + c.est.durationMinutes);
  addTag('Cheapest', (c) => c.est.estimatedCost); addTag('Quietest', (c) => c.ci);
  tagMap.get(ranked[0]).unshift('Best overall');
  const hhmm = (ms) => toNaive(ms).slice(11, 16);

  const items = ranked.map((c, i) => {
    const s = liveSummary(c.st, body.latitude, body.longitude);
    const reasons = [`${c.distanceKm.toFixed(1)} km away, ~${c.eta} min drive`];
    reasons.push(c.wait === 0 ? `No wait: slot free at ${hhmm(c.start)}` : `Slot free at ${hhmm(c.start)} (${c.wait} min after you arrive)`);
    reasons.push(`Predicted crowding ${state.crowdingLevel(c.ci)} (${Math.round(c.ci)}) at that hour`);
    reasons.push(`Charges at up to ${Math.round(c.accepted)} kW - about ${c.est.durationMinutes} min for ${socStart}% to ${socTarget}%`);
    if (c.st !== nearest.st) {
      const cheaper = nearest.est.estimatedCost - c.est.estimatedCost;
      if (cheaper >= 1) reasons.push(`₹${Math.round(cheaper)} cheaper than the nearest station`);
      if (nearest.wait - c.wait >= 5) reasons.push(`${nearest.wait - c.wait} min less waiting than the nearest station`);
    } else reasons.push('Your nearest compatible station');
    if (c.st.summary.reliabilityScore >= 80) reasons.push(`Highly reliable station (score ${Math.round(c.st.summary.reliabilityScore)})`);
    return {
      rank: i + 1, score: c.score, station: { ...s, distanceKm: round(c.distanceKm, 2) },
      point: { pointId: c.p.id, label: c.p.label, connectorCode: c.p.connectorCode, powerKw: c.p.powerKw, tariffPerKwh: c.p.tariffPerKwh },
      etaMinutes: c.eta, arrivalTime: toNaive(c.arrival), slotStart: toNaive(c.start), slotEnd: toNaive(c.start + c.est.slots * SLOT), slots: c.est.slots,
      waitMinutes: c.wait, chargeMinutes: c.est.durationMinutes, estimatedCost: c.est.estimatedCost, effectiveTariff: c.est.effectiveTariff,
      crowdingIndex: round(c.ci, 1), crowdingLevel: state.crowdingLevel(c.ci), breakdown: c.breakdown, reasons, tags: tagMap.get(c),
    };
  });

  const baseline = { stationId: nearest.st.summary.id, stationName: nearest.st.summary.name, distanceKm: round(nearest.distanceKm, 2), etaMinutes: nearest.eta, waitMinutes: nearest.wait, crowdingIndex: round(nearest.ci, 1), estimatedCost: nearest.est.estimatedCost };
  const best = ranked[0], base = Math.max(requested, now), nm = nearest.st.summary.name;
  let savings;
  if (best.st === nearest.st) savings = { minutesSaved: 0, rupeesSaved: 0, summary: 'Your nearest compatible station is also the best match - no detour needed.' };
  else {
    const minutesSaved = Math.max(0, Math.round((nearest.start - base) / MIN) - Math.round((best.start - base) / MIN));
    const rupeesSaved = Math.max(0, round(nearest.est.estimatedCost - best.est.estimatedCost, 2));
    const money = Math.round(rupeesSaved);
    savings = { minutesSaved, rupeesSaved, summary: minutesSaved > 0 && rupeesSaved >= 1 ? `Saves ${minutesSaved} min and ₹${money} compared with the nearest station (${nm}).`
      : minutesSaved > 0 ? `Saves ${minutesSaved} min compared with the nearest station (${nm}).`
      : rupeesSaved >= 1 ? `Saves ₹${money} compared with the nearest station (${nm}).`
      : `Similar time and cost to the nearest station (${nm}), with better crowding, speed or reliability.` };
  }
  return { generatedAt: state.now(), preset, weights, energyKwhNeeded: round(((socTarget - socStart) / 100) * v.batteryKwh / 0.92, 2), items, nearestBaseline: baseline, savings, ...extra };
}

module.exports = [{ method: 'POST', pattern: '/api/recommendations', handler: ({ body }) => recommend(body) }];
module.exports.recommend = recommend; // reusable by trip / fleet / reminder mocks: require('./recommendations').recommend
