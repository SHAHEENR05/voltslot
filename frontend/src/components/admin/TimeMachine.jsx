import { useState } from 'react';
import { format } from 'date-fns';
import { History, FastForward, RotateCcw, BellRing, Info } from 'lucide-react';
import { Card, Button, Skeleton } from '../ui';
import { api } from '../../lib/api.js';
import { useAsync } from '../../lib/hooks.js';
import { useClock } from '../../lib/clock.jsx';
import { useToast } from '../../lib/toast.jsx';
import { parseLocal } from '../../lib/format.js';

const STEPS = [
  { label: '+1 hour', body: { hours: 1 } },
  { label: '+6 hours', body: { hours: 6 } },
  { label: '+1 day', body: { days: 1 } },
  { label: '+3 days', body: { days: 3 } },
];

/** Demo time machine: advance / reset the app clock (admin only); every advance also runs the background jobs once. */
export default function TimeMachine({ onChanged }) {
  const toast = useToast();
  const { refresh } = useClock();
  const { data: clock, loading, setData } = useAsync(() => api.get('/admin/clock'), []);
  const [busy, setBusy] = useState(null);
  const [log, setLog] = useState([]);
  const when = clock ? parseLocal(clock.now) : null;

  const run = async (key, fn, text) => {
    setBusy(key);
    try {
      const res = await fn();
      if (res?.now) { setData(res); setLog((l) => [{ text, at: format(parseLocal(res.now), 'EEE d MMM · HH:mm') }, ...l].slice(0, 4)); await refresh(); onChanged?.(); }
      return res;
    } catch (e) { toast.error(e); } finally { setBusy(null); }
  };
  const advance = (s) => run(s.label, () => api.post('/admin/clock/advance', s.body), `Advanced ${s.label.replace('+', '')}`).then((r) => r && toast.success(`Clock moved ${s.label.replace('+', '')} forward`));
  const reset = () => run('reset', () => api.post('/admin/clock/reset'), 'Reset to anchor').then((r) => r && toast.success('Clock reset to its anchor'));
  const reminders = async () => {
    setBusy('rem');
    try { const r = await api.post('/admin/reminders/run-now'); toast.success(r.created ? `${r.created} new recharge reminder${r.created === 1 ? '' : 's'} created` : 'Reminders evaluated – nothing new is due'); setLog((l) => [{ text: `Reminders run (${r.created} created)`, at: when ? format(when, 'EEE d MMM · HH:mm') : '' }, ...l].slice(0, 4)); }
    catch (e) { toast.error(e); } finally { setBusy(null); }
  };

  return (
    <Card title="Time machine" subtitle="Demo controls for the application clock" icon={<History size={16} />} className="tm-card" hero>
      <div className="tm-now">
        {loading && !clock ? <Skeleton h={64} r={12} /> : (
          <>
            <div className="tm-label">Current app time</div>
            <div className="tm-time">{when ? format(when, 'HH:mm') : '--:--'}<small>{when ? format(when, ':ss') : ''}</small></div>
            <div className="tm-date">{when ? format(when, 'EEEE, d MMMM yyyy') : ''}</div>
            <div className="row gap-8 mt-8"><span className={`pill ${clock?.mode === 'FIXED' ? 'violet' : 'green'}`}><span className="dot" />{clock?.mode === 'FIXED' ? 'Demo clock (fixed anchor)' : clock?.mode || '–'}</span>{clock?.offsetSeconds ? <span className="pill grey">offset {Math.round(clock.offsetSeconds / 3600)} h</span> : <span className="pill grey">at anchor</span>}</div>
          </>)}
      </div>
      <div className="tm-buttons mt-16">
        {STEPS.map((s) => <Button key={s.label} variant="ghost" icon={<FastForward size={15} />} loading={busy === s.label} disabled={!!busy} onClick={() => advance(s)}>{s.label}</Button>)}
      </div>
      <div className="row gap-8 mt-12 wrap">
        <Button variant="danger" icon={<RotateCcw size={15} />} loading={busy === 'reset'} disabled={!!busy} onClick={reset}>Reset</Button>
        <Button icon={<BellRing size={15} />} loading={busy === 'rem'} disabled={!!busy} onClick={reminders}>Run reminders now</Button>
      </div>
      {log.length > 0 && <ul className="tm-log">{log.map((l, i) => <li key={i}><b>{l.text}</b><span className="muted"> → {l.at}</span></li>)}</ul>}
      <div className="tm-why"><Info size={15} /><p>A charging app lives on <b>time</b>: slots start, holds expire, no-shows are marked and recharge reminders fire only as dates pass. The demo clock lets you jump forward to see those background jobs react instantly (each advance runs them once) instead of waiting real hours. Everything in the UI reads "now" from this clock.</p></div>
    </Card>
  );
}
