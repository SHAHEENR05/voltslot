import { useMemo, useState } from 'react';
import { addDays, format } from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, Button, Modal, StatusChip, ErrorState, EmptyState, Skeleton, Badge } from '../ui';
import Gantt from '../fleet/Gantt.jsx';
import { useFetch } from '../../lib/hooks.js';
import { useClock } from '../../lib/clock.jsx';
import { BOOKING_STATUS } from '../../lib/constants.js';
import { parseLocal, time, kw, day } from '../../lib/format.js';

const LEGEND = ['CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'HOLD', 'NO_SHOW'];
const TONE = { amber: 'amber', primary: 'primary', violet: 'violet', green: 'green', red: 'red', grey: 'grey' };
const PT = { ACTIVE: null, MAINTENANCE: { cls: 'amber', label: 'Maintenance' }, OFFLINE: { cls: 'red', label: 'Offline' } };

/** Day schedule: rows = charging points, bars = bookings coloured by status. */
export default function DaySchedule({ stations, stationId, onStationChange, refreshKey }) {
  const { today, now } = useClock();
  const [date, setDate] = useState('');
  const d = date || today;
  const station = stations.find((s) => s.id === stationId);
  const { data, loading, error, reload } = useFetch(stationId ? `/operator/stations/${stationId}/schedule` : null, { params: { date: d }, deps: [refreshKey] });
  const [pick, setPick] = useState(null);
  const base = parseLocal(d);
  const shift = (n) => setDate(format(addDays(base, n), 'yyyy-MM-dd'));
  const open = station?.openHour ?? 0, close = station?.closeHour ?? 24;
  const start = useMemo(() => { const x = new Date(base); x.setHours(open, 0, 0, 0); return x; }, [d, open]); // eslint-disable-line
  const end = useMemo(() => { const x = new Date(base); x.setHours(close, 0, 0, 0); return x; }, [d, close]); // eslint-disable-line

  const rows = useMemo(() => (data?.points || []).map((p) => ({
    key: p.pointId, label: p.label, sub: `${p.connectorCode} · ${kw(p.powerKw)}${PT[p.status] ? ` · ${PT[p.status].label}` : ''}`,
    bars: p.status !== 'ACTIVE' && !p.bookings.length ? [{ key: 'x', start, end, tone: 'grey', label: PT[p.status]?.label || p.status, title: `Point is ${p.status.toLowerCase()}` }]
      : p.bookings.map((b) => ({ key: b.bookingId, start: parseLocal(b.start), end: parseLocal(b.end), tone: TONE[BOOKING_STATUS[b.status]?.cls] || 'primary', label: b.vehicle.split(' ').filter(Boolean).slice(-1)[0], title: `${b.bookingCode} · ${b.vehicle}\n${time(b.start)}–${time(b.end)} · ${b.status}`, onClick: () => setPick(b) })),
  })), [data, start, end]);
  const total = (data?.points || []).reduce((s, p) => s + p.bookings.length, 0);

  return (
    <Card title="Day schedule" subtitle="Every booking of the selected day, grouped per charging point" icon={<CalendarDays size={16} />}
      actions={<select className="select sm" value={stationId || ''} onChange={(e) => onStationChange(Number(e.target.value))} aria-label="Station" style={{ maxWidth: 260 }}>{stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}>
      <div className="row between wrap gap-12 mb-16">
        <div className="row gap-6">
          <Button size="sm" variant="ghost" iconOnly aria-label="Previous day" onClick={() => shift(-1)}><ChevronLeft size={16} /></Button>
          <input className="input sm" type="date" value={d} onChange={(e) => setDate(e.target.value)} aria-label="Schedule date" style={{ width: 160 }} />
          <Button size="sm" variant="ghost" iconOnly aria-label="Next day" onClick={() => shift(1)}><ChevronRight size={16} /></Button>
          {d !== today && <Button size="sm" variant="ghost" onClick={() => setDate('')}>Today</Button>}
          <span className="muted small hide-sm">{day(d)} · {total} booking{total === 1 ? '' : 's'}</span>
        </div>
        <div className="row wrap gap-8 legend-row">{LEGEND.map((s) => <span key={s} className="row gap-4 small muted"><i className={`legend-dot lg-${TONE[BOOKING_STATUS[s].cls]}`} />{BOOKING_STATUS[s].label}</span>)}</div>
      </div>
      {!stationId ? <EmptyState title="Select a station" /> : error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <Skeleton h={220} r={12} /> : (
        <Gantt rows={rows} start={start} end={end} nowAt={d === today ? now : null} labelWidth={150} minWidth={720} emptyText="No charging points at this station" rowHeight={48} />
      )}
      <Modal open={!!pick} size="sm" title={pick?.bookingCode} onClose={() => setPick(null)}>
        {pick && (
          <div className="col gap-8">
            <div className="row between"><span className="muted">Status</span><StatusChip status={pick.status} /></div>
            <div className="row between"><span className="muted">Vehicle</span><b>{pick.vehicle}</b></div>
            <div className="row between"><span className="muted">Customer</span><b>{pick.userName}</b></div>
            <div className="row between"><span className="muted">Time</span><b>{time(pick.start)} – {time(pick.end)}</b></div>
            <div className="row between"><span className="muted">Source</span><Badge>{pick.source.replace('_', '-')}</Badge></div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
