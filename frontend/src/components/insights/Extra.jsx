// Overview volume bars + Demand-tab forecast / anomalies panels.
import { useState } from 'react';
import { ComposedChart, Bar, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from 'recharts';
import { BarChart3, CalendarClock } from 'lucide-react';
import { format } from 'date-fns';
import { Segmented, Table } from '../ui';
import { num, parseLocal } from '../../lib/format.js';
import { C, AXIS, Panel, Async, TipBox, useData, useInView } from './shared.jsx';

const lab = (g) => (x) => (g === 'MONTH' ? format(parseLocal(`${x}-01`), "MMM ''yy") : format(parseLocal(x), 'd MMM'));

export function VolumePanel({ params, span = 's-12' }) {
  const [ref, seen] = useInView();
  const [g, setG] = useState('MONTH');
  const st = useData('trend', { ...params, granularity: g }, seen);
  return (
    <Panel ref={ref} id="volume" icon={<BarChart3 size={17} />} span={span} title="Session volume"
      subtitle={`Charging sessions per ${g === 'MONTH' ? 'month' : 'week'}`}
      actions={<Segmented size="sm" options={[{ value: 'MONTH', label: 'Month' }, { value: 'WEEK', label: 'Week' }]} value={g} onChange={setG} />}>
      <Async state={st} h={260} isEmpty={(d) => !d.series.length}>
        {(d) => (
          <div className="ins-chart" style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={d.series} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="period" tickFormatter={lab(g)} minTickGap={24} {...AXIS} />
                <YAxis width={42} tickFormatter={(v) => num(v)} {...AXIS} />
                <RTooltip cursor={{ fill: 'rgba(255,255,255,.04)' }} content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload;
                  return <TipBox title={lab(g)(p.period)} rows={[{ label: 'Sessions', value: num(p.sessions), color: C.cyan }, { label: 'Energy', value: `${num(p.energyKwh, 0)} kWh`, color: C.amber }]} />;
                }} />
                <Bar dataKey="sessions" fill={C.cyan} fillOpacity={0.8} radius={[5, 5, 0, 0]} maxBarSize={36} animationDuration={800} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </Async>
    </Panel>
  );
}

export function ForecastPanel({ params, span = 's-12' }) {
  const [ref, seen] = useInView();
  const st = useData('trend', { ...params, granularity: 'DAY' }, seen);
  return (
    <Panel ref={ref} id="forecast" icon={<CalendarClock size={17} />} span={span} title="14-day forecast & anomalies"
      subtitle="Holt-Winters daily forecast with its 95% band, and the days that broke the pattern"
      info="Anomalies are days whose sessions deviate by more than 2 standard deviations from the expected value.">
      <Async state={st} h={420} isEmpty={(d) => !d.forecast.length && !d.anomalies.length}>
        {(d) => {
          const rows = d.forecast.map((f) => ({ x: f.date, predicted: f.predicted, band: [f.lower, f.upper] }));
          const an = [...d.anomalies].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
          return (
            <div className="ins-two">
              <div>
                <div className="ins-tile-head"><b>Expected sessions per day</b><span className="muted xs">≈ {num(Math.round(d.forecast.reduce((a, f) => a + f.predicted, 0)))} over 14 days</span></div>
                <div className="ins-chart" style={{ height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={rows} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                      <CartesianGrid stroke={C.grid} vertical={false} />
                      <XAxis dataKey="x" tickFormatter={lab('DAY')} {...AXIS} />
                      <YAxis width={36} {...AXIS} />
                      <RTooltip content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0].payload;
                        return <TipBox title={format(parseLocal(p.x), 'EEE d MMM')} rows={[{ label: 'Forecast', value: p.predicted.toFixed(1), color: C.amber }, { label: 'Range', value: `${p.band[0].toFixed(0)} – ${p.band[1].toFixed(0)}` }]} />;
                      }} />
                      <Area dataKey="band" stroke="none" fill={C.amber} fillOpacity={0.14} activeDot={false} />
                      <Line dataKey="predicted" type="monotone" stroke={C.amber} strokeWidth={2.2} dot={{ r: 3, fill: C.amber, strokeWidth: 0 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div>
                <div className="ins-tile-head"><b>Recent anomalies</b><span className="muted xs">{d.anomalies.length} in this window</span></div>
                <Table compact rowKey="date" rows={an} empty={<div className="muted small" style={{ padding: 16 }}>No anomalies in this window.</div>} columns={[
                  { key: 'date', header: 'Date', render: (a) => format(parseLocal(a.date), 'd MMM yy') },
                  { key: 'value', header: 'Actual', numeric: true, render: (a) => num(a.value, 0) },
                  { key: 'expected', header: 'Expected', numeric: true, render: (a) => num(a.expected, 0) },
                  { key: 'zScore', header: 'z', numeric: true, render: (a) => <span className={a.zScore > 0 ? 'text-amber' : 'text-red'}>{a.zScore > 0 ? '+' : ''}{a.zScore}</span> },
                  { key: 'reason', header: 'Reason', render: (a) => <span className="small">{a.reason}</span> },
                ]} />
              </div>
            </div>
          );
        }}
      </Async>
    </Panel>
  );
}
