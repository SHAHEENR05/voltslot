import { useEffect, useState } from 'react';
import { format, subMinutes } from 'date-fns';
import { Footprints, CheckCircle2 } from 'lucide-react';
import { Card, Button, Field, FormRow } from '../ui';
import { api } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { useClock } from '../../lib/clock.jsx';
import { useToast } from '../../lib/toast.jsx';
import { inr, dateTime, kwh } from '../../lib/format.js';

const DT = "yyyy-MM-dd'T'HH:mm";
const DURATIONS = [30, 60, 90, 120, 180, 240, 360];

/** Log a walk-in customer: creates a COMPLETED booking with session + payment (POST /operator/walk-ins). */
export default function WalkInForm({ stations, stationId, onStationChange, onLogged }) {
  const { now } = useClock();
  const toast = useToast();
  const { data: detail } = useFetch(stationId ? `/stations/${stationId}` : null, { deps: [stationId] });
  const points = detail?.points || [];
  const [f, setF] = useState({ pointId: '', reg: '', start: '', duration: 60, energy: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => { if (!f.start) setF((x) => ({ ...x, start: format(subMinutes(now, 60), DT) })); }, [now]); // eslint-disable-line
  useEffect(() => { if (points.length && !points.some((p) => String(p.id) === String(f.pointId))) setF((x) => ({ ...x, pointId: points[0].id })); }, [detail]); // eslint-disable-line

  const fe = err?.fieldErrors || {};
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null); setDone(null);
    try {
      const res = await api.post('/operator/walk-ins', { chargingPointId: Number(f.pointId) || null, vehicleRegNumber: f.reg, startTime: `${f.start}:00`, durationMinutes: Number(f.duration), energyKwh: f.energy === '' ? null : Number(f.energy) });
      setDone(res); toast.success(`Walk-in logged (${res.bookingCode})`); setF((x) => ({ ...x, reg: '', energy: '' })); onLogged?.();
    } catch (ex) { setErr(ex); } finally { setBusy(false); }
  };

  return (
    <Card title="Log a walk-in" subtitle="A customer who simply drove in. Creates a completed session so utilisation and revenue stay accurate." icon={<Footprints size={16} />}>
      <form onSubmit={submit} className="col gap-12">
        {err && !Object.keys(fe).length && <div className="form-error-banner" role="alert">{err.message}</div>}
        <FormRow>
          <Field label="Station"><select className="select" value={stationId || ''} onChange={(e) => onStationChange(Number(e.target.value))}>{stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="Charging point" error={fe.chargingPointId}><select className="select" value={f.pointId} onChange={(e) => setF({ ...f, pointId: e.target.value })}>{points.map((p) => <option key={p.id} value={p.id}>{p.label} · {p.connectorCode} · {p.powerKw} kW{p.status !== 'ACTIVE' ? ` (${p.status.toLowerCase()})` : ''}</option>)}</select></Field>
          <Field label="Vehicle registration" error={fe.vehicleRegNumber} hint="Must be a registered VoltSlot vehicle, e.g. MH04 EV 2481"><input className="input" value={f.reg} onChange={(e) => setF({ ...f, reg: e.target.value })} placeholder="MH04 EV 2481" autoComplete="off" /></Field>
        </FormRow>
        <FormRow>
          <Field label="Started at" error={fe.startTime} hint="Cannot be in the future"><input className="input" type="datetime-local" value={f.start} max={format(now, DT)} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
          <Field label="Duration" error={fe.durationMinutes}><select className="select" value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })}>{DURATIONS.map((d) => <option key={d} value={d}>{d < 60 ? `${d} min` : `${d / 60} h`}</option>)}</select></Field>
          <Field label="Energy delivered (kWh)" error={fe.energyKwh} hint="Optional – estimated from the point power when blank"><input className="input" type="number" min="0" step="0.1" value={f.energy} onChange={(e) => setF({ ...f, energy: e.target.value })} placeholder="auto" /></Field>
        </FormRow>
        <div className="row between wrap">
          {done ? (
            <div className="walkin-done"><CheckCircle2 size={18} className="text-green" /><div><b>{done.bookingCode}</b> logged · {done.vehicle.regNumber} · {kwh(done.session?.energyKwh)} · {inr(done.session?.amount, { decimals: 2 })}<div className="muted xs">{dateTime(done.startTime)} at {done.point.label}</div></div></div>
          ) : <span />}
          <Button type="submit" loading={busy} disabled={!f.pointId || !f.reg || !f.start}>Log walk-in</Button>
        </div>
      </form>
    </Card>
  );
}
