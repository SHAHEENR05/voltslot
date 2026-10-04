// Station helpers shared by stations + recommendations routes (live summary = fixture + clock-dependent fields).
const state = require('./state');
const { haversine, round, hourOf, dowOf } = require('./util');
const { freeNow } = require('./availability');

function liveSummary(st, lat, lon) {
  const s = st.summary, now = state.nowMs();
  const ci = state.crowding(s.id, dowOf(now), hourOf(now));
  const h = hourOf(now);
  return {
    ...s,
    distanceKm: lat !== undefined && lon !== undefined && !Number.isNaN(lat) ? round(haversine(lat, lon, s.latitude, s.longitude), 2) : null,
    openNow: h >= s.openHour && h < s.closeHour,
    freeNowPoints: freeNow(st), crowdingIndexNow: ci, crowdingLevelNow: state.crowdingLevel(ci),
  };
}
module.exports = { liveSummary };
