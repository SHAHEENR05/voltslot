// Formatting helpers. LocalDateTime strings are IST wall-clock; never convert time zones.
import { format as dfFormat, differenceInMinutes, differenceInCalendarDays } from 'date-fns';

export const inr = (n, { decimals } = {}) => {
  if (n === null || n === undefined || n === '' || Number.isNaN(Number(n))) return '–';
  const v = Number(n);
  const d = decimals !== undefined ? decimals : (Number.isInteger(v) ? 0 : 2);
  return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
};
export const inr0 = (n) => inr(n, { decimals: 0 });
export const num = (n, d = 0) => (n === null || n === undefined ? '–' : Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const compact = (n) => {
  const v = Number(n || 0), a = Math.abs(v);
  if (a >= 1e7) return (v / 1e7).toFixed(2) + ' Cr';
  if (a >= 1e5) return (v / 1e5).toFixed(2) + ' L';
  if (a >= 1e3) return (v / 1e3).toFixed(1) + 'k';
  return String(Math.round(v));
};
export const kwh = (n) => (n === null || n === undefined ? '–' : `${Number(n).toFixed(1)} kWh`);
export const kw = (n) => (n === null || n === undefined ? '–' : `${Number(n) % 1 === 0 ? Number(n) : Number(n).toFixed(1)} kW`);
export const km = (n) => (n === null || n === undefined ? '–' : `${Number(n).toFixed(1)} km`);
export const pct = (n, d = 0) => (n === null || n === undefined ? '–' : `${Number(n).toFixed(d)}%`);
export const minutesHuman = (m) => {
  if (m === null || m === undefined) return '–';
  m = Math.round(m);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r === 0 ? `${h} h` : `${h} h ${String(r).padStart(2, '0')} min`;
};

/** Parse a naive ISO LocalDateTime ("2026-10-03T19:30:00") into a Date whose LOCAL fields equal the wall-clock. */
export function parseLocal(s) {
  if (!s) return null;
  if (s instanceof Date) return s;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
}
/** Date -> naive ISO "YYYY-MM-DDTHH:mm:ss" (the inverse of parseLocal). */
export const toIso = (d) => dfFormat(d, "yyyy-MM-dd'T'HH:mm:ss");
export const toDateStr = (d) => dfFormat(parseLocal(d), 'yyyy-MM-dd');

const f = (s, p) => { const d = parseLocal(s); return d ? dfFormat(d, p) : '–'; };
export const dateTime = (s) => f(s, 'd MMM yyyy, HH:mm');
export const dateTimeShort = (s) => f(s, 'EEE d MMM · HH:mm');
export const day = (s) => f(s, 'EEE d MMM yyyy');
export const dayShort = (s) => f(s, 'd MMM');
export const time = (s) => f(s, 'HH:mm');
export const fmtDate = f;

/** Relative time against the APP clock: pass `now` from useClock(). */
export function relative(s, now) {
  const d = parseLocal(s), n = parseLocal(now);
  if (!d || !n) return '–';
  const min = differenceInMinutes(d, n);
  const abs = Math.abs(min);
  const suffix = (x) => (min >= 0 ? `in ${x}` : `${x} ago`);
  if (abs < 1) return 'just now';
  if (abs < 60) return suffix(`${abs} min`);
  if (abs < 60 * 24) return suffix(`${Math.round(abs / 60)} h`);
  const days = Math.abs(differenceInCalendarDays(d, n));
  return suffix(`${days} day${days === 1 ? '' : 's'}`);
}
/** "today 19:30" / "tomorrow 07:00" / "Mon 5 Oct 07:00" relative to the app clock. */
export function whenLabel(s, now) {
  const d = parseLocal(s), n = parseLocal(now);
  if (!d) return '–';
  const diff = n ? differenceInCalendarDays(d, n) : 99;
  const t = dfFormat(d, 'HH:mm');
  if (diff === 0) return `Today ${t}`;
  if (diff === 1) return `Tomorrow ${t}`;
  return dfFormat(d, 'EEE d MMM') + ' ' + t;
}

export const titleCase = (s) => (s || '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
export const initials = (name) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join('');
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const crowdingLevelOf = (idx) => (idx >= 65 ? 'HIGH' : idx >= 35 ? 'MEDIUM' : 'LOW');
export const haversineKm = (a, b, c, d) => {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (c - a) * rad, dLon = (d - b) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};
