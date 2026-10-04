import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { api } from './api.js';
import { parseLocal, toIso } from './format.js';

const ClockCtx = createContext(null);
const FALLBACK = '2026-10-03T09:30:00';

/**
 * App clock ("demo time machine"). Polls GET /api/clock every 30 s and extrapolates locally between polls.
 * useClock() -> { now: Date (LOCAL fields == IST wall-clock), iso: 'YYYY-MM-DDTHH:mm:ss', today: 'YYYY-MM-DD',
 *                 label: 'Sat 3 Oct 2026 · 09:30', mode, loading, refresh(), getNow() }
 * NEVER use new Date() for business logic - use this.
 */
export function ClockProvider({ children }) {
  const base = useRef({ server: parseLocal(FALLBACK), perf: performance.now(), mode: 'FIXED' });
  const [minuteKey, setMinuteKey] = useState(0);
  const [info, setInfo] = useState({ loading: true, mode: 'FIXED' });
  const lastMinute = useRef('');

  const getNow = useCallback(() => new Date(base.current.server.getTime() + (performance.now() - base.current.perf)), []);

  const publish = useCallback((force) => {
    const k = format(getNow(), 'yyyyMMddHHmm');
    if (force || k !== lastMinute.current) { lastMinute.current = k; setMinuteKey((x) => x + 1); }
  }, [getNow]);

  const refresh = useCallback(async () => {
    try {
      const c = await api.get('/clock', null, { auth: false });
      base.current = { server: parseLocal(c.now), perf: performance.now(), mode: c.mode };
      setInfo({ loading: false, mode: c.mode, offsetSeconds: c.offsetSeconds });
    } catch { setInfo((i) => ({ ...i, loading: false })); }
    publish(true);
  }, [publish]);

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, 30000);
    const tick = setInterval(() => publish(false), 5000);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [refresh, publish]);

  const value = useMemo(() => {
    const now = getNow();
    return {
      now, iso: toIso(now), today: format(now, 'yyyy-MM-dd'),
      label: format(now, 'EEE d MMM yyyy · HH:mm'),
      mode: info.mode, loading: info.loading, refresh, getNow,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minuteKey, info, refresh, getNow]);

  return <ClockCtx.Provider value={value}>{children}</ClockCtx.Provider>;
}
export const useClock = () => useContext(ClockCtx);
