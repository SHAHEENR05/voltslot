import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

/**
 * useAsync(fn, deps, {enabled=true, initial}) -> { data, loading, error, reload, setData }
 * fn receives no args and returns a promise. Re-runs when deps change. Stale responses are ignored.
 */
export function useAsync(fn, deps = [], { enabled = true, initial = null } = {}) {
  const [state, setState] = useState({ data: initial, loading: enabled, error: null });
  const fnRef = useRef(fn); fnRef.current = fn;
  const seq = useRef(0);
  const run = useCallback((silent = false) => {
    const id = ++seq.current;
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
    return Promise.resolve().then(() => fnRef.current()).then(
      (data) => { if (id === seq.current) setState({ data, loading: false, error: null }); return data; },
      (error) => { if (id === seq.current) setState((s) => ({ data: silent ? s.data : null, loading: false, error })); },
    );
  }, []);
  useEffect(() => {
    if (!enabled) { setState((s) => ({ ...s, loading: false })); return undefined; }
    run();
    return () => { seq.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);
  const setData = useCallback((updater) => setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater })), []);
  return { ...state, reload: run, setData };
}

/** useFetch('/stations', {params, enabled, deps}) -> same shape as useAsync. GET only. */
export function useFetch(path, { params, enabled = true, deps = [], ...opts } = {}) {
  const key = JSON.stringify(params || {});
  return useAsync(() => api.get(path, params), [path, key, ...deps], { enabled: enabled && !!path, ...opts });
}

/** Calls fn immediately (optional) and then every `ms` while `enabled`. fn is always the latest closure. */
export function usePolling(fn, ms, { enabled = true, immediate = true } = {}) {
  const ref = useRef(fn); ref.current = fn;
  useEffect(() => {
    if (!enabled) return undefined;
    if (immediate) ref.current();
    const t = setInterval(() => ref.current(), ms);
    return () => clearInterval(t);
  }, [ms, enabled, immediate]);
}

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** localStorage-backed state for per-viewer conveniences (never throws). */
export function useLocalState(key, initial) {
  const [v, setV] = useState(() => { try { const s = localStorage.getItem(key); return s !== null ? JSON.parse(s) : initial; } catch { return initial; } });
  const set = useCallback((x) => { setV(x); try { localStorage.setItem(key, JSON.stringify(x)); } catch { /* */ } }, [key]);
  return [v, set];
}

/** Count-up animation for KPI numbers. */
export function useCountUp(target, ms = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const to = Number(target) || 0; let raf; const t0 = performance.now();
    const step = (t) => { const p = Math.min(1, (t - t0) / ms); setV(to * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}
