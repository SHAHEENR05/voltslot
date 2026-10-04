import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, ChevronUp, ChevronDown, Lightbulb } from 'lucide-react';
import { Segmented, Badge, RatingStars, EmptyState } from '../ui';
import { num, inr0 } from '../../lib/format.js';
import { C, Panel, Async, useData, useInView } from './shared.jsx';

const CLUSTER_TONE = { 'High-demand hub': 'pink', 'Steady performer': 'primary', Emerging: 'violet', 'Under-utilised': 'amber' };
const COLS = [
  { key: 'sessions', header: 'Sessions', num: true, get: (s) => num(s.sessions) },
  { key: 'revenue', header: 'Revenue', num: true, get: (s) => inr0(s.revenue) },
  { key: 'utilization', header: 'Utilisation', num: true, bar: true },
  { key: 'sessionsPerPoint', header: 'Per point', num: true, get: (s) => s.sessionsPerPoint.toFixed(1) },
  { key: 'rating', header: 'Rating' },
  { key: 'reliability', header: 'Reliability' },
];

function Dots({ score }) {
  const filled = Math.round(score / 20), col = score >= 80 ? C.green : score >= 60 ? C.amber : C.red;
  return (
    <span className="ins-dots" title={`Reliability score ${score.toFixed(1)}`}>
      {[0, 1, 2, 3, 4].map((i) => <i key={i} style={i < filled ? { background: col, boxShadow: `0 0 6px ${col}` } : undefined} />)}
      <b>{score.toFixed(0)}</b>
    </span>
  );
}

export default function Leaderboard({ params }) {
  const [ref, seen] = useInView();
  const nav = useNavigate();
  const [sort, setSort] = useState('sessions');
  const [order, setOrder] = useState('desc');
  const [limit, setLimit] = useState(10);
  const st = useData('stations', { ...params, sort, order, limit }, seen);
  const click = (k) => { if (k === sort) setOrder((o) => (o === 'desc' ? 'asc' : 'desc')); else { setSort(k); setOrder('desc'); } };

  return (
    <Panel ref={ref} id="stations" icon={<Trophy size={17} />} color={C.amber} span="s-12" title="Station leaderboard"
      subtitle="Click a column header to re-rank – the table re-queries the API · click a row to open the station"
      info="Cluster labels come from K-Means on utilisation, sessions per point, rating and reliability. The recommendation is rule-based (peak crowding, utilisation, reliability, sentiment)."
      actions={<Segmented size="sm" options={[{ value: 10, label: 'Top 10' }, { value: 25, label: 'Top 25' }]} value={limit} onChange={setLimit} />}>
      <Async state={st} h={420} isEmpty={(d) => !d.length}>
        {(rows) => {
          const maxU = Math.max(...rows.map((r) => r.utilizationPct), 0.01);
          return (
            <div className="table-wrap ins-lb">
              <table className="table compact">
                <thead>
                  <tr>
                    <th style={{ width: 56 }}>Sr No</th>
                    <th style={{ textAlign: 'center' }}>Station</th>
                    {COLS.map((c) => (
                      <th key={c.key} className={`sortable ${sort === c.key ? 'sorted' : ''}`} onClick={() => click(c.key)} aria-sort={sort === c.key ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <span className="row gap-4" style={{ justifyContent: 'center', display: 'inline-flex' }}>{c.header}{sort === c.key && (order === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}</span>
                      </th>
                    ))}
                    <th>Cluster &amp; recommendation</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s, i) => (
                    <tr key={s.stationId} className="clickable ins-lb-row" style={{ animationDelay: `${i * 30}ms` }} onClick={() => nav(`/station/${s.stationId}`)} title="Open station">
                      <td className="num muted">{i + 1}</td>
                      <td><div className="ins-st"><b>{s.name}</b><span>{s.tier === 'HUB' ? <Badge tone="hub">Hub</Badge> : <Badge>Standard</Badge>}{s.zone} · {s.operatorName} · {s.points} pts</span></div></td>
                      {COLS.map((c) => (
                        <td key={c.key} className={c.num ? 'num' : ''}>
                          {c.bar ? <div className="ins-cellbar"><div className="ins-bar sm"><i style={{ width: `${(s.utilizationPct / maxU) * 100}%`, background: `linear-gradient(90deg, ${C.cyan}, ${C.violet})` }} /></div><b>{s.utilizationPct.toFixed(2)}%</b></div>
                            : c.key === 'rating' ? <RatingStars value={s.avgRating} size={13} />
                              : c.key === 'reliability' ? <Dots score={s.reliabilityScore} />
                                : c.get(s)}
                        </td>
                      ))}
                      <td><div className="ins-reco"><Badge tone={CLUSTER_TONE[s.clusterLabel] || 'primary'}>{s.clusterLabel}</Badge><span><Lightbulb size={13} />{s.recommendation}</span></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && <EmptyState title="No stations" />}
            </div>
          );
        }}
      </Async>
    </Panel>
  );
}
