import { useState } from 'react';
import { PieChart, Pie, Cell, Sector, ResponsiveContainer } from 'recharts';
import { PieChart as PieIcon, Trophy } from 'lucide-react';
import { Segmented } from '../ui';
import { num } from '../../lib/format.js';
import { CAT, C, Panel, Async, useData, useInView, money, energy, pretty } from './shared.jsx';

const METRICS = {
  sessions: { label: 'Sessions', fmt: (v) => num(v), unit: 'sessions' },
  revenue: { label: 'Revenue', fmt: money, unit: 'revenue' },
  energyKwh: { label: 'Energy', fmt: energy, unit: 'energy' },
};
const DIMS = [['connector', 'Connector type'], ['vehicleCategory', 'Vehicle category'], ['payment', 'Payment method'], ['source', 'Booking source']];
const EXTRA = [{ value: 'dayPart', label: 'Day part' }, { value: 'tier', label: 'Station tier' }];
const DAYPART_HINT = { NIGHT: '00–05', MORNING: '05–11', AFTERNOON: '11–16', EVENING: '16–21', LATE: '21–24' };

const Active = (p) => <Sector {...p} outerRadius={p.outerRadius + 7} style={{ filter: `drop-shadow(0 0 9px ${p.fill})` }} />;

function Donut({ title, st, metric, extra }) {
  const [act, setAct] = useState(-1);
  const M = METRICS[metric];
  return (
    <div className="ins-tile ins-donut">
      <div className="ins-tile-head"><b>{title}</b>{extra}</div>
      <Async state={st} h={250} isEmpty={(d) => !d.length || d.every((s) => !s.sessions)}>
        {(raw) => {
          const rows = raw.map((s, i) => ({ ...s, v: s[metric], color: CAT[i % CAT.length] }));
          const total = rows.reduce((a, r) => a + r.v, 0) || 1;
          const cur = act >= 0 ? rows[act] : null;
          return (
            <>
              <div className="ins-donut-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={rows} dataKey="v" nameKey="label" innerRadius="60%" outerRadius="84%" paddingAngle={3} cornerRadius={6} stroke="none" startAngle={90} endAngle={-270}
                      activeIndex={act} activeShape={Active} onMouseEnter={(_, i) => setAct(i)} onMouseLeave={() => setAct(-1)} animationDuration={900}>
                      {rows.map((r) => <Cell key={r.label} fill={r.color} fillOpacity={act >= 0 && rows[act] !== r ? 0.45 : 1} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="ins-donut-center">
                  <b>{cur ? `${((cur.v / total) * 100).toFixed(1)}%` : M.fmt(total)}</b>
                  <span>{cur ? pretty(cur.label) : `total ${M.unit}`}</span>
                </div>
              </div>
              <div className="ins-dleg">
                {rows.map((r, i) => (
                  <div key={r.label} className={`ins-dleg-row ${act === i ? 'on' : ''}`} onMouseEnter={() => setAct(i)} onMouseLeave={() => setAct(-1)}>
                    <i style={{ background: r.color }} /><span className="truncate">{pretty(r.label)}{DAYPART_HINT[r.label] ? <small> {DAYPART_HINT[r.label]}h</small> : null}</span>
                    <b>{((r.v / total) * 100).toFixed(1)}%</b><em title={M.label}>{M.fmt(r.v)}</em>
                  </div>
                ))}
              </div>
            </>
          );
        }}
      </Async>
    </div>
  );
}

export default function MixDonuts({ params, dims = ['connector', 'vehicleCategory', 'payment', 'source'], extra = true, glance = true, id = 'mix', title = 'Who charges, on what, and how they pay', subtitle = 'Hover a slice or a legend row – the centre shows its exact share', span = 's-12' }) {
  const [ref, seen] = useInView();
  const [metric, setMetric] = useState('sessions');
  const [extraBy, setExtraBy] = useState('dayPart');
  const a = useData('mix', { ...params, by: 'connector' }, seen && dims.includes('connector'));
  const b = useData('mix', { ...params, by: 'vehicleCategory' }, seen && dims.includes('vehicleCategory'));
  const c = useData('mix', { ...params, by: 'payment' }, seen && dims.includes('payment'));
  const d = useData('mix', { ...params, by: 'source' }, seen && dims.includes('source'));
  const e = useData('mix', { ...params, by: extraBy }, seen && extra);
  const states = [a, b, c, d];
  const M = METRICS[metric];

  return (
    <Panel ref={ref} id={id} icon={<PieIcon size={17} />} color={C.violet} span={span} title={title}
      subtitle={subtitle}
      info="Switch the measure to see the mix by sessions, revenue or energy. Day-part windows: night 00–05, morning 05–11, afternoon 11–16, evening 16–21, late 21–24."
      actions={<Segmented size="sm" options={Object.entries(METRICS).map(([value, m]) => ({ value, label: m.label }))} value={metric} onChange={setMetric} />}>
      <div className={`ins-mix n${dims.length + (extra ? 1 : 0) + (glance ? 1 : 0)}`}>
        {DIMS.map(([by, t], i) => dims.includes(by) && <Donut key={by} title={t} st={states[i]} metric={metric} />)}
        {extra && <Donut title={EXTRA.find((x) => x.value === extraBy).label} st={e} metric={metric}
          extra={<Segmented size="sm" options={EXTRA} value={extraBy} onChange={setExtraBy} />} />}
        {glance && <div className="ins-tile ins-glance">
          <div className="ins-tile-head"><b><Trophy size={14} /> Leaders by {M.label.toLowerCase()}</b></div>
          {states.every((s, i) => !dims.includes(DIMS[i][0]) || s.data) ? (
            <div className="col gap-12">
              {[...DIMS.map(([by, t], i) => [t, states[i].data]), [EXTRA.find((x) => x.value === extraBy).label, e.data]].filter(([, rows]) => rows?.length).map(([t, rows], i) => {
                const tot = rows.reduce((x, r) => x + r[metric], 0) || 1, top = rows.reduce((x, r) => (r[metric] > x[metric] ? r : x), rows[0]);
                return (
                  <div key={t} className="ins-lead">
                    <div className="row between"><span className="muted xs">{t}</span><b style={{ color: CAT[rows.indexOf(top) % CAT.length] }}>{pretty(top.label)}</b></div>
                    <div className="ins-bar"><i style={{ width: `${(top[metric] / tot) * 100}%`, background: CAT[rows.indexOf(top) % CAT.length], animationDelay: `${i * 80}ms` }} /></div>
                    <div className="muted xs">{((top[metric] / tot) * 100).toFixed(1)}% · {M.fmt(top[metric])}</div>
                  </div>
                );
              })}
            </div>
          ) : <div className="muted small">Loading…</div>}
        </div>}
      </div>
    </Panel>
  );
}
