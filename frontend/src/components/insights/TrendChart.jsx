import { useMemo, useState } from 'react';
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Brush, ReferenceLine } from 'recharts';
import { TrendingUp, AlertTriangle, CalendarClock } from 'lucide-react';
import { format, startOfWeek } from 'date-fns';
import { Segmented } from '../ui';
import { inr, num, parseLocal } from '../../lib/format.js';
import { useClock } from '../../lib/clock.jsx';
import { C, AXIS, Panel, Async, TipBox, MiniLegend, useData, useInView, money, moneyAxis } from './shared.jsx';

const ymd = (d) => format(d, 'yyyy-MM-dd');
const bucketOf = (gran, date) => (gran === 'DAY' ? date : gran === 'WEEK' ? ymd(startOfWeek(parseLocal(date), { weekStartsOn: 1 })) : date.slice(0, 7));
const tick = (gran) => (x) => (gran === 'MONTH' ? format(parseLocal(`${x}-01`), "MMM ''yy") : format(parseLocal(x), 'd MMM'));
const longLabel = (gran, x) => (gran === 'MONTH' ? format(parseLocal(`${x}-01`), 'MMMM yyyy') : gran === 'WEEK' ? `Week of ${format(parseLocal(x), 'd MMM yyyy')}` : format(parseLocal(x), 'EEE d MMM yyyy'));

function AnomalyDot({ cx, cy, payload }) {
  if (cx == null || cy == null || payload?.anomaly == null) return null;
  return (
    <g className="ins-anom">
      <circle cx={cx} cy={cy} r={11} fill={C.red} opacity={0.16} className="ins-anom-halo" />
      <circle cx={cx} cy={cy} r={4.6} fill={C.red} stroke="#fff" strokeWidth={1.5} style={{ filter: `drop-shadow(0 0 6px ${C.red})` }} />
    </g>
  );
}

function TrendTip({ active, payload, gran, today }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  const rows = [];
  if (r.sessions != null) rows.push({ label: 'Sessions', value: num(r.sessions), color: C.cyan }, { label: 'Revenue', value: inr(r.revenue, { decimals: 0 }), color: C.violet }, { label: 'Energy', value: `${num(r.energy, 0)} kWh`, color: C.amber }, { label: 'Avg tariff', value: `₹${Number(r.tariff).toFixed(2)}/kWh`, color: C.green });
  if (r.forecast != null) rows.push({ label: 'Forecast', value: `${num(r.forecast, 1)} sessions`, color: C.amber }, { label: 'Likely range', value: `${num(r.band[0], 0)} – ${num(r.band[1], 0)}`, color: 'rgba(251,191,36,.45)' });
  const foot = r.anomalies?.length ? r.anomalies.map((a) => `${a.reason} (expected ${num(a.expected, 0)}, z ${a.zScore})`).join('\n') : (gran === 'DAY' && r.x === today ? 'Day in progress – partial count' : null);
  return <TipBox title={longLabel(gran, r.x) + (r.forecast != null && r.sessions == null ? ' · forecast' : '')} rows={rows} foot={foot} tone={r.anomalies?.length ? 'bad' : ''} />;
}

export default function TrendChart({ params }) {
  const [ref, seen] = useInView();
  const { today } = useClock();
  const [gran, setGran] = useState('DAY');
  const [show, setShow] = useState({ revenue: true, forecast: true, anomalies: true });
  const st = useData('trend', { ...params, granularity: gran }, seen);
  const toggle = (k) => setShow((s) => ({ ...s, [k]: !s[k] }));

  const view = useMemo(() => {
    const d = st.data;
    if (!d) return null;
    const am = {};
    d.anomalies.forEach((a) => { (am[bucketOf(gran, a.date)] ||= []).push(a); });
    const map = new Map();
    const rows = d.series.map((p) => {
      const row = { x: p.period, sessions: p.sessions, revenue: p.revenue, energy: p.energyKwh, tariff: p.avgTariff, anomaly: am[p.period] ? p.sessions : null, anomalies: am[p.period] };
      map.set(p.period, row);
      return row;
    });
    if (gran === 'DAY' && d.forecast.length) {
      const last = rows[rows.length - 1];
      d.forecast.forEach((f) => {
        const ex = map.get(f.date);
        if (ex) { ex.forecast = f.predicted; ex.band = [f.lower, f.upper]; } else rows.push({ x: f.date, forecast: f.predicted, band: [f.lower, f.upper] });
      });
      if (last && last.forecast == null) { last.forecast = last.sessions; last.band = [last.sessions, last.sessions]; }
    }
    const act = d.series;
    const best = act.reduce((b, p) => (p.sessions > (b?.sessions ?? -1) ? p : b), null);
    const total = act.reduce((a, p) => a + p.sessions, 0), rev = act.reduce((a, p) => a + p.revenue, 0);
    const next14 = d.forecast.reduce((a, f) => a + f.predicted, 0);
    return { rows, best, total, rev, next14, n: act.length };
  }, [st.data, gran]);

  return (
    <Panel ref={ref} id="trend" icon={<TrendingUp size={17} />} color={C.cyan} span="s-12" title="Demand trend"
      subtitle="Sessions (area) and revenue (line) over time, with a 14-day Holt-Winters forecast and statistical anomalies"
      info="Forecast = additive Holt-Winters on daily sessions; the shaded band is the 95% prediction interval. Red dots are days where sessions deviate more than 2 standard deviations from the expected value (weather / holiday adjusted)."
      actions={<Segmented size="sm" options={['DAY', 'WEEK', 'MONTH']} value={gran} onChange={setGran} />}>
      <Async state={st} h={400} isEmpty={(d) => !d.series.length} emptyText="No sessions in the selected window.">
        {(d) => (
          <>
            <div className="ins-minis">
              <div><span>Sessions</span><b>{num(view.total)}</b></div>
              <div><span>Revenue</span><b>{money(view.rev)}</b></div>
              <div><span>Best {gran === 'DAY' ? 'day' : gran === 'WEEK' ? 'week' : 'month'}</span><b>{view.best ? `${num(view.best.sessions)}` : '–'}<small>{view.best ? tick(gran)(view.best.period) : ''}</small></b></div>
              <div><span>Anomalies</span><b className="text-red">{d.anomalies.length}</b></div>
              {gran === 'DAY' && d.forecast.length > 0 && <div><span>Next 14 days</span><b className="text-amber">≈ {num(Math.round(view.next14))}<small>sessions</small></b></div>}
            </div>
            <MiniLegend items={[
              { key: 's', label: 'Sessions', color: C.cyan },
              { key: 'r', label: 'Revenue (right axis)', color: C.violet, off: !show.revenue, onClick: () => toggle('revenue') },
              ...(gran === 'DAY' ? [{ key: 'f', label: '14-day forecast + band', color: C.amber, dashed: true, off: !show.forecast, onClick: () => toggle('forecast') }] : []),
              { key: 'a', label: 'Anomaly', color: C.red, off: !show.anomalies, onClick: () => toggle('anomalies') },
            ]} />
            {gran !== 'DAY' && <div className="ins-note"><CalendarClock size={13} /> Switch to Day to see the 14-day forecast.</div>}
            <div className="ins-chart" style={{ height: 392 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart key={`${gran}-${view.rows.length}`} data={view.rows} margin={{ top: 10, right: 2, left: -6, bottom: 0 }}>
                  <defs>
                    <linearGradient id="insSess" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.cyan} stopOpacity=".5" /><stop offset="1" stopColor={C.cyan} stopOpacity=".02" /></linearGradient>
                    <linearGradient id="insBand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.amber} stopOpacity=".3" /><stop offset="1" stopColor={C.amber} stopOpacity=".08" /></linearGradient>
                  </defs>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="x" tickFormatter={tick(gran)} minTickGap={34} {...AXIS} />
                  <YAxis yAxisId="l" width={42} tickFormatter={(v) => num(v)} {...AXIS} />
                  {show.revenue && <YAxis yAxisId="r" orientation="right" width={54} tickFormatter={moneyAxis} {...AXIS} />}
                  <RTooltip content={<TrendTip gran={gran} today={today} />} cursor={{ stroke: 'rgba(255,255,255,.3)', strokeDasharray: '4 4' }} />
                  {gran === 'DAY' && view.rows.some((r) => r.x === today) && <ReferenceLine yAxisId="l" x={today} stroke="rgba(255,255,255,.28)" strokeDasharray="2 4" label={{ value: 'Today', position: 'insideTopLeft', fill: C.axis, fontSize: 10.5 }} />}
                  {gran === 'DAY' && show.forecast && <Area yAxisId="l" dataKey="band" stroke="none" fill="url(#insBand)" activeDot={false} isAnimationActive animationDuration={900} />}
                  <Area yAxisId="l" type="monotone" dataKey="sessions" stroke={C.cyan} strokeWidth={2.2} fill="url(#insSess)" animationDuration={900}
                    activeDot={{ r: 6, fill: C.cyan, stroke: '#fff', strokeWidth: 2, className: 'ins-glow-dot' }} />
                  {show.revenue && <Line yAxisId="r" type="monotone" dataKey="revenue" stroke={C.violet} strokeWidth={2} dot={false} animationDuration={1100}
                    activeDot={{ r: 5, fill: C.violet, stroke: '#fff', strokeWidth: 2, className: 'ins-glow-dot' }} style={{ filter: 'drop-shadow(0 0 5px rgba(167,139,250,.55))' }} />}
                  {gran === 'DAY' && show.forecast && <Line yAxisId="l" type="monotone" dataKey="forecast" stroke={C.amber} strokeWidth={2.4} strokeDasharray="7 5" dot={false}
                    activeDot={{ r: 5, fill: C.amber, stroke: '#fff', strokeWidth: 2, className: 'ins-glow-dot' }} animationDuration={1200} />}
                  {show.anomalies && <Line yAxisId="l" dataKey="anomaly" stroke="none" dot={<AnomalyDot />} activeDot={false} isAnimationActive={false} legendType="none" />}
                  {view.rows.length > 20 && <Brush dataKey="x" height={24} stroke={C.cyan} fill="rgba(10,18,32,.7)" travellerWidth={9} tickFormatter={tick(gran)} />}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="ins-foot"><AlertTriangle size={13} className="text-red" /> Hover a red dot for the likely reason. Drag the handles under the chart to zoom into a period.</div>
          </>
        )}
      </Async>
    </Panel>
  );
}
