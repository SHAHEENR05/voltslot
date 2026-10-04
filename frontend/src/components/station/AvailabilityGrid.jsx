import { useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, format } from 'date-fns';
import Skeleton from '../ui/Skeleton.jsx';
import { parseLocal } from '../../lib/format.js';

const CELL = 26;
const STATE_LABEL = { FREE: 'Free', BOOKED: 'Booked', PAST: 'Past', UNAVAILABLE: 'Closed / unavailable' };

/** Date navigation row: prev / date picker / next / today */
export function DateBar({ date, today, onChange }) {
  const d = parseLocal(date) || parseLocal(today);
  const max = format(addDays(parseLocal(today), 14), 'yyyy-MM-dd');
  const step = (n) => { const nx = format(addDays(d, n), 'yyyy-MM-dd'); if (nx >= today && nx <= max) onChange(nx); };
  return (
    <div className="row gap-6 sd-datebar">
      <button className="btn ghost icon sm" onClick={() => step(-1)} disabled={date <= today} aria-label="Previous day"><ChevronLeft size={16} /></button>
      <input type="date" className="input sm" style={{ width: 150 }} value={date} min={today} max={max} onChange={(e) => e.target.value && onChange(e.target.value)} aria-label="Date" />
      <button className="btn ghost icon sm" onClick={() => step(1)} disabled={date >= max} aria-label="Next day"><ChevronRight size={16} /></button>
      <button className="btn ghost sm" onClick={() => onChange(today)} disabled={date === today}>Today</button>
    </div>
  );
}

/**
 * Heat-grid: rows = charging points, columns = 30-minute slots (trimmed to opening hours).
 * Click a FREE (or BOOKED, to join the waitlist) cell to select the start. `selection` = { pointId, idx, slots } highlights the span.
 */
export default function AvailabilityGrid({ availability, loading, error, selection, onSelect, vehicleSelected }) {
  const scroller = useRef(null);
  const av = availability;
  const from = av ? av.openHour * 2 : 0;
  const to = av ? Math.min(48, av.closeHour * 2) : 48;
  const cols = to - from;
  const nowIdx = useMemo(() => {
    if (!av?.now) return -1;
    const n = parseLocal(av.now), d = parseLocal(av.date);
    if (!n || !d || format(n, 'yyyy-MM-dd') !== format(d, 'yyyy-MM-dd')) return -1;
    return n.getHours() * 2 + (n.getMinutes() >= 30 ? 1 : 0);
  }, [av]);

  // bring "now" (today) or the selection into view
  useEffect(() => {
    const el = scroller.current; if (!el || !av) return;
    const target = selection ? selection.idx : nowIdx >= 0 ? nowIdx - 2 : 14; // 07:00 by default on other days
    el.scrollTo({ left: Math.max(0, (target - from) * CELL - 24), behavior: selection ? 'smooth' : 'auto' });
  }, [av?.date, av?.stationId, selection?.idx, selection?.pointId]); // eslint-disable-line

  if (error) return <div className="form-error-banner">{error.message}</div>;
  if (!av) return <div className="col gap-8">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={30} r={8} />)}</div>;

  const hourLabels = Array.from({ length: cols }, (_, k) => { const i = from + k; return i % 2 === 0 ? String(i / 2).padStart(2, '0') : ''; });
  return (
    <div className={`ag-wrap ${loading ? 'is-loading' : ''}`}>
      <div className="ag-scroll" ref={scroller} data-testid="avail-grid">
        <div className="ag" style={{ gridTemplateColumns: `148px repeat(${cols}, ${CELL}px)` }} role="grid" aria-label="Slot availability">
          <div className="ag-corner">Point</div>
          {hourLabels.map((h, k) => <div key={k} className={`ag-hour ${from + k === nowIdx ? 'now' : ''} ${h ? 'tick' : ''}`}>{h}</div>)}
          {av.points.map((p) => {
            const disabledRow = !p.compatible;
            return (
              <div className="ag-row" key={p.pointId} role="row" style={{ display: 'contents' }}>
                <div className={`ag-label ${disabledRow ? 'dim' : ''}`}>
                  <b>{p.label}</b>
                  <small>{p.connectorCode} · {p.powerKw % 1 ? p.powerKw.toFixed(1) : p.powerKw} kW{disabledRow && vehicleSelected ? ' · ✕' : ''}</small>
                </div>
                {p.slots.slice(from, to).map((sl, k) => {
                  const idx = from + k;
                  const inSel = selection && selection.pointId === p.pointId && idx >= selection.idx && idx < selection.idx + selection.slots;
                  const clash = inSel && sl.state !== 'FREE';
                  const clickable = !disabledRow && (sl.state === 'FREE' || sl.state === 'BOOKED');
                  const cls = ['ag-cell', sl.state.toLowerCase(), disabledRow ? 'incompatible' : '', inSel ? 'range' : '', clash ? 'clash' : '', selection && selection.pointId === p.pointId && idx === selection.idx ? 'sel' : '', idx === nowIdx ? 'nowcol' : ''].filter(Boolean).join(' ');
                  const t = sl.start.slice(11, 16);
                  return (
                    <button key={idx} type="button" role="gridcell" className={cls} disabled={!clickable} onClick={() => onSelect(p, idx, sl)}
                      title={`${p.label} · ${t} · ${STATE_LABEL[sl.state]}${disabledRow ? ' · not compatible with your vehicle' : ''}`} aria-label={`${p.label} ${t} ${STATE_LABEL[sl.state]}`} />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <div className="ag-legend">
        <span><i className="ag-sw free" />Free</span><span><i className="ag-sw booked" />Booked</span><span><i className="ag-sw past" />Past</span>
        <span><i className="ag-sw unavailable hatched" />Closed</span><span><i className="ag-sw sel" />Your selection</span>
        {nowIdx >= 0 && <span><i className="ag-sw nowcol" />Now</span>}
      </div>
    </div>
  );
}
