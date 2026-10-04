import { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, Sector, ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip } from 'recharts';
import { MessagesSquare, ThumbsUp, ThumbsDown, Star } from 'lucide-react';
import { format } from 'date-fns';
import { RatingStars } from '../ui';
import { num, parseLocal } from '../../lib/format.js';
import { C, AXIS, Panel, Async, TipBox, MiniLegend, useData, useInView, pretty } from './shared.jsx';

const LABEL_COLOR = { POSITIVE: C.green, NEUTRAL: C.blue, NEGATIVE: C.red };

/** biggest words in the middle, alternating outwards - a cheap word-cloud layout */
const cloudOrder = (list) => {
  const sorted = [...list].sort((a, b) => b.freq - a.freq), out = [];
  sorted.forEach((w, i) => (i % 2 ? out.push(w) : out.unshift(w)));
  return out;
};
function Cloud({ words, color, title, icon }) {
  const [hov, setHov] = useState(null);
  if (!words?.length) return null;
  const max = Math.max(...words.map((w) => w.freq)), min = Math.min(...words.map((w) => w.freq));
  return (
    <div className="ins-cloud-grp">
      <div className="ins-cloud-title" style={{ color }}>{icon}{title}{hov && <em>“{hov.word}” · {num(hov.freq)} mentions</em>}</div>
      <div className="ins-cloud">
        {cloudOrder(words).map((w, i) => {
          const t = max === min ? 0.5 : (w.freq - min) / (max - min);
          return (
            <span key={w.word} className="ins-word" style={{ fontSize: 12 + 19 * Math.sqrt(t), color, opacity: 0.55 + 0.45 * t, animationDelay: `${i * 25}ms`, textShadow: t > 0.6 ? `0 0 18px ${color}66` : 'none' }}
              onMouseEnter={() => setHov(w)} onMouseLeave={() => setHov(null)} title={`${w.word}: ${w.freq} mentions`}>{w.word}</span>
          );
        })}
      </div>
    </div>
  );
}

function StationList({ title, icon, color, rows }) {
  return (
    <div className="ins-tile">
      <div className="ins-tile-head"><b style={{ color }}>{icon}{title}</b></div>
      {rows.length === 0 ? <div className="muted small">No stations match the filters.</div> : (
        <div className="col gap-12">
          {rows.slice(0, 5).map((s, i) => (
            <div className="ins-srow" key={s.stationId} style={{ animationDelay: `${i * 50}ms` }}>
              <div className="row between"><b className="truncate">{s.name}</b><RatingStars value={s.avgRating} size={12} /></div>
              <div className="ins-sentbar" title={`Average sentiment ${s.avgSentiment.toFixed(2)} (−1 … +1)`}>
                <i style={{ left: s.avgSentiment >= 0 ? '50%' : `${50 + s.avgSentiment * 50}%`, width: `${Math.abs(s.avgSentiment) * 50}%`, background: s.avgSentiment >= 0 ? C.green : C.red }} />
              </div>
              <div className="muted xs">{s.zone} · {num(s.reviews)} reviews · sentiment {s.avgSentiment.toFixed(2)} · {s.negativePct.toFixed(0)}% negative</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sentiment({ params }) {
  const [ref, seen] = useInView();
  const st = useData('sentiment', params, seen);
  const [act, setAct] = useState(-1);
  const monthly = useMemo(() => (st.data?.monthly || []).map((m) => ({ ...m, label: format(parseLocal(`${m.month}-01`), "MMM ''yy") })), [st.data]);

  return (
    <Panel ref={ref} id="sentiment" icon={<MessagesSquare size={17} />} color={C.green} span="s-12" title="Driver sentiment"
      subtitle="What reviewers say – label split, loudest keywords, best / worst stations and the monthly mood"
      info="Each review gets a label and a −1…+1 sentiment score from a keyword lexicon. Keyword size is its frequency; green words appear in positive reviews, red in negative ones.">
      <Async state={st} h={560} isEmpty={(d) => !d.reviews}>
        {(d) => {
          const rows = d.labels.map((l) => ({ ...l, color: LABEL_COLOR[l.label] || C.violet }));
          return (
            <>
              <div className="ins-sent-top">
                <div className="ins-tile ins-donut">
                  <div className="ins-tile-head"><b>Review sentiment</b><span className="muted xs">{num(d.reviews)} reviews</span></div>
                  <div className="ins-donut-chart sm">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={rows} dataKey="count" nameKey="label" innerRadius="62%" outerRadius="86%" paddingAngle={3} cornerRadius={6} stroke="none" activeIndex={act}
                          activeShape={(p) => <Sector {...p} outerRadius={p.outerRadius + 6} style={{ filter: `drop-shadow(0 0 9px ${p.fill})` }} />}
                          onMouseEnter={(_, i) => setAct(i)} onMouseLeave={() => setAct(-1)} animationDuration={900}>
                          {rows.map((r) => <Cell key={r.label} fill={r.color} />)}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="ins-donut-center">
                      {act >= 0 ? <><b>{rows[act].pct}%</b><span>{pretty(rows[act].label)}</span></> : <><b><Star size={15} fill={C.amber} stroke="none" /> {d.avgRating.toFixed(2)}</b><span>avg rating</span></>}
                    </div>
                  </div>
                  <div className="ins-dleg">
                    {rows.map((r, i) => <div key={r.label} className={`ins-dleg-row ${act === i ? 'on' : ''}`} onMouseEnter={() => setAct(i)} onMouseLeave={() => setAct(-1)}><i style={{ background: r.color }} /><span>{pretty(r.label)}</span><b>{r.pct}%</b><em>{num(r.count)}</em></div>)}
                  </div>
                </div>
                <div className="ins-tile ins-cloud-tile">
                  <div className="ins-tile-head"><b>Keyword cloud</b><span className="muted xs">size = mentions</span></div>
                  <Cloud words={d.positiveKeywords} color={C.green} title="Praised for" icon={<ThumbsUp size={13} />} />
                  <Cloud words={d.negativeKeywords} color={C.red} title="Complaints about" icon={<ThumbsDown size={13} />} />
                </div>
              </div>
              <div className="ins-sent-bottom">
                <StationList title="Best rated" icon={<ThumbsUp size={14} />} color={C.green} rows={d.bestStations} />
                <StationList title="Needs attention" icon={<ThumbsDown size={14} />} color={C.red} rows={d.worstStations} />
                <div className="ins-tile">
                  <div className="ins-tile-head"><b>Monthly mood</b></div>
                  <MiniLegend items={[{ key: 's', label: 'Sentiment (−1…+1)', color: C.green }, { key: 'r', label: 'Avg rating (right)', color: C.amber }]} />
                  <div className="ins-chart" style={{ height: 210 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={monthly} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                        <defs><linearGradient id="insSent" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.green} stopOpacity=".4" /><stop offset="1" stopColor={C.green} stopOpacity="0" /></linearGradient></defs>
                        <CartesianGrid stroke={C.grid} vertical={false} />
                        <XAxis dataKey="label" {...AXIS} />
                        <YAxis yAxisId="l" domain={[0, 'auto']} width={44} tickFormatter={(v) => v.toFixed(2)} {...AXIS} />
                        <YAxis yAxisId="r" orientation="right" domain={[3, 5]} width={30} {...AXIS} />
                        <RTooltip cursor={{ stroke: 'rgba(255,255,255,.25)', strokeDasharray: '4 4' }} content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const m = payload[0].payload;
                          return <TipBox title={m.label} rows={[{ label: 'Sentiment', value: m.avgSentiment.toFixed(2), color: C.green }, { label: 'Avg rating', value: m.avgRating.toFixed(2), color: C.amber }, { label: 'Reviews', value: num(m.reviews) }]} />;
                        }} />
                        <Area yAxisId="l" type="monotone" dataKey="avgSentiment" stroke={C.green} strokeWidth={2.4} fill="url(#insSent)" activeDot={{ r: 6, className: 'ins-glow-dot', fill: C.green, stroke: '#fff', strokeWidth: 2 }} dot={{ r: 3.5, fill: C.green, strokeWidth: 0 }} animationDuration={1000} />
                        <Line yAxisId="r" type="monotone" dataKey="avgRating" stroke={C.amber} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3, fill: C.amber, strokeWidth: 0 }} activeDot={{ r: 5, className: 'ins-glow-dot' }} animationDuration={1200} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </>
          );
        }}
      </Async>
    </Panel>
  );
}
