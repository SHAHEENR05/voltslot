import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Leaf, Sparkles } from 'lucide-react';
import Chip from '../ui/Chip.jsx';
import CrowdingPill from '../ui/CrowdingPill.jsx';
import { CROWD } from '../../lib/constants.js';
import { crowdingLevelOf, whenLabel } from '../../lib/format.js';

const hh = (h) => `${String(h).padStart(2, '0')}:00`;

/** contiguous runs of quiet (LOW) open hours -> [{from,to}] */
export function quietRanges(byHour, openHour, closeHour) {
  const runs = []; let cur = null;
  byHour.forEach((v, h) => {
    const quiet = v < 35 && h >= openHour && h < closeHour;
    if (quiet) { if (!cur) cur = { from: h, to: h }; else cur.to = h; } else if (cur) { runs.push(cur); cur = null; }
  });
  if (cur) runs.push(cur);
  return runs;
}

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="sd-tip">
      <b>{hh(d.hour)} – {hh((d.hour + 1) % 24)}</b>
      <div className="row gap-6 mt-4"><CrowdingPill level={d.level} index={d.value} /></div>
      {d.closed && <div className="xs muted mt-4">Station closed</div>}
    </div>
  );
}

/** 24 h crowding bar chart for the chosen date + quiet hours + "quietest in the next 24 h" chips (from /forecast). */
export default function CrowdingChart({ byHour, openHour = 0, closeHour = 24, isToday, nowHour, quietest = [], now, onPickQuiet }) {
  const data = useMemo(() => (byHour || []).map((v, h) => ({ hour: h, label: String(h).padStart(2, '0'), value: v, level: crowdingLevelOf(v), closed: h < openHour || h >= closeHour })), [byHour, openHour, closeHour]);
  const quiet = useMemo(() => quietRanges(byHour || [], openHour, closeHour), [byHour, openHour, closeHour]);
  return (
    <div>
      {quietest.length > 0 && (
        <div className="sd-quiet">
          <span className="label row gap-4"><Sparkles size={13} className="text-primary" />Quietest in the next 24 h</span>
          <div className="row wrap gap-6 mt-8">
            {quietest.map((q) => (
              <Chip key={q.start} icon={<Leaf size={12} />} onClick={onPickQuiet ? () => onPickQuiet(q) : undefined} title={`Expected crowding ${Math.round(q.crowdingIndex)} / 100`}>
                {whenLabel(q.start, now)} <span className="faint">· {Math.round(q.crowdingIndex)}</span>
              </Chip>
            ))}
          </div>
        </div>
      )}
      <div className="sd-chart" role="img" aria-label="Crowding by hour">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 10, right: 6, bottom: 0, left: -18 }} barCategoryGap={3}>
            <CartesianGrid stroke="rgba(255,255,255,.08)" vertical={false} />
            {quiet.map((r) => <ReferenceArea key={r.from} x1={String(r.from).padStart(2, '0')} x2={String(r.to).padStart(2, '0')} fill="#34d399" fillOpacity={0.07} />)}
            <XAxis dataKey="label" stroke="#8b9bb8" tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,.08)' }} fontSize={11} interval={1} />
            <YAxis stroke="#8b9bb8" tickLine={false} axisLine={false} fontSize={11} domain={[0, 100]} ticks={[0, 35, 65, 100]} />
            <Tooltip content={<Tip />} cursor={{ fill: 'rgba(255,255,255,.05)' }} />
            <ReferenceLine y={35} stroke="rgba(251,191,36,.35)" strokeDasharray="4 4" />
            <ReferenceLine y={65} stroke="rgba(248,113,113,.35)" strokeDasharray="4 4" />
            {isToday && nowHour != null && <ReferenceLine x={String(nowHour).padStart(2, '0')} stroke="#22d3ee" strokeDasharray="3 3" label={{ value: 'now', fill: '#22d3ee', fontSize: 11, position: 'top' }} />}
            <Bar dataKey="value" radius={[5, 5, 0, 0]} animationDuration={700}>
              {data.map((d) => <Cell key={d.hour} fill={CROWD[d.level].color} fillOpacity={d.closed ? 0.18 : d.level === 'LOW' ? 0.95 : 0.7} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="row between wrap gap-8 mt-8 small">
        <div className="row gap-12 muted">
          {['LOW', 'MEDIUM', 'HIGH'].map((l) => <span key={l} className="row gap-4"><span className="legend-dot" style={{ background: CROWD[l].color }} />{CROWD[l].label}{l === 'LOW' ? ' < 35' : l === 'MEDIUM' ? ' 35–64' : ' ≥ 65'}</span>)}
        </div>
        <div className="muted">{quiet.length ? <>Quiet hours: <b className="text-green">{quiet.map((r) => `${hh(r.from)}–${hh(r.to + 1)}`).join(', ')}</b></> : 'No quiet hours predicted for this day.'}</div>
      </div>
    </div>
  );
}
