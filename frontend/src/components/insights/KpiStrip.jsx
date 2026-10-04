import { Zap, BatteryCharging, IndianRupee, Gauge, Users, XCircle, UserX, Leaf, Clock } from 'lucide-react';
import { differenceInCalendarDays, subDays, format } from 'date-fns';
import { Sparkline, Skeleton, ErrorState, EmptyState, Delta, Tooltip } from '../ui';
import { inr, num, parseLocal } from '../../lib/format.js';
import { C, CountUp, useData, useInView, money, energy, pctS } from './shared.jsx';

const DEFS = [
  { key: 'sessions', sub: 'Charging sessions completed', label: 'Sessions', icon: Zap, color: C.cyan, fmt: (v) => num(Math.round(v)), full: (v) => `${num(v)} charging sessions`, spark: 'sessions' },
  { key: 'energyKwh', sub: 'Energy delivered to vehicles', label: 'Energy delivered', icon: BatteryCharging, color: C.amber, fmt: energy, full: (v) => `${num(v, 1)} kWh delivered`, spark: 'energyKwh' },
  { key: 'revenue', sub: 'Billed charging revenue', label: 'Revenue', icon: IndianRupee, color: C.green, fmt: money, full: (v) => inr(v, { decimals: 2 }), spark: 'revenue' },
  { key: 'utilizationPct', sub: 'Share of charger-hours in use', label: 'Utilisation', icon: Gauge, color: C.violet, fmt: (v) => pctS(v, 2), full: (v) => `${v}% of available charger-hours were in use`, spark: 'sessions', mult: 0.1 },
  { key: 'uniqueUsers', sub: 'Distinct drivers who charged', label: 'Unique users', icon: Users, color: C.blue, fmt: (v) => num(Math.round(v)), full: (v) => `${num(v)} distinct drivers charged` },
  { key: 'cancellationRatePct', sub: 'Of resolved bookings', label: 'Cancellation rate', icon: XCircle, color: C.red, invert: true, fmt: (v) => pctS(v), full: (v) => `${v}% of resolved bookings were cancelled` },
  { key: 'noShowRatePct', sub: 'Booked but never arrived', label: 'No-show rate', icon: UserX, color: C.pink, invert: true, fmt: (v) => pctS(v), full: (v) => `${v}% of resolved bookings were no-shows` },
  { key: 'co2AvoidedKg', sub: 'Versus petrol equivalent', label: 'CO₂ avoided', icon: Leaf, color: C.green, fmt: (v) => `${(v / 1000).toFixed(2)} t`, full: (v) => `${num(v, 0)} kg CO₂ avoided vs petrol`, spark: 'energyKwh', mult: 0.81 },
];
const prevFmt = { sessions: (v) => num(v), energyKwh: energy, revenue: money, utilizationPct: (v) => pctS(v, 2), uniqueUsers: (v) => num(v), cancellationRatePct: pctS, noShowRatePct: pctS, co2AvoidedKg: (v) => `${(v / 1000).toFixed(2)} t` };

export default function KpiStrip({ params, keys, hero = true }) {
  const [ref, seen] = useInView('0px');
  const st = useData('overview', params, seen);
  const { data, loading, error, reload } = st;

  const len = differenceInCalendarDays(parseLocal(params.to), parseLocal(params.from)) + 1;
  const pTo = subDays(parseLocal(params.from), 1), pFrom = subDays(pTo, len - 1);
  const prevLabel = `${format(pFrom, 'd MMM')} – ${format(pTo, 'd MMM yyyy')}`;

  return (
    <section ref={ref} className={`ins-kpis-wrap ${hero ? 'hero' : 'secondary'}`}>
      {hero && data && <div className="ins-kpis-head"><span className="muted xs">Compared with the previous {len} days ({prevLabel})</span>{data.kpis.peakHour != null && <span className="ins-peak"><Clock size={13} />Peak hour {String(data.kpis.peakHour).padStart(2, '0')}:00</span>}</div>}
      {error && !data ? <div className="card"><ErrorState error={error} onRetry={() => reload()} title="Could not load KPIs" /></div>
        : !data ? <div className="ins-kpis">{DEFS.filter((d) => !keys || keys.includes(d.key)).map((d) => <div className="card kpi ins-kpi" key={d.key}><Skeleton w="55%" h={12} /><Skeleton w="70%" h={28} style={{ marginTop: 14 }} /><Skeleton w="100%" h={28} style={{ marginTop: 12 }} /></div>)}</div>
          : data.kpis.sessions === 0 && !data.previous.sessions ? <div className="card"><EmptyState title="No sessions in this window" text="Widen the date range or clear a filter to see the KPIs." /></div>
            : (
              <div className={`ins-kpis stagger ${loading ? 'is-stale' : ''}`}>
                {DEFS.filter((d) => !keys || keys.includes(d.key)).map((d) => {
                  const Icon = d.icon, val = data.kpis[d.key], prev = data.previous?.[d.key], delta = data.deltaPct?.[d.key];
                  const series = d.spark ? data.sparkline.map((s) => s[d.spark] * (d.mult || 1)) : null;
                  return (
                    <div className="card kpi ins-kpi" key={d.key} style={{ '--c': d.color }}>
                      <div className="row between start">
                        <div className="kpi-label">{d.label}</div>
                        <div className="kpi-icon" style={{ color: d.color, background: `color-mix(in srgb, ${d.color} 14%, transparent)` }}><Icon size={17} /></div>
                      </div>
                      <Tooltip text={d.full(val)} bottom><div className="kpi-value"><CountUp value={val} format={d.fmt} /></div></Tooltip>
                      <div className="kpi-sub">{d.sub}</div>
                      <div className="kpi-foot">
                        <div className="col gap-4" style={{ minWidth: 0 }}>
                          {delta === null || delta === undefined ? <span className="muted xs">no prior data</span> : <Delta value={delta} invert={d.invert} />}
                          {prev !== undefined && prev !== null && delta !== null && <span className="muted xs truncate">prev {prevFmt[d.key](prev)}</span>}
                        </div>
                        {series && series.length > 1 && <Sparkline data={series} color={d.color} width={92} height={32} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
    </section>
  );
}
