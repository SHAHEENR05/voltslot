import { useMemo, useRef, useState } from 'react';
import { Flame } from 'lucide-react';
import { Segmented } from '../ui';
import { inr0, num } from '../../lib/format.js';
import { C, Panel, Async, TipBox, useData, useInView, useWidth, scale, HEAT_STOPS, money } from './shared.jsx';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DOW_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const hh = (h) => `${String(h).padStart(2, '0')}:00`;
const short = (v, metric) => (metric === 'revenue' ? (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : Math.round(v)) : Math.round(v));

export default function Heatmap({ params }) {
  const [ref, seen] = useInView();
  const [metric, setMetric] = useState('sessions');
  const st = useData('heatmap', { ...params, metric }, seen);
  const [hover, setHover] = useState(null);
  const box = useRef(null);
  const [wref, width] = useWidth();

  const m = useMemo(() => {
    if (!st.data) return null;
    const g = Array.from({ length: 7 }, () => Array(24).fill(0));
    st.data.forEach((c) => { g[c.dayOfWeek - 1][c.hour] = c.value; });
    const flat = g.flat(), max = Math.max(...flat, 1), min = Math.min(...flat);
    const rowT = g.map((r) => r.reduce((a, b) => a + b, 0)), colT = Array.from({ length: 24 }, (_, h) => g.reduce((a, r) => a + r[h], 0));
    const total = rowT.reduce((a, b) => a + b, 0) || 1;
    let pk = { d: 0, h: 0, v: -1 };
    g.forEach((r, d) => r.forEach((v, h) => { if (v > pk.v) pk = { d, h, v }; }));
    const bestDay = rowT.indexOf(Math.max(...rowT)), bestHour = colT.indexOf(Math.max(...colT));
    const weekend = (rowT[5] + rowT[6]) / total, evening = colT.slice(17, 21).reduce((a, b) => a + b, 0) / total;
    return { g, max, min, rowT, colT, total, pk, bestDay, bestHour, weekend, evening, maxRow: Math.max(...rowT, 1), maxCol: Math.max(...colT, 1) };
  }, [st.data]);

  const fmtV = (v) => (metric === 'revenue' ? inr0(v) : `${num(v)} sessions`);
  const onEnter = (e, d, h) => {
    const b = box.current.getBoundingClientRect(), r = e.currentTarget.getBoundingClientRect();
    setHover({ d, h, x: Math.min(Math.max(r.left - b.left + r.width / 2, 90), b.width - 90), y: r.top - b.top });
  };
  const showNums = width > 860;

  return (
    <Panel ref={ref} id="heatmap" icon={<Flame size={17} />} color={C.pink} span="s-12" title="When do drivers charge?"
      subtitle="Weekday × hour of day – colour runs cyan → violet → pink as demand climbs"
      info="Each cell sums sessions (or revenue) that started in that weekday/hour across the selected period and filters. Use it to schedule staffing, pricing bands and maintenance windows."
      actions={<Segmented size="sm" options={[{ value: 'sessions', label: 'Sessions' }, { value: 'revenue', label: 'Revenue ₹' }]} value={metric} onChange={setMetric} />}>
      <Async state={st} h={330} isEmpty={(d) => !d.length || d.every((c) => !c.value)}>
        {() => (
          <div ref={wref}>
            <div className="ins-heat-stats">
              <div><span>Peak slot</span><b className="text-pink">{DOW[m.pk.d]} {hh(m.pk.h)}</b><small>{metric === 'revenue' ? money(m.pk.v) : `${num(m.pk.v)} sessions`}</small></div>
              <div><span>Busiest weekday</span><b>{DOW_LONG[m.bestDay]}</b><small>{((m.rowT[m.bestDay] / m.total) * 100).toFixed(1)}% of total</small></div>
              <div><span>Busiest hour</span><b>{hh(m.bestHour)}</b><small>{((m.colT[m.bestHour] / m.total) * 100).toFixed(1)}% of total</small></div>
              <div><span>Evening rush 17–21h</span><b>{(m.evening * 100).toFixed(1)}%</b><small>of all {metric}</small></div>
              <div><span>Weekend share</span><b>{(m.weekend * 100).toFixed(1)}%</b><small>vs 28.6% if flat</small></div>
            </div>
            <div className="ins-heat-scroll">
              <div className="ins-heat" ref={box} onMouseLeave={() => setHover(null)}>
                <div className="ins-heat-grid">
                  <i />
                  {Array.from({ length: 24 }, (_, h) => <span key={h} className={`ins-heat-h ${hover?.h === h ? 'on' : ''}`}>{h % 2 === 0 || width > 860 ? String(h).padStart(2, '0') : ''}</span>)}
                  <span className="ins-heat-h tot">Total</span>
                  {m.g.map((row, d) => (
                    <div className="ins-heat-row" key={d}>
                      <span className={`ins-heat-d ${hover?.d === d ? 'on' : ''}`}>{DOW[d]}</span>
                      {row.map((v, h) => {
                        const t = (v - m.min) / (m.max - m.min || 1);
                        const isPk = m.pk.d === d && m.pk.h === h;
                        return (
                          <div key={h} className={`ins-heat-cell ${isPk ? 'peak' : ''} ${hover?.d === d && hover?.h === h ? 'hov' : ''}`}
                            style={{ background: scale(HEAT_STOPS, Math.pow(t, 0.75)), animationDelay: `${(d * 24 + h) * 3}ms`, color: t > 0.5 ? '#0b1220' : 'rgba(232,238,252,.78)' }}
                            onMouseEnter={(e) => onEnter(e, d, h)} onFocus={(e) => onEnter(e, d, h)} tabIndex={0} aria-label={`${DOW_LONG[d]} ${hh(h)}: ${fmtV(v)}`}>
                            {showNums ? short(v, metric) : ''}
                          </div>
                        );
                      })}
                      <span className="ins-heat-tot"><i style={{ width: `${(m.rowT[d] / m.maxRow) * 100}%` }} /><em>{metric === 'revenue' ? money(m.rowT[d]) : num(m.rowT[d])}</em></span>
                    </div>
                  ))}
                  <i />
                  {m.colT.map((v, h) => <span key={h} className="ins-heat-col"><i style={{ height: `${(v / m.maxCol) * 100}%`, opacity: hover?.h === h ? 1 : 0.65 }} /></span>)}
                  <i />
                </div>
                {hover && (
                  <div className="ins-heat-pop" style={{ left: hover.x, top: hover.y }}>
                    <TipBox title={`${DOW_LONG[hover.d]} · ${hh(hover.h)}–${hh((hover.h + 1) % 24)}`}
                      rows={[{ label: metric === 'revenue' ? 'Revenue' : 'Sessions', value: fmtV(m.g[hover.d][hover.h]).replace(' sessions', ''), color: scale(HEAT_STOPS, Math.pow((m.g[hover.d][hover.h] - m.min) / (m.max - m.min || 1), 0.75)) },
                        { label: 'Share of week', value: `${((m.g[hover.d][hover.h] / m.total) * 100).toFixed(2)}%` },
                        { label: 'vs busiest slot', value: `${((m.g[hover.d][hover.h] / m.max) * 100).toFixed(0)}%` }]} />
                  </div>
                )}
              </div>
            </div>
            <div className="ins-scale"><span>{metric === 'revenue' ? money(m.min) : num(m.min)}</span><i style={{ background: `linear-gradient(90deg, ${HEAT_STOPS.join(',')})` }} /><span>{metric === 'revenue' ? money(m.max) : num(m.max)}</span><span className="muted xs ml-auto">Ring = peak slot</span></div>
          </div>
        )}
      </Async>
    </Panel>
  );
}
