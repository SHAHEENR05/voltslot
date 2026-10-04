// Analytics mock (PS-IV). Serves the real fixtures in ../fixtures/analytics and re-scales them by the query filters so the UI visibly reacts:
//  * date range  -> DAY series is sliced (WEEK / MONTH are aggregated from it), KPIs + previous period are recomputed from the series
//  * zone / tier / connector / operator -> crude share factors (zones.json, mix__tier.json, mix__connector.json, station leaderboard)
// ADMIN / OPERATOR only (an OPERATOR is silently restricted to its own operator, like the real AnalyticsService).
const fs = require('fs');
const path = require('path');
const state = require('../lib/state');
const { HttpError, reply, dateOf, mulberry32, hashStr } = require('../lib/util');

const DIR = path.resolve(__dirname, '../fixtures/analytics');
const cache = {};
const fx = (n) => cache[n] || (cache[n] = JSON.parse(fs.readFileSync(path.join(DIR, `${n}.json`), 'utf8')));
const clone = (o) => JSON.parse(JSON.stringify(o));
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;

// ------------------------------------------------------------------ date helpers (all yyyy-MM-dd strings, UTC maths only)
const ms = (d) => Date.parse(`${d}T00:00:00Z`);
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const addDays = (d, n) => iso(ms(d) + n * 86400000);
const diffDays = (a, b) => Math.round((ms(b) - ms(a)) / 86400000);
const validDate = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(ms(s)) ? s : null);
const mondayOf = (d) => { const dow = new Date(ms(d)).getUTCDay(); return addDays(d, -((dow + 6) % 7)); };

// ------------------------------------------------------------------ base data
const DAYS = () => fx('trend__day').series; // 2025-10-01 .. 2026-10-03
const FIRST = () => DAYS()[0].period;
const BASE = () => { const o = fx('overview'); return { from: o.from, to: o.to }; };
const sumSeries = (from, to) => {
  const a = { sessions: 0, energyKwh: 0, revenue: 0, days: 0 };
  for (const p of DAYS()) if (p.period >= from && p.period <= to) { a.sessions += p.sessions; a.energyKwh += p.energyKwh; a.revenue += p.revenue; a.days++; }
  return a;
};
const operators = () => {
  const m = {};
  for (const s of require('../fixtures/stations.json')) m[s.summary.operatorId] = s.summary.operatorName;
  return m;
};
const stationUnion = () => {
  if (cache.__union) return cache.__union;
  const m = new Map();
  for (const n of ['stations', 'stations__revenue', 'stations__utilization_asc']) for (const s of fx(n)) if (!m.has(s.stationId)) m.set(s.stationId, s);
  return (cache.__union = [...m.values()]);
};

/** Resolve filters + scale factors for one request. */
function resolve(query, user) {
  const today = dateOf(state.nowMs());
  const to = validDate(query.to) || today;
  const from = validDate(query.from) || addDays(to, -89);
  if (from > to) throw new HttpError(400, "'from' must not be after 'to'");
  const zone = query.zone || null, connector = query.connector || null, tier = query.tier || null;
  const opMap = operators();
  let operatorId = query.operatorId ? Number(query.operatorId) : null;
  if (user.role === 'OPERATOR') operatorId = user.operatorId;
  if (zone && !fx('zones').some((z) => z.zone === zone)) throw new HttpError(400, `Unknown zone '${zone}'`);

  const baseWin = BASE();
  const baseSum = sumSeries(baseWin.from, baseWin.to);
  const eff = { from: from < FIRST() ? FIRST() : from, to };
  const cur = sumSeries(eff.from, eff.to);
  const spanDays = Math.max(1, diffDays(eff.from, eff.to) + 1);
  const safe = (a, b) => (b ? a / b : 0);
  const date = {
    s: safe(cur.sessions, baseSum.sessions), e: safe(cur.energyKwh, baseSum.energyKwh), r: safe(cur.revenue, baseSum.revenue),
    daily: safe(cur.sessions / spanDays, baseSum.sessions / baseSum.days), // per-day intensity vs base window
  };
  const zoneRow = zone ? fx('zones').find((z) => z.zone === zone) : null;
  const zoneShare = zoneRow ? zoneRow.sharePct / 100 : 1;
  const connShare = connector ? (fx('mix__connector').find((m) => m.label === connector)?.sharePct ?? 0) / 100 : 1;
  const tierShare = tier ? (fx('mix__tier').find((m) => m.label === tier)?.sharePct ?? 0) / 100 : 1;
  let opShare = 1;
  if (operatorId) {
    const name = opMap[operatorId];
    const un = stationUnion();
    const tot = un.reduce((a, s) => a + s.sessions, 0);
    opShare = Math.max(0.01, un.filter((s) => s.operatorName === name).reduce((a, s) => a + s.sessions, 0) / (tot || 1));
  }
  const F = zoneShare * connShare * tierShare * opShare;
  const FnoZone = connShare * tierShare * opShare;
  return { today, from, to, eff, zone, connector, tier, operatorId, operatorName: operatorId ? opMap[operatorId] : null, date, zoneRow, zoneShare, connShare, tierShare, opShare, F, FnoZone, spanDays, cur };
}

const auth = (c) => c.auth('ADMIN', 'OPERATOR');
const route = (p, fn) => ({ method: 'GET', pattern: `/api/analytics/${p}`, handler: (c) => { const u = auth(c); return fn(resolve(c.query, u), c.query, c); } });

// ------------------------------------------------------------------ overview
function scaleKpis(base, sums, q) {
  const days = Math.max(1, sums.days);
  const baseWin = BASE(); const baseSum = sumSeries(baseWin.from, baseWin.to);
  const s = baseSum.sessions ? (sums.sessions * q.F) / baseSum.sessions : 0;
  const e = baseSum.energyKwh ? (sums.energyKwh * q.F) / baseSum.energyKwh : 0;
  const r = baseSum.revenue ? (sums.revenue * q.F) / baseSum.revenue : 0;
  const daily = baseSum.sessions ? (sums.sessions / days) / (baseSum.sessions / baseSum.days) : 0;
  const utilBase = q.zoneRow ? q.zoneRow.utilizationPct : base.utilizationPct;
  return {
    ...base,
    sessions: Math.round(base.sessions * s), energyKwh: r1(base.energyKwh * e), revenue: r2(base.revenue * r),
    utilizationPct: r2(utilBase * daily), uniqueUsers: Math.round(base.uniqueUsers * Math.pow(s, 0.8)), bookings: Math.round(base.bookings * s),
    co2AvoidedKg: r1(base.co2AvoidedKg * e),
  };
}
const NUM_KEYS = ['sessions', 'energyKwh', 'revenue', 'avgSessionKwh', 'avgDurationMin', 'utilizationPct', 'uniqueUsers', 'bookings', 'cancellationRatePct', 'noShowRatePct', 'co2AvoidedKg', 'avgLeadHours'];

function overview(q) {
  const base = fx('overview');
  if (q.F === 1 && q.from === base.from && q.to === base.to) return clone(base); // default window = the real fixture
  const len = diffDays(q.from, q.to) + 1;
  const pFrom = addDays(q.from, -len), pTo = addDays(q.from, -1);
  const cur = scaleKpis(base.kpis, q.cur, q);
  const pSum = sumSeries(pFrom < FIRST() ? FIRST() : pFrom, pTo);
  const prev = pSum.sessions ? scaleKpis(base.previous, pSum, q) : { ...Object.fromEntries(NUM_KEYS.map((k) => [k, 0])), peakHour: null };
  const deltaPct = {};
  for (const k of NUM_KEYS) deltaPct[k] = prev[k] ? r1(((cur[k] - prev[k]) / prev[k]) * 100) : null;
  const spark = DAYS().filter((p) => p.period >= q.eff.from && p.period <= q.to).slice(-30)
    .map((p) => ({ date: p.period, sessions: Math.round(p.sessions * q.F), revenue: r2(p.revenue * q.F), energyKwh: r1(p.energyKwh * q.F) }));
  return { from: q.from, to: q.to, kpis: q.cur.sessions ? cur : { ...cur, peakHour: null }, previous: prev, deltaPct, sparkline: spark };
}

// ------------------------------------------------------------------ trend
function trend(q, query) {
  const gran = String(query.granularity || 'DAY').toUpperCase();
  if (!['DAY', 'WEEK', 'MONTH'].includes(gran)) throw new HttpError(400, 'granularity must be DAY, WEEK or MONTH');
  const full = q.F === 1 && q.from <= FIRST() && q.to >= fx('overview').to;
  if (full && gran !== 'DAY') return clone(fx(gran === 'WEEK' ? 'trend__week' : 'trend__month'));
  const pts = DAYS().filter((p) => p.period >= q.from && p.period <= q.to);
  let series;
  if (gran === 'DAY') series = pts.map((p) => ({ ...p }));
  else {
    const m = new Map();
    for (const p of pts) {
      const k = gran === 'WEEK' ? mondayOf(p.period) : p.period.slice(0, 7);
      const a = m.get(k) || { period: k, sessions: 0, energyKwh: 0, revenue: 0 };
      a.sessions += p.sessions; a.energyKwh += p.energyKwh; a.revenue += p.revenue; m.set(k, a);
    }
    series = [...m.values()];
  }
  series = series.map((p) => ({
    period: p.period, sessions: Math.round(p.sessions * q.F), energyKwh: r1(p.energyKwh * q.F), revenue: r2(p.revenue * q.F),
    avgTariff: p.energyKwh ? r2(p.revenue / p.energyKwh) : 0,
  }));
  const f = clone(fx('trend__day'));
  const forecast = f.forecast.map((p) => ({ date: p.date, predicted: r1(p.predicted * q.F), lower: r1(p.lower * q.F), upper: r1(p.upper * q.F) }));
  const anomalies = f.anomalies.filter((a) => a.date >= q.from && a.date <= q.to).map((a) => ({ ...a, value: r1(a.value * q.F), expected: r1(a.expected * q.F) }));
  return { granularity: gran, forecastMethod: f.forecastMethod, series, forecast, anomalies };
}

// ------------------------------------------------------------------ heatmap / zones / mix
function heatmap(q, query) {
  const metric = query.metric === 'revenue' ? 'revenue' : 'sessions';
  const k = (metric === 'revenue' ? q.date.r : q.date.s) * q.F * (query.stationId ? 0.12 : 1);
  return fx(`heatmap__${metric}`).map((c) => ({ ...c, value: metric === 'revenue' ? r2(c.value * k) : Math.round(c.value * k) }));
}
function zones(q) {
  let rows = clone(fx('zones'));
  if (q.zone) rows = rows.filter((z) => z.zone === q.zone);
  rows = rows.map((z) => ({ ...z, sessions: Math.round(z.sessions * q.date.s * q.FnoZone), energyKwh: r1(z.energyKwh * q.date.e * q.FnoZone), revenue: r2(z.revenue * q.date.r * q.FnoZone), utilizationPct: r2(z.utilizationPct * q.date.daily) }));
  const tot = rows.reduce((a, z) => a + z.sessions, 0) || 1;
  return rows.map((z) => ({ ...z, avgRevenuePerSession: z.sessions ? r2(z.revenue / z.sessions) : 0, sharePct: r1((z.sessions / tot) * 100) })).sort((a, b) => b.revenue - a.revenue);
}
const MIX_BY = ['connector', 'vehicleCategory', 'payment', 'source', 'tier', 'dayPart'];
function mix(q, query) {
  const by = query.by || 'connector';
  if (!MIX_BY.includes(by)) throw new HttpError(400, `by must be one of ${MIX_BY.join(', ')}`);
  let rows = clone(fx(`mix__${by}`));
  let k = q.F;
  if (by === 'connector' && q.connector) { rows = rows.filter((m) => m.label === q.connector); k = q.F / (q.connShare || 1); }
  if (by === 'tier' && q.tier) { rows = rows.filter((m) => m.label === q.tier); k = q.F / (q.tierShare || 1); }
  rows = rows.map((m) => ({ ...m, sessions: Math.round(m.sessions * q.date.s * k), energyKwh: r1(m.energyKwh * q.date.e * k), revenue: r2(m.revenue * q.date.r * k) }));
  const tot = rows.reduce((a, m) => a + m.sessions, 0) || 1;
  return rows.map((m) => ({ ...m, sharePct: r1((m.sessions / tot) * 100) }));
}

// ------------------------------------------------------------------ funnel / segments / lead-time
function funnel(q) {
  return fx('funnel').map((s) => ({ ...s, sessions: Math.round(s.sessions * q.date.s * q.F) }));
}
function segments(q) {
  const u = Math.pow(q.date.s * q.F, 0.8);
  return fx('segments').map((s) => {
    const users = Math.max(1, Math.round(s.users * u)), sessions = Math.round(s.sessions * q.date.s * q.F), revenue = r2(s.revenue * q.date.r * q.F);
    return { ...s, users, sessions, energyKwh: r1(s.energyKwh * q.date.e * q.F), revenue, revenuePerUser: r2(revenue / users), avgSessionsPerUser: r1(sessions / users) };
  });
}
function leadTime(q) {
  return fx('lead-time').map((b) => ({ ...b, bookings: Math.round(b.bookings * q.date.s * q.F) }));
}

// ------------------------------------------------------------------ stations
const SORTS = { sessions: 'sessions', revenue: 'revenue', energy: 'energyKwh', utilization: 'utilizationPct', sessionsPerPoint: 'sessionsPerPoint', rating: 'avgRating', reliability: 'reliabilityScore' };
function stations(q, query) {
  const sortKey = SORTS[query.sort || 'sessions'];
  if (!sortKey) throw new HttpError(400, `sort must be one of ${Object.keys(SORTS).join(', ')}`);
  const asc = String(query.order || 'desc').toLowerCase() === 'asc';
  const limit = Math.max(1, Math.min(100, parseInt(query.limit, 10) || 10));
  const k = q.connShare;
  let rows = clone(stationUnion());
  if (q.zone) rows = rows.filter((s) => s.zone === q.zone);
  if (q.tier) rows = rows.filter((s) => s.tier === q.tier);
  if (q.operatorName) rows = rows.filter((s) => s.operatorName === q.operatorName);
  rows = rows.map((s) => ({
    ...s, sessions: Math.round(s.sessions * q.date.s * k), energyKwh: r1(s.energyKwh * q.date.e * k), revenue: r2(s.revenue * q.date.r * k),
    utilizationPct: r2(s.utilizationPct * q.date.daily * (0.4 + 0.6 * k)), sessionsPerPoint: r1(s.sessionsPerPoint * q.date.s * k),
  }));
  rows.sort((a, b) => (asc ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey]));
  return rows.slice(0, limit);
}

// ------------------------------------------------------------------ sentiment / weather / cohorts / insights
function sentiment(q) {
  const s = clone(fx('sentiment'));
  const k = Math.max(0.05, q.date.s * q.F);
  const inFilter = (st) => (!q.zone || st.zone === q.zone);
  s.reviews = Math.max(1, Math.round(s.reviews * k));
  s.labels = s.labels.map((l) => ({ ...l, count: Math.round(l.count * k) }));
  s.positiveKeywords = s.positiveKeywords.map((w) => ({ ...w, freq: Math.max(1, Math.round(w.freq * k)) }));
  s.negativeKeywords = s.negativeKeywords.map((w) => ({ ...w, freq: Math.max(1, Math.round(w.freq * k)) }));
  s.bestStations = s.bestStations.filter(inFilter); s.worstStations = s.worstStations.filter(inFilter);
  const months = s.monthly.filter((m) => m.month >= q.from.slice(0, 7) && m.month <= q.to.slice(0, 7));
  s.monthly = (months.length >= 2 ? months : s.monthly).map((m) => ({ ...m, reviews: Math.max(1, Math.round(m.reviews * q.F)) }));
  return s;
}
function weather(q) {
  const w = clone(fx('weather-impact'));
  const dayK = Math.min(1, q.cur.days / 89);
  const f = (row) => ({ ...row, days: Math.max(1, Math.round(row.days * dayK)), avgSessionsPerDay: r1(row.avgSessionsPerDay * q.F), avgRevenuePerDay: r2(row.avgRevenuePerDay * q.F) });
  w.byCondition = w.byCondition.map(f); w.byDayType = w.byDayType.map(f);
  return w;
}
function cohorts(q) {
  return fx('cohorts').filter((c) => c.cohort >= q.from.slice(0, 7) || q.from <= FIRST())
    .map((c) => ({ ...c, cohortSize: Math.max(1, Math.round(c.cohortSize * q.F)), activeUsers: Math.round(c.activeUsers * q.F) }));
}
const inrIn = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
function insights(q) {
  const list = clone(fx('insights'));
  const o = overview(q);
  const d = o.deltaPct.revenue;
  list[0].text = `Revenue was ${inrIn(o.kpis.revenue)} from ${o.kpis.sessions.toLocaleString('en-IN')} sessions${d === null ? '' : `, ${d >= 0 ? 'up' : 'down'} ${Math.abs(d)}% on the previous period`}.`;
  const bits = [q.zone && `zone ${q.zone}`, q.tier && `${q.tier} tier`, q.connector && `${q.connector} connectors`, q.operatorName && `operator ${q.operatorName}`].filter(Boolean);
  if (bits.length) list.unshift({ category: 'FILTER', text: `Showing ${bits.join(', ')} only - ${r1(q.F * 100)}% of the network's sessions.` });
  return list;
}

// ------------------------------------------------------------------ CSV export
function exportCsv(q, _query, c) {
  const rng = mulberry32(hashStr(`${q.from}${q.to}${q.zone}${q.tier}${q.connector}${q.operatorId}`));
  let st = stationUnion();
  if (q.zone) st = st.filter((s) => s.zone === q.zone);
  if (q.tier) st = st.filter((s) => s.tier === q.tier);
  if (q.operatorName) st = st.filter((s) => s.operatorName === q.operatorName);
  if (!st.length) st = stationUnion();
  const conns = q.connector ? [q.connector] : ['CCS2', 'TYPE2', 'LECCS', 'BHARAT_DC', 'CHADEMO'];
  const cats = ['CAR', 'CAR', 'CAR', 'TWO_WHEELER', 'LCV', 'THREE_WHEELER'], pays = ['WALLET', 'UPI', 'CARD'];
  const span = Math.max(1, diffDays(q.from, q.to) + 1);
  const lines = ['session_id,start,station,zone,connector,vehicle_category,energy_kwh,duration_min,revenue_inr,payment'];
  for (let i = 0; i < 60; i++) {
    const s = st[Math.floor(rng() * st.length)];
    const day = addDays(q.from, Math.floor(rng() * span));
    const hh = String(Math.floor(6 + rng() * 17)).padStart(2, '0'), mm = String(Math.floor(rng() * 60)).padStart(2, '0');
    const kwh = r1(4 + rng() * 40);
    lines.push([10000 + i, `${day}T${hh}:${mm}:00`, `"${s.name}"`, `"${s.zone}"`, conns[Math.floor(rng() * conns.length)], cats[Math.floor(rng() * cats.length)], kwh, Math.round(kwh * 3.4 + 20), r2(kwh * (11 + rng() * 9)), pays[Math.floor(rng() * pays.length)]].join(','));
  }
  const csv = lines.join('\n') + '\n';
  // The mock server JSON-encodes handler results; patch this one response so it goes out as a CSV attachment.
  const { res } = c;
  const wh = res.writeHead.bind(res), end = res.end.bind(res);
  res.writeHead = (status, headers) => wh(status, { ...headers, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="chargeiq-sessions.csv"' });
  res.end = () => end(csv);
  return reply(200, {});
}

module.exports = [
  route('overview', overview),
  route('trend', trend),
  route('heatmap', heatmap),
  route('zones', zones),
  route('mix', mix),
  route('funnel', funnel),
  route('segments', segments),
  route('stations', stations),
  route('sentiment', sentiment),
  route('weather-impact', weather),
  route('cohorts', cohorts),
  route('lead-time', leadTime),
  route('insights', insights),
  route('export/sessions.csv', exportCsv),
];
