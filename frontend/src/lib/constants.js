// Shared constants & colour maps.
export const CROWD = {
  LOW: { color: '#34d399', glow: 'rgba(52,211,153,.55)', cls: 'green', label: 'Low' },
  MEDIUM: { color: '#fbbf24', glow: 'rgba(251,191,36,.5)', cls: 'amber', label: 'Medium' },
  HIGH: { color: '#f87171', glow: 'rgba(248,113,113,.5)', cls: 'red', label: 'High' },
};
export const BOOKING_STATUS = {
  HOLD: { cls: 'amber', label: 'On hold' }, CONFIRMED: { cls: 'primary', label: 'Confirmed' }, CHECKED_IN: { cls: 'violet', label: 'Charging' },
  COMPLETED: { cls: 'green', label: 'Completed' }, CANCELLED: { cls: 'grey', label: 'Cancelled' }, NO_SHOW: { cls: 'red', label: 'No-show' }, EXPIRED: { cls: 'grey', label: 'Expired' },
};
export const SLOT_STATE = { FREE: 'FREE', BOOKED: 'BOOKED', PAST: 'PAST', UNAVAILABLE: 'UNAVAILABLE' };
export const PRESETS = [
  { value: 'BALANCED', label: 'Balanced' }, { value: 'FASTEST', label: 'Fastest' },
  { value: 'CHEAPEST', label: 'Cheapest' }, { value: 'LEAST_CROWDED', label: 'Least crowded' },
];
export const PRESET_WEIGHTS = {
  BALANCED: { distance: 0.22, wait: 0.22, crowding: 0.2, price: 0.14, reliability: 0.12, speed: 0.1 },
  FASTEST: { distance: 0.2, wait: 0.25, crowding: 0.05, price: 0.05, reliability: 0.05, speed: 0.4 },
  CHEAPEST: { distance: 0.15, wait: 0.1, crowding: 0.1, price: 0.5, reliability: 0.1, speed: 0.05 },
  LEAST_CROWDED: { distance: 0.15, wait: 0.2, crowding: 0.45, price: 0.05, reliability: 0.1, speed: 0.05 },
};
export const WEIGHT_KEYS = [
  { key: 'distance', label: 'Distance', color: '#fbbf24' }, { key: 'wait', label: 'Wait time', color: '#38bdf8' },
  { key: 'crowding', label: 'Crowding', color: '#a78bfa' }, { key: 'price', label: 'Price', color: '#34d399' },
  { key: 'reliability', label: 'Reliability', color: '#f472b6' }, { key: 'speed', label: 'Speed', color: '#22d3ee' },
];
export const CONNECTOR_LABEL = { CCS2: 'CCS2', TYPE2: 'Type 2', CHADEMO: 'CHAdeMO', LECCS: 'LECCS', BHARAT_DC: 'Bharat DC' };
export const DEFAULT_LOCATION = { lat: 19.2183, lon: 72.9781, label: 'Thane West' };
export const ROLES = ['USER', 'OPERATOR', 'ADMIN', 'FLEET_MANAGER'];
