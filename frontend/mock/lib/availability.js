// Deterministic slot-grid generator shared by availability + recommendations (+ any future booking route).
const state = require('./state');
const { MIN, DAY, dateOf, hourOf, dowOf, toNaive, mulberry32, hashStr, floorTo } = require('./util');

const SLOT = 30 * MIN;
const cache = new Map();

/** 48 booleans (true = booked by "other drivers") for a point on a date; seeded so it is stable between calls. */
function dayGrid(station, point, date) {
  const key = `${point.id}|${date}`;
  if (cache.has(key)) return cache.get(key);
  const rng = mulberry32(hashStr(key));
  const dow = dowOf(Date.parse(date + 'T12:00:00Z'));
  const booked = new Array(48).fill(false);
  const bias = 0.8 + ((point.id * 7) % 5) * 0.12; // some points are busier than others
  for (let i = 0; i < 48; i++) {
    if (booked[i]) continue;
    const ci = state.crowding(station.summary.id, dow, Math.floor(i / 2));
    if (rng() < (ci / 100) * 0.42 * bias) {
      const len = 1 + Math.floor(rng() * (point.currentType === 'DC' && point.powerKw >= 30 ? 3 : 5));
      for (let k = 0; k < len && i + k < 48; k++) booked[i + k] = true;
    }
  }
  cache.set(key, booked);
  return booked;
}

/** state of one 30-min slot: FREE | BOOKED | PAST | UNAVAILABLE. slotMs = naive ms on the :00/:30 grid. */
function slotState(station, point, slotMs) {
  if (slotMs < floorTo(state.nowMs(), SLOT)) return 'PAST';
  const h = hourOf(slotMs), s = station.summary;
  if (point.status !== 'ACTIVE' || h < s.openHour || h >= s.closeHour) return 'UNAVAILABLE';
  if (state.bookedSlots.has(`${point.id}|${toNaive(slotMs)}`)) return 'BOOKED';
  const idx = Math.floor((slotMs % DAY) / SLOT);
  return dayGrid(station, point, dateOf(slotMs))[idx] ? 'BOOKED' : 'FREE';
}

/** earliest start >= fromMs (grid aligned) with `slots` consecutive FREE slots, looking `horizonH` hours ahead; null if none. */
function findEarliest(station, point, fromMs, slots, horizonH = 12) {
  let t = Math.ceil(fromMs / SLOT) * SLOT;
  const end = fromMs + horizonH * 3600000;
  for (; t <= end; t += SLOT) {
    let ok = true;
    for (let k = 0; k < slots; k++) if (slotState(station, point, t + k * SLOT) !== 'FREE') { ok = false; break; }
    if (ok) return t;
  }
  return null;
}
/** number of ACTIVE points free right now (current slot) */
function freeNow(station) {
  const t = floorTo(state.nowMs(), SLOT);
  return station.points.filter((p) => slotState(station, p, t) === 'FREE').length;
}
module.exports = { SLOT, slotState, findEarliest, freeNow, dayGrid };
