import { useState } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Cell } from 'recharts';
import { Filter, Timer, AlertOctagon } from 'lucide-react';
import { num, inr0 } from '../../lib/format.js';
import { Table } from '../ui';
import { C, AXIS, Panel, Async, TipBox, MiniLegend, useData, useInView, useWidth, pretty } from './shared.jsx';

const STAGE_COLORS = [C.cyan, C.blue, C.violet, C.pink, C.amber, C.green];
const STAGE_HINT = {
  SEARCH: 'Drivers opened the locator / smart recommendation', VIEW_STATION: 'Opened a station page', SELECT_SLOT: 'Picked a charging slot',
  BOOK: 'Held and paid for a booking', CHECK_IN: 'Arrived and checked in', COMPLETE: 'Charge completed',
};

export function FunnelPanel({ params, span = 's-7' }) {
  const [ref, seen] = useInView();
  const st = useData('funnel', params, seen);
  const [wref, width] = useWidth();
  const [hv, setHv] = useState(null);
  const hov = hv ? hv.i : null, tipPos = hv || { x: 0, y: 0 };

  return (
    <Panel ref={ref} id="funnel" icon={<Filter size={17} />} color={C.pink} span={span} title="Booking funnel"
      subtitle="From first search to a completed charge – where do drivers drop off?"
      info="Stage counts come from the app's event log. Step conversion = this stage ÷ the previous stage. The red pill marks the biggest leak.">
      <Async state={st} h={430} isEmpty={(d) => !d.length || !d[0].sessions}>
        {(stages) => {
          const W = Math.max(width, 280), S = 64, G = 34, n = stages.length, H = n * S + (n - 1) * G + 6;
          const cx = W / 2, maxHalf = W / 2 - 6;
          const leak = stages.reduce((b, s) => (s.stageNo > 1 && s.dropOffPct > (b?.dropOffPct ?? -1) ? s : b), null);
          const final = stages[n - 1];
          return (
            <div ref={wref} className="ins-funnel">
              <div className="ins-minis">
                <div><span>Search → complete</span><b className="text-green">{final.pctOfFirst.toFixed(1)}%</b><small>{num(final.sessions)} of {num(stages[0].sessions)}</small></div>
                {leak && <div><span>Biggest leak</span><b className="text-red">{pretty(stages[leak.stageNo - 2].stage)} → {pretty(leak.stage)}</b><small>{leak.dropOffPct}% drop-off</small></div>}
              </div>
              <div className="ins-funnel-svg" onMouseLeave={() => setHv(null)}>
                <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Booking funnel">
                  <defs>
                    {stages.map((s, i) => (
                      <linearGradient key={i} id={`fun${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor={STAGE_COLORS[i % 6]} stopOpacity=".98" /><stop offset="1" stopColor={STAGE_COLORS[i % 6]} stopOpacity=".72" />
                      </linearGradient>
                    ))}
                  </defs>
                  {stages.map((s, i) => {
                    const y = i * (S + G), top = maxHalf * (s.pctOfFirst / 100), nxt = stages[i + 1];
                    const bot = nxt ? maxHalf * (nxt.pctOfFirst / 100) : top * 0.9;
                    const pts = `${cx - top},${y} ${cx + top},${y} ${cx + bot},${y + S} ${cx - bot},${y + S}`;
                    const dim = hov !== null && hov !== i;
                    const isLeak = leak && s.stageNo === leak.stageNo;
                    return (
                      <g key={s.stage}>
                        {i > 0 && (() => {
                          const label = `↓ ${s.stepConversionPct}% continue · ${s.dropOffPct}% drop-off`;
                          const tw = label.length * 6 + 18;
                          return (
                            <g transform={`translate(${cx},${y - G / 2})`} className={`ins-fun-gap ${isLeak ? 'leak' : ''}`}>
                              <rect x={-tw / 2} y={-10} width={tw} height={20} rx={10} />
                              <text textAnchor="middle" dy="4">{label}</text>
                            </g>
                          );
                        })()}
                        <g className="ins-fun-seg" style={{ animationDelay: `${i * 90}ms`, opacity: dim ? 0.4 : 1, transformOrigin: `${cx}px ${y}px` }}
                          onMouseMove={(e) => { const r = e.currentTarget.ownerSVGElement.getBoundingClientRect(); setHv({ i, x: e.clientX - r.left, y: e.clientY - r.top }); }}>
                          <polygon points={pts} fill={`url(#fun${i % 6})`} stroke={STAGE_COLORS[i % 6]} strokeWidth="6" strokeLinejoin="round" style={{ filter: hov === i ? `drop-shadow(0 0 14px ${STAGE_COLORS[i % 6]})` : 'none', transition: 'filter .2s' }} />
                          <text x={cx} y={y + S / 2 - 3} textAnchor="middle" className="ins-fun-name">{pretty(s.stage)}</text>
                          <text x={cx} y={y + S / 2 + 14} textAnchor="middle" className="ins-fun-val">{num(s.sessions)} · {s.pctOfFirst.toFixed(1)}%</text>
                        </g>
                      </g>
                    );
                  })}
                </svg>
                {hov !== null && (() => {
                  const s = stages[hov], prev = stages[hov - 1];
                  return (
                    <div className="ins-fun-tip" style={{ left: Math.min(Math.max(tipPos.x, 110), W - 110), top: tipPos.y - 12 }}>
                      <TipBox title={`${hov + 1}. ${pretty(s.stage)}`} rows={[
                        { label: 'Sessions', value: num(s.sessions), color: STAGE_COLORS[hov % 6] }, { label: '% of searches', value: `${s.pctOfFirst}%` },
                        ...(prev ? [{ label: 'Step conversion', value: `${s.stepConversionPct}%`, color: C.green }, { label: 'Lost at this step', value: `${num(prev.sessions - s.sessions)} (${s.dropOffPct}%)`, color: C.red }] : [])]}
                        foot={STAGE_HINT[s.stage]} />
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        }}
      </Async>
    </Panel>
  );
}

// ---------------------------------------------------------------------------------------------------------------- lead time
const shortBucket = (b) => b.replace('Walk-in (0 h)', 'Walk-in');

function LeadTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload;
  return <TipBox title={`Booked ${b.bucket} ahead`} rows={[
    { label: 'Bookings', value: `${num(b.bookings)} (${b.sharePct}%)`, color: C.cyan }, { label: 'Avg revenue', value: inr0(b.avgRevenue), color: C.green },
    { label: 'Cancellation', value: `${b.cancellationRatePct}%`, color: C.amber }, { label: 'No-show', value: `${b.noShowRatePct}%`, color: C.pink }]} />;
}

export function LeadTimePanel({ params, span = 's-5' }) {
  const [ref, seen] = useInView();
  const st = useData('lead-time', params, seen);
  return (
    <Panel ref={ref} id="leadtime" icon={<Timer size={17} />} color={C.amber} span={span} title="Booking lead time"
      subtitle="How far ahead drivers book – and how risky each window is"
      info="Bars = share of bookings per lead-time bucket. Lines = cancellation and no-show rate for bookings in that bucket (right axis).">
      <Async state={st} h={430} isEmpty={(d) => !d.length || d.every((b) => !b.bookings)}>
        {(d) => {
          const risky = d.reduce((b, x) => (x.noShowRatePct > b.noShowRatePct ? x : b), d[0]);
          const top = d.reduce((b, x) => (x.sharePct > b.sharePct ? x : b), d[0]);
          return (
            <>
              <div className="ins-minis">
                <div><span>Sweet spot</span><b>{shortBucket(top.bucket)}</b><small>{top.sharePct}% of bookings</small></div>
                <div><span>Riskiest window</span><b className="text-pink">{shortBucket(risky.bucket)}</b><small>{risky.noShowRatePct}% no-show</small></div>
              </div>
              <MiniLegend items={[{ key: 'b', label: 'Share of bookings', color: C.cyan }, { key: 'c', label: 'Cancellation %', color: C.amber }, { key: 'n', label: 'No-show %', color: C.pink }]} />
              <div className="ins-chart" style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={d.map((b) => ({ ...b, name: shortBucket(b.bucket) }))} margin={{ top: 8, right: 0, left: -14, bottom: 0 }}>
                    <defs><linearGradient id="insLead" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.cyan} /><stop offset="1" stopColor={C.violet} stopOpacity=".85" /></linearGradient></defs>
                    <CartesianGrid stroke={C.grid} vertical={false} />
                    <XAxis dataKey="name" interval={0} tick={{ fontSize: 10.5, fill: C.axis }} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="l" tickCount={5} allowDecimals={false} width={50} tickFormatter={(v) => `${Math.round(v)}%`} {...AXIS} />
                    <YAxis yAxisId="r" tickCount={5} allowDecimals={false} orientation="right" width={46} tickFormatter={(v) => `${Math.round(v)}%`} {...AXIS} />
                    <RTooltip content={<LeadTip />} cursor={{ fill: 'rgba(255,255,255,.04)' }} />
                    <Bar yAxisId="l" dataKey="sharePct" radius={[8, 8, 0, 0]} maxBarSize={44} animationDuration={900}>
                      {d.map((b) => <Cell key={b.order} fill="url(#insLead)" fillOpacity={b === top ? 1 : 0.62} />)}
                    </Bar>
                    <Line yAxisId="r" type="monotone" dataKey="cancellationRatePct" stroke={C.amber} strokeWidth={2.2} dot={{ r: 3, fill: C.amber, strokeWidth: 0 }} activeDot={{ r: 6, className: 'ins-glow-dot' }} animationDuration={1100} />
                    <Line yAxisId="r" type="monotone" dataKey="noShowRatePct" stroke={C.pink} strokeWidth={2.2} dot={{ r: 3, fill: C.pink, strokeWidth: 0 }} activeDot={{ r: 6, className: 'ins-glow-dot' }} animationDuration={1300} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-12">
                <Table compact rowKey="order" rows={d} columns={[
                  { key: 'bucket', header: 'Lead time', render: (b) => shortBucket(b.bucket) },
                  { key: 'bookings', header: 'Bookings', numeric: true, render: (b) => num(b.bookings) },
                  { key: 'cancellationRatePct', header: 'Cancel %', numeric: true, render: (b) => `${b.cancellationRatePct.toFixed(1)}%` },
                  { key: 'noShowRatePct', header: 'No-show %', numeric: true, render: (b) => <span className={b === risky ? 'text-pink bold' : ''}>{b.noShowRatePct.toFixed(1)}%</span> },
                ]} />
              </div>
              <div className="ins-foot"><AlertOctagon size={13} className="text-pink" /> Long-lead bookings no-show more often – consider a deposit or a reminder nudge.</div>
            </>
          );
        }}
      </Async>
    </Panel>
  );
}
