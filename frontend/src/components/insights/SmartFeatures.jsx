// "Smart features" showcase tab: each unique VoltSlot capability with a live mini-visual from the analytics endpoints + a deep link.
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer } from 'recharts';
import { Gauge as GaugeIcon, BellRing, CalendarCheck, Tags, Route, Truck, History, ArrowRight } from 'lucide-react';
import { Button, Skeleton } from '../ui';
import { useAuth } from '../../lib/auth.jsx';
import { useClock } from '../../lib/clock.jsx';
import { num } from '../../lib/format.js';
import { C, TipBox, useData, useInView, scale, HEAT_STOPS, pretty } from './shared.jsx';

function Feature({ icon: Icon, color, title, text, to, cta, show = true, children }) {
  const nav = useNavigate();
  return (
    <div className="ins-feature">
      <div className="ins-feature-head"><span style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}><Icon size={18} /></span><h3>{title}</h3></div>
      <p>{text}</p>
      <div className="ins-feature-vis">{children}</div>
      {show && <Button size="sm" variant="ghost" onClick={() => nav(to)}>{cta}<ArrowRight size={14} /></Button>}
    </div>
  );
}
const Mini = ({ st, h = 96, children }) => (st.data ? children(st.data) : <Skeleton h={h} r={10} />);

export default function SmartFeatures({ params }) {
  const [ref, seen] = useInView('0px');
  const { isAdmin } = useAuth();
  const { label } = useClock();
  const heat = useData('heatmap', { ...params, metric: 'sessions' }, seen);
  const coh = useData('cohorts', { ...params, from: '2025-10-01' }, seen);
  const fun = useData('funnel', params, seen);
  const part = useData('mix', { ...params, by: 'dayPart' }, seen);

  const h = useMemo(() => {
    if (!heat.data) return null;
    const g = Array.from({ length: 7 }, () => Array(24).fill(0));
    heat.data.forEach((c) => { g[c.dayOfWeek - 1][c.hour] = c.value; });
    const max = Math.max(...g.flat(), 1), cols = Array.from({ length: 24 }, (_, i) => g.reduce((a, r) => a + r[i], 0));
    const quiet = cols.map((v, i) => [i, v]).filter(([i]) => i >= 6 && i <= 22).sort((a, b) => a[1] - b[1]).slice(0, 3).map(([i]) => i).sort((a, b) => a - b);
    return { g, max, quiet };
  }, [heat.data]);
  const ret = useMemo(() => {
    if (!coh.data) return [];
    const by = {};
    coh.data.forEach((c) => { const a = by[c.monthOffset] ||= { s: 0, a: 0 }; a.s += c.cohortSize; a.a += c.activeUsers; });
    return Object.entries(by).map(([o, v]) => ({ m: `M${o}`, pct: +((v.a / v.s) * 100).toFixed(1) }));
  }, [coh.data]);
  const BAND = { NIGHT: ['Off-peak', 0.85, C.green], LATE: ['Off-peak', 0.85, C.green], MORNING: ['Standard', 1.0, C.cyan], AFTERNOON: ['Standard', 1.0, C.cyan], EVENING: ['Peak', 1.2, C.pink] };

  return (
    <div ref={ref} className="ins-features">
      <Feature icon={GaugeIcon} color={C.cyan} title="Demand-aware recommendations" to="/" cta="Try the smart pick"
        text="Every recommendation weighs live crowding, so drivers are steered to quiet chargers and quiet hours.">
        <Mini st={heat}>{() => h && (
          <>
            <div className="ins-mini-heat">{h.g.flat().map((v, i) => <i key={i} style={{ background: scale(HEAT_STOPS, Math.pow(v / h.max, 0.75)) }} />)}</div>
            <div className="row gap-6 wrap mt-8"><span className="muted xs">Quietest hours</span>{h.quiet.map((x) => <span key={x} className="ins-chip on">{String(x).padStart(2, '0')}:00</span>)}</div>
          </>
        )}</Mini>
      </Feature>

      <Feature icon={BellRing} color={C.amber} title="Predictive recharge reminders" to="/reminders" cta="See reminders"
        text="We learn each driver's median charging interval and nudge them just before they run low. Reminders keep drivers coming back.">
        <Mini st={coh}>{() => (
          <>
            <div style={{ height: 96 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={ret} margin={{ top: 6, right: 0, left: -30, bottom: 0 }}>
                  <defs><linearGradient id="insRet" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.green} stopOpacity=".35" /><stop offset="1" stopColor={C.green} stopOpacity="0" /></linearGradient></defs>
                  <XAxis dataKey="m" tick={{ fontSize: 10, fill: C.axis }} tickLine={false} axisLine={false} interval={2} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: C.axis }} tickLine={false} axisLine={false} />
                  <RTooltip content={({ active, payload }) => (active && payload?.length ? <TipBox title={`Month ${payload[0].payload.m.slice(1)}`} rows={[{ label: 'Still charging', value: `${payload[0].payload.pct}%`, color: C.green }]} /> : null)} />
                  <Area dataKey="pct" type="monotone" stroke={C.green} strokeWidth={2} fill="url(#insRet)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="muted xs">Cohort retention: share of drivers who charge again N months later</div>
          </>
        )}</Mini>
      </Feature>

      <Feature icon={CalendarCheck} color={C.pink} title="Live slot booking with safe holds" to="/" cta="Book a slot"
        text="Pick a 30-minute slot and it is held for 5 minutes, conflict-safe, until payment confirms.">
        <Mini st={fun}>{(d) => (
          <div className="ins-minibars">
            {d.map((s) => <div key={s.stage}><span>{pretty(s.stage)}</span><div className="ins-bar sm"><i style={{ width: `${s.pctOfFirst}%`, background: C.pink }} /></div><b>{s.pctOfFirst}%</b></div>)}
          </div>
        )}</Mini>
      </Feature>

      <Feature icon={Tags} color={C.green} title="Dynamic off-peak pricing" to="/" cta="Compare tariffs"
        text="Tariffs move with the clock: cheaper off-peak, dearer at the evening rush, nudging load away from peaks.">
        <Mini st={part}>{(d) => {
          const max = Math.max(...d.map((x) => x.sessions), 1);
          return (
            <>
              <div className="ins-daypart">{d.map((x) => { const b = BAND[x.label] || ['', 1, C.cyan]; return <div key={x.label} title={`${pretty(x.label)}: ${num(x.sessions)} sessions · ${b[0]} ×${b[1]}`}><i style={{ height: `${(x.sessions / max) * 100}%`, background: b[2] }} /><span>{pretty(x.label).replace(' night', '')}</span></div>; })}</div>
              <div className="row gap-6 wrap mt-8"><span className="ins-chip">Off-peak ×0.85</span><span className="ins-chip">Standard ×1.0</span><span className="ins-chip">Peak ×1.2</span></div>
            </>
          );
        }}</Mini>
      </Feature>

      <Feature icon={Route} color={C.blue} title="Trip planner" to="/trip" cta="Plan a trip" show={!!isAdmin}
        text="Pick origin and destination and get charging stops sized to your battery and the route.">
        <svg viewBox="0 0 260 90" className="ins-svg"><path d="M14 66 C60 66 70 24 120 30 S190 70 246 24" fill="none" stroke={C.blue} strokeWidth="2.5" strokeDasharray="2 7" strokeLinecap="round" />
          {[[14, 66, 'A'], [120, 30, '⚡'], [190, 56, '⚡'], [246, 24, 'B']].map(([x, y, t]) => <g key={x}><circle cx={x} cy={y} r="11" fill="rgba(56,189,248,.15)" stroke={C.blue} /><text x={x} y={y + 4} textAnchor="middle" fontSize="11" fill={C.text}>{t}</text></g>)}</svg>
      </Feature>

      <Feature icon={Truck} color={C.violet} title="Fleet smart scheduler" to="/fleet" cta="Open fleet console" show={!!isAdmin}
        text="Generate a charging plan for a whole fleet in one click, spread across stations and off-peak windows.">
        <svg viewBox="0 0 260 90" className="ins-svg">{[0, 1, 2, 3].map((r) => [[10 + r * 22, 52 + (r % 2) * 20], [92 + r * 12, 46], [170 - r * 10, 50 + r * 6]].map(([x, w], i) => <rect key={`${r}${i}`} x={x} y={8 + r * 20} width={w} height="13" rx="6" fill={[C.violet, C.cyan, C.pink][i]} opacity=".75" />))}</svg>
      </Feature>

      <Feature icon={History} color={C.amber} title="Time-machine demo clock" to="/admin" cta="Open admin console" show={!!isAdmin}
        text="Jump the whole app forward by hours or days to demo reminders, expiries and forecasts instantly.">
        <div className="ins-clock"><b>{label}</b><div className="row gap-6 wrap mt-8"><span className="ins-chip">+1 h</span><span className="ins-chip">+6 h</span><span className="ins-chip">+1 day</span><span className="ins-chip">Reset</span></div></div>
      </Feature>
    </div>
  );
}
