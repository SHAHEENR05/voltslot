import { useMemo } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts';
import { UsersRound, Briefcase, Palmtree, Coffee, Moon, Truck, Bike, Users } from 'lucide-react';
import { Table } from '../ui';
import { num, inr0 } from '../../lib/format.js';
import { CAT, C, AXIS, Panel, Async, TipBox, useData, useInView, useWidth, money } from './shared.jsx';

const ICONS = { 'Daily Commuters': Briefcase, 'Weekend Explorers': Palmtree, 'Occasional Chargers': Coffee, 'Night Chargers': Moon, 'Fleet & Logistics': Truck, 'Light-EV Riders': Bike };

/** Persona text inferred purely from the segment's metrics (vs the all-segment averages). */
export function persona(s, avgRpu) {
  const f = s.avgSessionsPerUser;
  const freq = f >= 20 ? `Runs a duty cycle – ${f.toFixed(0)} sessions per vehicle` : f >= 6 ? `Habitual – ${f.toFixed(1)} sessions per user` : f >= 3 ? `Regular – ${f.toFixed(1)} sessions per user` : `Infrequent – ${f.toFixed(1)} sessions per user`;
  const timing = s.nightSharePct >= 50 ? `${s.nightSharePct.toFixed(0)}% of sessions overnight` : s.weekendSharePct >= 50 ? `${s.weekendSharePct.toFixed(0)}% of sessions on weekends` : `weekday daytime-led (${s.weekendSharePct.toFixed(0)}% weekend)`;
  const ratio = s.revenuePerUser / (avgRpu || 1);
  const value = ratio >= 2 ? 'premium value' : ratio >= 0.8 ? 'solid value' : ratio >= 0.4 ? 'moderate value' : 'low ticket';
  const play = s.nightSharePct >= 50 && f < 20 ? 'Off-peak night tariff and overnight slot bundles.'
    : f >= 20 ? 'Dedicated fleet plans, bulk wallet top-ups and pre-booked blocks.'
    : s.weekendSharePct >= 50 ? 'Weekend leisure offers near malls and highways.'
    : f >= 6 ? 'Loyalty tiers and predictive recharge reminders.'
    : 'Re-engagement nudges and first-session incentives.';
  return { text: `${freq}; ${timing}; ${value}.`, play };
}

const logTicks = (lo, hi) => {
  const t = [];
  for (let p = Math.floor(Math.log10(lo)); p <= Math.ceil(Math.log10(hi)); p++) [1, 2, 5].forEach((m) => { const v = m * 10 ** p; if (v >= lo && v <= hi) t.push(v); });
  return t;
};

function BubbleTip({ active, payload, avgRpu }) {
  if (!active || !payload?.length) return null;
  const s = payload[0].payload, p = persona(s, avgRpu);
  return <TipBox title={s.segment} rows={[
    { label: 'Users', value: num(s.users), color: s.color }, { label: 'Sessions / user', value: s.avgSessionsPerUser.toFixed(1) }, { label: 'Revenue / user', value: inr0(s.revenuePerUser) },
    { label: 'Revenue', value: inr0(s.revenue) }, { label: 'Night · weekend', value: `${s.nightSharePct}% · ${s.weekendSharePct}%` }]} foot={p.text} />;
}

export default function Segments({ params }) {
  const [ref, seen] = useInView();
  const st = useData('segments', params, seen);
  const [wref, width] = useWidth();

  const m = useMemo(() => {
    const d = st.data;
    if (!d) return null;
    const rows = [...d].sort((a, b) => b.revenue - a.revenue).map((s, i) => ({ ...s, color: CAT[i % CAT.length], labelPos: ['r', 't', 'b', 'r'][i % 4] }));
    const users = rows.reduce((a, s) => a + s.users, 0), rev = rows.reduce((a, s) => a + s.revenue, 0);
    const avgRpu = rev / (users || 1);
    const xs = rows.map((s) => s.avgSessionsPerUser), ys = rows.map((s) => s.revenuePerUser);
    const xd = [Math.max(0.5, Math.min(...xs) / 1.6), Math.max(...xs) * 1.7], yd = [Math.max(50, Math.min(...ys) / 1.7), Math.max(...ys) * 1.7];
    return { rows, users, rev, avgRpu, xd, yd };
  }, [st.data]);

  const bubble = (props) => {
    const { cx, cy, payload, size } = props;
    if (cx == null || cy == null) return null;
    const r = Math.max(7, Math.sqrt((size || 400) / Math.PI));
    const pos = payload.labelPos;
    const lx = pos === 't' || pos === 'b' ? cx : pos === 'l' || cx > width * 0.78 ? cx - r - 8 : cx + r + 8;
    const ly = pos === 't' ? cy - r - 8 : pos === 'b' ? cy + r + 16 : cy + 4;
    const anchor = pos === 't' || pos === 'b' ? 'middle' : pos === 'l' || cx > width * 0.78 ? 'end' : 'start';
    return (
      <g className="ins-bubble">
        <circle cx={cx} cy={cy} r={r + 7} fill={payload.color} opacity={0.12} />
        <circle cx={cx} cy={cy} r={r} fill={payload.color} fillOpacity={0.55} stroke={payload.color} strokeWidth={2} style={{ filter: `drop-shadow(0 0 10px ${payload.color}88)` }} />
        <text x={lx} y={ly} textAnchor={anchor} className="ins-bubble-label">{payload.segment}</text>
      </g>
    );
  };

  return (
    <Panel ref={ref} id="segments" icon={<UsersRound size={17} />} color={C.violet} span="s-12" title="Customer segments"
      subtitle="K-Means clusters on frequency, timing and spend – with a plain-English persona for each"
      info="Segments are K-Means labels over sessions per user, night share, weekend share and energy per session. Bubble area = users; both axes are logarithmic so the fleet outlier doesn't flatten everyone else.">
      <Async state={st} h={520} isEmpty={(d) => !d.length}>
        {() => (
          <>
            <div className="ins-seg-top">
              <div className="ins-tile" ref={wref}>
                <div className="ins-tile-head"><b>Frequency vs value</b><span className="muted xs">bubble area = users</span></div>
                <div className="ins-chart" style={{ height: 390 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 12, right: 24, left: 4, bottom: 18 }}>
                      <CartesianGrid stroke={C.grid} />
                      <XAxis type="number" dataKey="avgSessionsPerUser" name="Sessions / user" scale="log" domain={m.xd} ticks={logTicks(...m.xd)} allowDataOverflow tickFormatter={(v) => num(v, v < 10 ? 0 : 0)} {...AXIS}
                        label={{ value: 'Sessions per user (log)', position: 'insideBottom', offset: -10, fill: C.axis, fontSize: 11 }} />
                      <YAxis type="number" dataKey="revenuePerUser" name="Revenue / user" scale="log" domain={m.yd} ticks={logTicks(...m.yd)} allowDataOverflow width={52} tickFormatter={(v) => money(v).replace(' ', '')} {...AXIS} />
                      <ZAxis type="number" dataKey="users" range={[140, 1500]} />
                      <RTooltip content={<BubbleTip avgRpu={m.avgRpu} />} cursor={{ strokeDasharray: '4 4', stroke: 'rgba(255,255,255,.25)' }} />
                      {m.rows.map((s) => <Scatter key={s.segment} name={s.segment} data={[s]} shape={bubble} animationDuration={900} />)}
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="ins-tile">
                <div className="ins-tile-head"><b>Share of revenue</b><span className="muted xs">{money(m.rev)} total</span></div>
                <div className="ins-radial">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadialBarChart data={m.rows.map((s) => ({ name: s.segment, v: s.sharePct, fill: s.color, revenue: s.revenue }))} innerRadius="38%" outerRadius="100%" startAngle={90} endAngle={-270} barSize={12}>
                      <PolarAngleAxis type="number" domain={[0, Math.max(...m.rows.map((s) => s.sharePct)) * 1.15]} tick={false} />
                      <RadialBar dataKey="v" cornerRadius={8} background={{ fill: 'rgba(255,255,255,.05)' }} animationDuration={1100} />
                      <RTooltip content={({ active, payload }) => (active && payload?.length ? <TipBox title={payload[0].payload.name} rows={[{ label: 'Revenue share', value: `${payload[0].payload.v}%`, color: payload[0].payload.fill }, { label: 'Revenue', value: inr0(payload[0].payload.revenue) }]} /> : null)} />
                    </RadialBarChart>
                  </ResponsiveContainer>
                  <div className="ins-radial-center"><b>{m.rows[0].sharePct}%</b><span>top segment</span></div>
                </div>
                <div className="ins-dleg compact">
                  {m.rows.map((s) => <div className="ins-dleg-row" key={s.segment}><i style={{ background: s.color }} /><span className="truncate">{s.segment}</span><b>{s.sharePct}%</b></div>)}
                </div>
              </div>
            </div>
            <div className="mt-16">
              <Table rowKey="segment" compact defaultSort={{ key: 'revenue', dir: 'desc' }} rows={m.rows} columns={[
                { key: 'segment', header: 'Segment', sortable: true, render: (s) => { const I = ICONS[s.segment] || Users; return <span className="ins-seg-name"><span style={{ background: `${s.color}22`, color: s.color }}><I size={15} /></span><b>{s.segment}</b></span>; } },
                { key: 'persona', header: 'Persona (inferred)', render: (s) => { const p = persona(s, m.avgRpu); return <div className="ins-persona">{p.text}<em>Play: {p.play}</em></div>; } },
                { key: 'users', header: 'Users', numeric: true, sortable: true, render: (s) => num(s.users) },
                { key: 'sharePct', header: 'Revenue share', numeric: true, sortable: true, render: (s) => <div className="ins-cellbar"><div className="ins-bar sm"><i style={{ width: `${s.sharePct}%`, background: s.color }} /></div><b>{s.sharePct}%</b></div> },
                { key: 'avgSessionsPerUser', header: 'Sessions/user', numeric: true, sortable: true, render: (s) => s.avgSessionsPerUser.toFixed(1) },
                { key: 'revenuePerUser', header: 'Revenue/user', numeric: true, sortable: true, render: (s) => inr0(s.revenuePerUser) },
                { key: 'revenue', header: 'Revenue', numeric: true, sortable: true, render: (s) => inr0(s.revenue) },
                { key: 'nightSharePct', header: 'Night %', numeric: true, sortable: true, render: (s) => `${s.nightSharePct.toFixed(1)}%` },
                { key: 'weekendSharePct', header: 'Weekend %', numeric: true, sortable: true, render: (s) => `${s.weekendSharePct.toFixed(1)}%` },
              ]} />
            </div>
          </>
        )}
      </Async>
    </Panel>
  );
}
