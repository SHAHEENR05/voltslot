// Shared bits for the Insights page: palette, formatters, lazy-load hooks, Panel / Async wrappers, tooltip box.
import { createContext, forwardRef, useContext, useEffect, useRef, useState } from 'react';
import { InfoTip, Skeleton, ErrorState, EmptyState, Card } from '../ui';
import { useFetch } from '../../lib/hooks.js';
import { inr0, num } from '../../lib/format.js';

// ------------------------------------------------------------------ palette (same hexes as the theme tokens)
export const C = {
  cyan: '#22d3ee', violet: '#a78bfa', pink: '#f472b6', amber: '#fbbf24', green: '#34d399', red: '#f87171', blue: '#38bdf8',
  grid: 'rgba(255,255,255,.08)', axis: '#8b9bb8', text: '#e8eefc',
};
export const CAT = [C.cyan, C.violet, C.pink, C.amber, C.green, C.blue, C.red];
export const AXIS = { stroke: C.axis, fontSize: 11, tickLine: false, axisLine: false };

// ------------------------------------------------------------------ formatters (Indian grouping everywhere; lakh / crore short forms)
/** ₹ short: ₹4.52 L, ₹1.18 Cr, below a lakh the full grouped value (₹95,250). */
export function money(n) {
  const v = Number(n || 0), a = Math.abs(v);
  if (a >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  return inr0(v);
}
/** compact axis tick, e.g. ₹4.5L / ₹12k */
export function moneyAxis(n) {
  const v = Number(n || 0), a = Math.abs(v);
  if (a >= 1e7) return `₹${+(v / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `₹${+(v / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `₹${+(v / 1e3).toFixed(0)}k`;
  return `₹${Math.round(v)}`;
}
export const energy = (kwh) => (Math.abs(kwh) >= 1000 ? `${(kwh / 1000).toFixed(2)} MWh` : `${num(kwh, 0)} kWh`);
export const pctS = (v, d = 1) => (v === null || v === undefined ? '–' : `${Number(v).toFixed(d)}%`);
export const signed = (v, d = 1) => (v === null || v === undefined ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}%`);

const PRETTY = { TYPE2: 'Type 2', CCS2: 'CCS2', CHADEMO: 'CHAdeMO', LECCS: 'LECCS', BHARAT_DC: 'Bharat DC', TWO_WHEELER: '2-wheeler', THREE_WHEELER: '3-wheeler', LCV: 'LCV', CAR: 'Car', WALK_IN: 'Walk-in', UPI: 'UPI', WEB: 'Web / app', HEAVY_RAIN: 'Heavy rain', PUBLIC_HOLIDAY: 'Public holiday', VIEW_STATION: 'View station', SELECT_SLOT: 'Select slot', CHECK_IN: 'Check-in', LATE: 'Late night', NIGHT: 'Night' };
export const pretty = (s) => PRETTY[s] || String(s || '').toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

// ------------------------------------------------------------------ colour scales
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export function scale(stops, t) {
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x)), f = x - i;
  const a = hex(stops[i]), b = hex(stops[i + 1]);
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(',')})`;
}
export const HEAT_STOPS = ['#10243a', '#0e7490', '#22d3ee', '#a78bfa', '#f472b6'];
export const GREEN_STOPS = ['#0f2a2a', '#0f6b52', '#34d399', '#a7f3d0'];
/** growth % -> red / amber / green */
export const growthColor = (g) => (g === null || g === undefined ? '#64748b' : g >= 15 ? C.green : g >= 0 ? '#86efac' : g >= -8 ? C.amber : C.red);

// ------------------------------------------------------------------ hooks
export const ForceVisible = createContext(false);

/** Latches true once the element is near the viewport (or when printing). */
export function useInView(rootMargin = '320px') {
  const ref = useRef(null);
  const forced = useContext(ForceVisible);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen || forced) return undefined;
    const el = ref.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return undefined; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [seen, forced, rootMargin]);
  return [ref, seen || forced];
}

/** GET /analytics/<path> with filter params; only fires once `enabled` (section scrolled into view). */
export function useData(path, params, enabled = true) {
  return useFetch(`/analytics/${path}`, { params, enabled });
}

/** Measured width of an element (ResizeObserver). Returns a callback ref so it also works for elements mounted later. */
export function useWidth() {
  const [el, setEl] = useState(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setW(Math.round(el.getBoundingClientRect().width)));
    ro.observe(el);
    setW(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, [el]);
  return [setEl, w];
}

/** Tween from the previous value to the new one (count-up that also animates filter changes). */
export function useTween(target, ms = 900) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const to = Number(target) || 0, start = from.current;
    let raf; const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - p, 3);
      const cur = start + (to - start) * e;
      from.current = cur; setV(cur);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}
export function CountUp({ value, format = (v) => num(Math.round(v)), ms }) {
  const v = useTween(value, ms);
  return <>{format(v)}</>;
}

// ------------------------------------------------------------------ layout wrappers
/** Section card. `span` is a 12-col grid class (s-4 / s-6 / s-8 / s-12). */
export const Panel = forwardRef(function Panel({ id, title, subtitle, info, icon, color = C.cyan, actions, span = 's-12', className = '', children }, ref) {
  return (
    <section id={id} ref={ref} className={`ins-slot ${span}`} data-section={id}>
      <Card className={`ins-card ${className}`}
        title={<span className="ins-title"><span className="ins-ico" style={{ '--c': color }}>{icon}</span>{title}{info && <InfoTip text={info} />}</span>}
        subtitle={subtitle} actions={actions}>
        {children}
      </Card>
    </section>
  );
});

/** Renders loading skeleton / error / empty / data (data stays visible, dimmed, while a filter change re-queries). */
export function Async({ state, h = 240, isEmpty, emptyTitle = 'No data for these filters', emptyText = 'Try widening the date range or clearing a filter.', children }) {
  const { data, loading, error, reload } = state;
  if (error && !data) return <ErrorState error={error} onRetry={() => reload()} title="Could not load this section" />;
  if (!data) return <Skeleton h={h} r={14} />;
  if (isEmpty && isEmpty(data)) return <EmptyState title={emptyTitle} text={emptyText} />;
  return <div className={`ins-body ${loading ? 'is-stale' : ''}`}>{children(data)}</div>;
}

/** Tooltip box used by every recharts tooltip / custom hover bubble. rows: [{label,value,color}] */
export function TipBox({ title, rows = [], foot, tone }) {
  return (
    <div className="ins-tip">
      {title && <div className="ins-tip-title">{title}</div>}
      {rows.map((r, i) => (
        <div className="ins-tip-row" key={`${r.label}${i}`}>
          {r.color && <i style={{ background: r.color, boxShadow: `0 0 8px ${r.color}` }} />}
          <span>{r.label}</span><b>{r.value}</b>
        </div>
      ))}
      {foot && <div className={`ins-tip-foot ${tone || ''}`}>{foot}</div>}
    </div>
  );
}

export const MiniLegend = ({ items }) => (
  <div className="ins-legend">
    {items.map((it) => (
      <button key={it.key} type="button" className={`ins-leg ${it.off ? 'off' : ''}`} onClick={it.onClick} disabled={!it.onClick}>
        <i style={{ background: it.color, ...(it.dashed ? { background: 'transparent', border: `2px dashed ${it.color}`, height: 0, width: 14, borderRadius: 0 } : {}) }} />{it.label}
      </button>
    ))}
  </div>
);
