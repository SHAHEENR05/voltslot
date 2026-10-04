// Shared helpers for the mock API. CommonJS, dependency-free.
const crypto = require('crypto');

class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
/** return reply(201, body) from a handler to control the status code / headers. */
class Reply { constructor(status, body, headers = {}) { this.status = status; this.body = body; this.headers = headers; } }
const reply = (status, body, headers) => new Reply(status, body, headers);
const fieldErrors = (list) => new HttpError(400, 'Validation failed', { fieldErrors: list.map(([field, message]) => ({ field, message })) });

// ---- naive wall-clock time ("2026-10-03T09:30:00") <-> ms. We keep wall-clock fields in UTC fields so no TZ maths ever happens.
const MIN = 60000, HOUR = 3600000, DAY = 86400000;
const parseNaive = (s) => {
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
};
const toNaive = (ms) => new Date(ms).toISOString().slice(0, 19);
const dateOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const hourOf = (ms) => new Date(ms).getUTCHours();
/** ISO day of week 1=Mon..7=Sun (matches demand_forecast.json) */
const dowOf = (ms) => { const d = new Date(ms).getUTCDay(); return d === 0 ? 7 : d; };
const floorTo = (ms, step) => Math.floor(ms / step) * step;
const ceilTo = (ms, step) => Math.ceil(ms / step) * step;

const haversine = (a, b, c, d) => {
  const R = 6371, r = Math.PI / 180, dLat = (c - a) * r, dLon = (d - b) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

function paginate(list, query = {}) {
  const size = Math.max(1, Math.min(200, parseInt(query.size, 10) || 20));
  const page = Math.max(0, parseInt(query.page, 10) || 0);
  const totalElements = list.length;
  return { content: list.slice(page * size, page * size + size), page, size, totalElements, totalPages: Math.ceil(totalElements / size) };
}

function mulberry32(a) {
  return function rng() { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

// ---- fake JWT (HS256, NOT secure - demo only)
const SECRET = 'chargeiq-mock-secret';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function signJwt(payload) {
  const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64(payload);
  return `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`;
}
function verifyJwt(token) {
  const [h, p, s] = String(token).split('.');
  if (!s || crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url') !== s) return null;
  try { const pl = JSON.parse(Buffer.from(p, 'base64url').toString()); return pl.exp && pl.exp * 1000 < Date.now() ? null : pl; } catch { return null; }
}

/** '/stations/:id/availability' -> {re, keys} */
function compilePattern(pattern) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/\/+$/, '').replace(/:([A-Za-z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  return { re, keys };
}

module.exports = { HttpError, Reply, reply, fieldErrors, MIN, HOUR, DAY, parseNaive, toNaive, dateOf, hourOf, dowOf, floorTo, ceilTo, haversine, round, paginate, mulberry32, hashStr, signJwt, verifyJwt, compilePattern };
