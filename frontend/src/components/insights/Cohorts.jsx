import { useMemo, useRef, useState } from 'react';
import { Repeat2 } from 'lucide-react';
import { format } from 'date-fns';
import { num, parseLocal } from '../../lib/format.js';
import { C, Panel, Async, TipBox, useData, useInView, scale, GREEN_STOPS } from './shared.jsx';

const cohortLabel = (c) => format(parseLocal(`${c}-01`), 'MMM yyyy');

export default function Cohorts({ params }) {
  const [ref, seen] = useInView();
  // cohorts always look at the full history (a cohort is defined by the month of the first session), other filters still apply
  const st = useData('cohorts', { ...params, from: '2025-10-01' }, seen);
  const [hover, setHover] = useState(null);
  const box = useRef(null);

  const m = useMemo(() => {
    const d = st.data;
    if (!d || !d.length) return null;
    const by = new Map();
    d.forEach((c) => { const r = by.get(c.cohort) || { cohort: c.cohort, size: c.cohortSize, cells: {} }; r.cells[c.monthOffset] = c; by.set(c.cohort, r); });
    const rows = [...by.values()].sort((a, b) => a.cohort.localeCompare(b.cohort));
    const maxOff = Math.max(...d.map((c) => c.monthOffset));
    const avg = Array.from({ length: maxOff + 1 }, (_, o) => {
      const cs = d.filter((c) => c.monthOffset === o);
      const size = cs.reduce((a, c) => a + c.cohortSize, 0), act = cs.reduce((a, c) => a + c.activeUsers, 0);
      return { offset: o, pct: size ? (act / size) * 100 : null, n: cs.length };
    });
    const ceil = Math.max(...d.filter((c) => c.monthOffset > 0).map((c) => c.retentionPct), 1);
    return { rows, maxOff, avg, ceil };
  }, [st.data]);

  const enter = (e, r, c, cell) => {
    const b = box.current.getBoundingClientRect(), t = e.currentTarget.getBoundingClientRect();
    setHover({ r, c, cell, x: Math.min(Math.max(t.left - b.left + t.width / 2, 100), b.width - 100), y: t.top - b.top });
  };
  const col = (pct, o) => (o === 0 ? 'rgba(52,211,153,.16)' : scale(GREEN_STOPS, Math.pow(pct / m.ceil, 0.85)));

  return (
    <Panel ref={ref} id="cohorts" icon={<Repeat2 size={17} />} color={C.green} span="s-12" title="Cohort retention"
      subtitle="Of the drivers whose first charge was in a month, how many charge again N months later?"
      info="Rows are cohorts (month of first session). Column M3 = share of that cohort who charged again three months later. Recent cohorts have fewer columns because the future hasn't happened yet.">
      <Async state={st} h={380} isEmpty={(d) => !d.length}>
        {() => {
          const m1 = m.avg[1]?.pct, m3 = m.avg[3]?.pct, m6 = m.avg[6]?.pct;
          return (
            <>
              <div className="ins-minis">
                <div><span>Avg month-1 retention</span><b className="text-green">{m1 != null ? `${m1.toFixed(1)}%` : '–'}</b></div>
                <div><span>Avg month-3</span><b>{m3 != null ? `${m3.toFixed(1)}%` : '–'}</b></div>
                <div><span>Avg month-6</span><b>{m6 != null ? `${m6.toFixed(1)}%` : '–'}</b></div>
                <div><span>Cohorts</span><b>{m.rows.length}</b><small>{num(m.rows.reduce((a, r) => a + r.size, 0))} drivers</small></div>
              </div>
              <div className="ins-cohort-scroll">
                <div className="ins-cohort" ref={box} onMouseLeave={() => setHover(null)}>
                  <table className="table compact ins-ctable">
                    <thead>
                      <tr>
                        <th style={{ width: 56 }}>Sr No</th><th>Cohort</th><th className="num">Users</th>
                        {Array.from({ length: m.maxOff + 1 }, (_, o) => <th key={o} className={`num ${hover?.c === o ? 'hot' : ''}`}>M{o}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {m.rows.map((r, ri) => (
                        <tr key={r.cohort} className={hover?.r === ri ? 'hot' : ''}>
                          <td className="num muted">{ri + 1}</td>
                          <td><b>{cohortLabel(r.cohort)}</b></td>
                          <td className="num">{num(r.size)}</td>
                          {Array.from({ length: m.maxOff + 1 }, (_, o) => {
                            const c = r.cells[o];
                            return c ? (
                              <td key={o} className="num ins-ccell" style={{ background: col(c.retentionPct, o), color: o === 0 ? 'var(--green)' : c.retentionPct / m.ceil > 0.62 ? '#04140e' : 'var(--text)', animationDelay: `${(ri * 13 + o) * 6}ms` }}
                                onMouseEnter={(e) => enter(e, ri, o, c)}>{c.retentionPct.toFixed(0)}%</td>
                            ) : <td key={o} className="ins-ccell blank" />;
                          })}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td /><td><b>Weighted avg</b></td><td />
                        {m.avg.map((a) => <td key={a.offset} className="num ins-cavg">{a.pct == null ? '' : `${a.pct.toFixed(0)}%`}</td>)}
                      </tr>
                    </tfoot>
                  </table>
                  {hover && (
                    <div className="ins-heat-pop" style={{ left: hover.x, top: hover.y }}>
                      <TipBox title={`${cohortLabel(m.rows[hover.r].cohort)} cohort · month ${hover.c}`} rows={[
                        { label: 'Retention', value: `${hover.cell.retentionPct}%`, color: C.green }, { label: 'Active users', value: `${num(hover.cell.activeUsers)} of ${num(hover.cell.cohortSize)}` }]} />
                    </div>
                  )}
                </div>
              </div>
              <div className="ins-scale"><span>0%</span><i style={{ background: `linear-gradient(90deg, ${GREEN_STOPS.join(',')})` }} /><span>{m.ceil.toFixed(0)}%+</span><span className="muted xs ml-auto">M0 = first-charge month (always 100%)</span></div>
            </>
          );
        }}
      </Async>
    </Panel>
  );
}
