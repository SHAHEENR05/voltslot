const state = require('../lib/state');
const { toNaive, HOUR, DAY, MIN } = require('../lib/util');

module.exports = [
  { method: 'GET', pattern: '/api/clock', handler: () => ({ now: state.now(), mode: state.clock.mode, anchor: toNaive(state.clock.anchorMs), offsetSeconds: Math.round(state.clock.offsetMs / 1000) }) },
  { method: 'POST', pattern: '/api/admin/clock/advance', handler: ({ auth, body }) => {
    auth('ADMIN'); state.advance((body.hours || 0) * HOUR + (body.minutes || 0) * MIN + (body.days || 0) * DAY);
    return { now: state.now(), mode: state.clock.mode, anchor: toNaive(state.clock.anchorMs), offsetSeconds: Math.round(state.clock.offsetMs / 1000) };
  } },
  { method: 'POST', pattern: '/api/admin/clock/reset', handler: ({ auth }) => {
    auth('ADMIN'); state.resetClock();
    return { now: state.now(), mode: state.clock.mode, anchor: toNaive(state.clock.anchorMs), offsetSeconds: 0 };
  } },
];
