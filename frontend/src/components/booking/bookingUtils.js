// Small helpers shared by the station page, the booking drawer and the bookings page.
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useAsync } from '../../lib/hooks.js';
import { parseLocal } from '../../lib/format.js';

/** kW a vehicle can really draw from a point (same rule as EstimatorService). */
export const acceptedKw = (v, p) => Math.min(p.powerKw, p.currentType === 'AC' ? v.acMaxKw : v.dcMaxKw);
export const isCompatible = (v, p) => !!v && (v.connectorCodes || []).includes(p.connectorCode) && acceptedKw(v, p) > 0;
/** auto-assign order of the backend: highest accepted kW, then cheapest, then id */
export const bestPointFor = (v, points) => [...points].filter((p) => p.status === 'ACTIVE' && isCompatible(v, p))
  .sort((a, b) => acceptedKw(v, b) - acceptedKw(v, a) || a.tariffPerKwh - b.tariffPerKwh || a.id - b.id)[0] || null;

export const BAND = {
  OFFPEAK: { label: 'Off-peak', tone: 'green' },
  NORMAL: { label: 'Normal', tone: 'primary' },
  PEAK: { label: 'Peak', tone: 'amber' },
};
export const SOURCE_LABEL = { WAITLIST: 'From waitlist', REMINDER: 'Smart reminder', FLEET: 'Fleet plan', TRIP: 'Trip plan', WALK_IN: 'Walk-in', MOBILE: 'Mobile' };

/** user's vehicles (GET /vehicles); empty for guests */
export function useVehicles() {
  const { isAuthed } = useAuth();
  const r = useAsync(() => api.get('/vehicles'), [isAuthed], { enabled: isAuthed, initial: [] });
  return { vehicles: r.data || [], loading: r.loading, error: r.error, reload: r.reload };
}

export const vehicleLabel = (v) => (v ? `${v.nickname ? v.nickname + ' · ' : ''}${v.make} ${v.model}` : '');

const EVT = 'chargeiq:bookings-changed';
/** tell every mounted page that bookings / availability changed */
export const notifyBookingsChanged = () => window.dispatchEvent(new Event(EVT));
export function useBookingsChanged(cb) {
  const ref = useRef(cb); ref.current = cb;
  useEffect(() => { const h = () => ref.current(); window.addEventListener(EVT, h); return () => window.removeEventListener(EVT, h); }, []);
}

/** re-render every `ms` (default 1 s) and return performance time; used for countdowns */
export function useTick(ms = 1000, enabled = true) {
  const [t, setT] = useState(0);
  useEffect(() => { if (!enabled) return undefined; const i = setInterval(() => setT((x) => x + 1), ms); return () => clearInterval(i); }, [ms, enabled]);
  return t;
}
/** seconds until a naive ISO instant, measured on the APP clock (getNow from useClock) */
export const secondsUntil = (iso, getNow) => { const d = parseLocal(iso); return d ? Math.round((d.getTime() - getNow().getTime()) / 1000) : 0; };

/** "HH:mm" options of a 30-minute grid */
export const HALF_HOURS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
