import { useEffect, useMemo, useState } from 'react';
import { addHours, format } from 'date-fns';
import { Wand2, CheckCheck, Clock, MapPin, Zap, Gauge, Layers } from 'lucide-react';
import { Card, Button, Chip, Field, FormRow, Segmented, Slider } from '../ui';
import PlanResult from './PlanResult.jsx';
import { PRED_COLOR } from './PredictionChip.jsx';
import { api } from '../../lib/api.js';
import { PRESETS } from '../../lib/constants.js';
import { toIso } from '../../lib/format.js';
import { useClock } from '../../lib/clock.jsx';
import { useReference } from '../../lib/reference.jsx';
import { useToast } from '../../lib/toast.jsx';

const DT = "yyyy-MM-dd'T'HH:mm";
const nextHour = (d) => { const x = new Date(d); x.setMinutes(0, 0, 0); return addHours(x, 1); };
const DEFAULT_START = { value: 'default', label: 'Mumbai centre (default)', lat: 19.076, lon: 72.8777 };

/** Smart scheduler: 1) pick vehicles + constraints  2) POST /fleet/schedule  3) review plan  4) POST /fleet/schedule/apply */
export default function SchedulerWizard({ vehicles, onApplied }) {
  const { now } = useClock();
  const { zones } = useReference();
  const toast = useToast();
  const [sel, setSel] = useState([]);
  const [wStart, setWStart] = useState('');
  const [wEnd, setWEnd] = useState('');
  const [origin, setOrigin] = useState('default');
  const [soc, setSoc] = useState([20, 80]);
  const [preset, setPreset] = useState('BALANCED');
  const [maxPer, setMaxPer] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => { // default window = next full hour -> +12 h (set once the app clock is known)
    if (!wStart) { const s = nextHour(now); setWStart(format(s, DT)); setWEnd(format(addHours(s, 12), DT)); }
  }, [now]); // eslint-disable-line

  const origins = useMemo(() => [DEFAULT_START, ...zones.map((z) => ({ value: z.zone, label: z.zone, lat: z.latitude, lon: z.longitude }))], [zones]);
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const needing = vehicles.filter((r) => r.predictionState === 'OVERDUE' || r.predictionState === 'DUE_SOON').map((r) => r.vehicle.id);

  const generate = async () => {
    setErr(null); setResult(null); setBusy(true);
    const o = origins.find((x) => x.value === origin) || DEFAULT_START;
    try {
      const res = await api.post('/fleet/schedule', {
        vehicleIds: sel, windowStart: `${wStart}:00`, windowEnd: `${wEnd}:00`, startLat: o.lat, startLon: o.lon,
        socStart: soc[0], socTarget: soc[1], preset, maxPerStation: maxPer ? Number(maxPer) : null,
      });
      setResult({ ...res, windowStart: `${wStart}:00`, windowEnd: `${wEnd}:00` });
      setTimeout(() => document.getElementById('plan-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    } catch (e) { setErr(e); if (!e.fieldErrors || !Object.keys(e.fieldErrors).length) toast.error(e); } finally { setBusy(false); }
  };
  const fe = err?.fieldErrors || {};
  const labelOf = (r) => r.vehicle.nickname || r.vehicle.model;

  return (
    <div className="col gap-16">
      <Card title="Smart scheduler" subtitle="Pick vehicles and a time window; VoltSlot proposes the best station, point and slot for each one. Nothing is booked until you apply the plan." icon={<Wand2 size={16} />}>
        <Field label={`Vehicles (${sel.length} of ${vehicles.length} selected)`} error={fe.vehicleIds || (err && !Object.keys(fe).length && err.message?.includes('vehicle') ? err.message : null)}>
          <div className="row wrap gap-8 mb-8">
            <Button size="sm" variant="ghost" icon={<CheckCheck size={14} />} onClick={() => setSel(vehicles.map((r) => r.vehicle.id))}>Select all</Button>
            <Button size="sm" variant="ghost" icon={<Zap size={14} />} onClick={() => setSel(needing)} disabled={!needing.length}>Due soon + overdue ({needing.length})</Button>
            <Button size="sm" variant="ghost" onClick={() => setSel([])} disabled={!sel.length}>Clear</Button>
          </div>
          <div className="veh-pick">
            {vehicles.map((r) => (
              <button type="button" key={r.vehicle.id} className={`veh-chip ${sel.includes(r.vehicle.id) ? 'on' : ''}`} onClick={() => toggle(r.vehicle.id)} aria-pressed={sel.includes(r.vehicle.id)}>
                <span className="vc-dot" style={{ background: PRED_COLOR[r.predictionState] }} />
                <span className="vc-main"><b>{labelOf(r)}</b><small>{r.vehicle.model} · {r.vehicle.regNumber}</small></span>
              </button>
            ))}
          </div>
        </Field>

        <div className="mt-16" />
        <FormRow>
          <Field label="Window starts" error={fe.windowStart}><div className="input-wrap"><Clock size={16} /><input className="input" type="datetime-local" value={wStart} onChange={(e) => setWStart(e.target.value)} /></div></Field>
          <Field label="Window ends" error={fe.windowEnd}><div className="input-wrap"><Clock size={16} /><input className="input" type="datetime-local" value={wEnd} onChange={(e) => setWEnd(e.target.value)} /></div></Field>
          <Field label="Start location" hint="Where the vehicles are right now"><div className="input-wrap"><MapPin size={16} /><select className="select" style={{ paddingLeft: 36 }} value={origin} onChange={(e) => setOrigin(e.target.value)}>{origins.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div></Field>
          <Field label="Max vehicles per station" hint="Spreads the fleet across stations"><div className="input-wrap"><Layers size={16} /><select className="select" style={{ paddingLeft: 36 }} value={maxPer} onChange={(e) => setMaxPer(e.target.value)}><option value="">No limit</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select></div></Field>
        </FormRow>

        <div className="grid cols-2 mt-16" style={{ alignItems: 'start' }}>
          <Field label={`State of charge: ${soc[0]}% → ${soc[1]}%`} error={fe.socTarget || fe.socStart}>
            <div style={{ padding: '6px 8px 0' }}><Slider min={0} max={100} step={5} minGap={5} value={soc} onChange={setSoc} showValues format={(v) => `${v}%`} ticks={[20, 50, 80]} /></div>
          </Field>
          <Field label="Optimise for"><Segmented options={PRESETS} value={preset} onChange={setPreset} size="sm" /></Field>
        </div>

        {err && (!fe || !Object.keys(fe).length) && <div className="banner red mt-12" role="alert">{err.message}</div>}
        <div className="row between mt-16 wrap">
          <span className="muted small"><Gauge size={13} style={{ verticalAlign: -2 }} /> Most urgent vehicles (earliest predicted due date) are planned first.</span>
          <Button size="lg" icon={<Wand2 size={16} />} loading={busy} disabled={!sel.length || !wStart || !wEnd} onClick={generate}>Generate plan</Button>
        </div>
      </Card>

      {result && <div id="plan-result"><PlanResult result={result} requested={sel.length} onApplied={onApplied} /></div>}
    </div>
  );
}
