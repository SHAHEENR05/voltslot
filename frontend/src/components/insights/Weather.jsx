import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Cell, LabelList, ReferenceLine } from 'recharts';
import { CloudSun, CloudRain, CloudRainWind, PartyPopper, CalendarDays } from 'lucide-react';
import { Segmented } from '../ui';
import { num, inr0 } from '../../lib/format.js';
import { C, AXIS, Panel, Async, TipBox, useData, useInView, pretty, signed } from './shared.jsx';

const COL = { CLEAR: C.amber, CLOUDY: '#94a3b8', RAIN: C.blue, HEAVY_RAIN: C.violet, WEEKDAY: C.cyan, WEEKEND: C.pink, PUBLIC_HOLIDAY: C.green };

function Impact({ icon: Icon, label, value, caption, color }) {
  const neg = value < 0, w = Math.min(50, (Math.abs(value) / 30) * 50);
  return (
    <div className="ins-impact" style={{ '--c': color }}>
      <div className="row between"><span className="ins-impact-ico"><Icon size={18} /></span><span className="muted xs">{label}</span></div>
      <div className={`ins-impact-val ${neg ? 'text-red' : 'text-green'}`}>{signed(value)}</div>
      <div className="ins-diverge"><i style={{ [neg ? 'right' : 'left']: '50%', width: `${w}%`, background: neg ? C.red : C.green }} /></div>
      <div className="muted xs">{caption}</div>
    </div>
  );
}

export default function Weather({ params }) {
  const [ref, seen] = useInView();
  const st = useData('weather-impact', params, seen);
  const [view, setView] = useState('condition');

  return (
    <Panel ref={ref} id="weather" icon={<CloudSun size={17} />} color={C.blue} span="s-12" title="Weather & holiday impact"
      subtitle="How rain, public holidays and weekends move daily sessions – adjusted against comparable normal days"
      info={st.data?.method || 'Adjusted impact compares each day with the average of normal days of the same type within ±14 days.'}
      actions={<Segmented size="sm" options={[{ value: 'condition', label: 'Weather' }, { value: 'daytype', label: 'Day type' }]} value={view} onChange={setView} />}>
      <Async state={st} h={330} isEmpty={(d) => !d.byCondition.length}>
        {(d) => {
          const rows = (view === 'condition' ? d.byCondition : d.byDayType).map((r) => ({ ...r, name: pretty(r.condition), color: COL[r.condition] || C.cyan }));
          const avg = rows.reduce((a, r) => a + r.avgSessionsPerDay * r.days, 0) / (rows.reduce((a, r) => a + r.days, 0) || 1);
          return (
            <div className="ins-weather">
              <div className="ins-tile">
                <div className="ins-tile-head"><b>Average sessions per day</b><span className="muted xs">label = adjusted impact</span></div>
                <div className="ins-chart" style={{ height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart key={view} data={rows} margin={{ top: 26, right: 6, left: -14, bottom: 0 }}>
                      <CartesianGrid stroke={C.grid} vertical={false} />
                      <XAxis dataKey="name" {...AXIS} tick={{ fontSize: 11.5, fill: C.axis }} />
                      <YAxis width={40} {...AXIS} />
                      <ReferenceLine y={avg} stroke="rgba(255,255,255,.35)" strokeDasharray="5 5" label={{ value: `avg ${avg.toFixed(1)}`, position: 'insideTopRight', fill: C.axis, fontSize: 10.5 }} />
                      <RTooltip cursor={{ fill: 'rgba(255,255,255,.04)' }} content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const r = payload[0].payload;
                        return <TipBox title={r.name} rows={[{ label: 'Days observed', value: num(r.days), color: r.color }, { label: 'Avg sessions / day', value: r.avgSessionsPerDay.toFixed(1) }, { label: 'Avg revenue / day', value: inr0(r.avgRevenuePerDay) },
                          { label: 'Adjusted impact', value: signed(r.adjustedImpactPct), color: r.adjustedImpactPct < 0 ? C.red : C.green }]} />;
                      }} />
                      <Bar dataKey="avgSessionsPerDay" radius={[10, 10, 0, 0]} maxBarSize={72} animationDuration={900}>
                        {rows.map((r) => <Cell key={r.condition} fill={r.color} fillOpacity={0.85} style={{ filter: `drop-shadow(0 0 8px ${r.color}55)` }} />)}
                        <LabelList dataKey="adjustedImpactPct" position="top" formatter={(v) => signed(v, 1)} fill={C.text} fontSize={12} fontWeight={700} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="ins-impacts">
                <Impact icon={CloudRain} label="Rainy day" value={d.rainImpactPct} caption="vs a comparable dry day" color={C.blue} />
                <Impact icon={CloudRainWind} label="Heavy rain" value={d.heavyRainImpactPct} caption="deluge days keep drivers home" color={C.violet} />
                <Impact icon={PartyPopper} label="Public holiday" value={d.holidayImpactPct} caption="vs a normal day of the same type" color={C.green} />
                <Impact icon={CalendarDays} label="Weekend" value={d.weekendImpactPct} caption="vs a weekday" color={C.pink} />
              </div>
            </div>
          );
        }}
      </Async>
    </Panel>
  );
}
