import { useMemo, useState } from 'react';
import { CalendarClock, AlertTriangle, CheckCircle2, Rocket, IndianRupee, Timer, Building2, Truck, XCircle, RotateCcw } from 'lucide-react';
import { Card, Button, Table, ConfirmDialog, KpiCard } from '../ui';
import Gantt from './Gantt.jsx';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useToast } from '../../lib/toast.jsx';
import { useClock } from '../../lib/clock.jsx';
import { inr, minutesHuman, parseLocal, time, dateTimeShort, num } from '../../lib/format.js';

const TONES = ['primary', 'violet', 'green', 'amber', 'pink', 'blue', 'red'];
const hourFloor = (d) => { const x = new Date(d); x.setMinutes(0, 0, 0); return x; };
const hourCeil = (d) => { const x = new Date(d); if (x.getMinutes() || x.getSeconds()) { x.setHours(x.getHours() + 1); } x.setMinutes(0, 0, 0); return x; };
const slotText = (i) => `${time(i.slotStart)} – ${time(i.slotEnd)}`;

export default function PlanResult({ result, requested, onApplied }) {
  const { user, refreshUser } = useAuth();
  const { now } = useClock();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(null);
  const { plan, unassigned } = result;

  const toneOf = useMemo(() => { const m = {}; plan.forEach((p, i) => { m[p.vehicleId] = TONES[i % TONES.length]; }); return m; }, [plan]);
  const range = useMemo(() => {
    let s = parseLocal(result.windowStart), e = parseLocal(result.windowEnd);
    plan.forEach((p) => { const a = parseLocal(p.slotStart), b = parseLocal(p.slotEnd); if (a < s) s = a; if (b > e) e = b; });
    return [hourFloor(s), hourCeil(e)];
  }, [plan, result]);
  const rows = useMemo(() => {
    const m = new Map();
    plan.forEach((p) => {
      if (!m.has(p.pointId)) m.set(p.pointId, { key: p.pointId, label: p.stationName, sub: `${p.pointLabel} · ${p.connectorCode}`, sort: `${p.stationName}|${p.pointLabel}`, bars: [] });
      m.get(p.pointId).bars.push({ key: p.vehicleId, start: parseLocal(p.slotStart), end: parseLocal(p.slotEnd), tone: toneOf[p.vehicleId], label: p.vehicleLabel.split(' · ')[0], title: `${p.vehicleLabel}\n${slotText(p)} · ${inr(p.estimatedCost)}` });
    });
    return [...m.values()].sort((a, b) => a.sort.localeCompare(b.sort));
  }, [plan, toneOf]);
  const labelById = useMemo(() => { const m = {}; [...plan, ...unassigned].forEach((p) => { m[p.vehicleId] = p.vehicleLabel; }); return m; }, [plan, unassigned]);
  const balance = user?.walletBalance ?? 0;
  const short = result.totalCost > balance;

  const apply = async () => {
    setBusy(true);
    try {
      const res = await api.post('/fleet/schedule/apply', { items: plan.map((p) => ({ vehicleId: p.vehicleId, pointId: p.pointId, slotStart: p.slotStart, socStart: p.socStart, socTarget: p.socTarget })) });
      setApplied(res); setConfirm(false);
      refreshUser?.(); onApplied?.();
      if (res.failures.length) toast.info(`${res.created.length} booked, ${res.failures.length} failed`); else toast.success(`${res.created.length} bookings created`);
    } catch (e) { toast.error(e); setConfirm(false); } finally { setBusy(false); }
  };

  const cols = [
    { key: 'vehicleLabel', header: 'Vehicle', render: (r) => <span className="row gap-6"><i className="legend-dot" style={{ background: `var(--${toneOf[r.vehicleId] === 'blue' ? 'primary-2' : toneOf[r.vehicleId]})` }} /><b>{r.vehicleLabel.split(' · ')[0]}</b><span className="muted xs">{r.vehicleLabel.split(' · ')[1]}</span></span> },
    { key: 'stationName', header: 'Station · point', render: (r) => <div><div className="bold">{r.stationName}</div><div className="muted xs">{r.pointLabel} · {r.connectorCode}</div></div> },
    { key: 'slotStart', header: 'Slot', render: (r) => <div><div className="bold" style={{ whiteSpace: 'nowrap' }}>{slotText(r)}</div><div className="muted xs">{dateTimeShort(r.slotStart).split(' · ')[0]}</div></div> },
    { key: 'soc', header: 'SoC', render: (r) => `${r.socStart}% → ${r.socTarget}%` },
    { key: 'waitMinutes', header: 'Wait (min)', numeric: true, render: (r) => num(r.waitMinutes) },
    { key: 'estimatedCost', header: 'Cost', numeric: true, sortable: true, render: (r) => inr(r.estimatedCost, { decimals: 2 }) },
    { key: 'reason', header: 'Why this slot', render: (r) => <span className="muted small">{r.reason}</span> },
  ];

  return (
    <div className="col gap-16">
      <div className="grid cols-4 keep2">
        <KpiCard label="Vehicles planned" value={`${plan.length} / ${requested}`} icon={<Truck size={16} />} hint={unassigned.length ? `${unassigned.length} unassigned` : 'All vehicles placed'} />
        <KpiCard label="Total cost" value={inr(result.totalCost, { decimals: 2 })} icon={<IndianRupee size={16} />} hint={`Wallet ${inr(balance)}`} />
        <KpiCard label="Average wait" value={minutesHuman(result.avgWaitMinutes)} icon={<Timer size={16} />} hint="per vehicle" />
        <KpiCard label="Stations used" value={num(result.stationsUsed)} icon={<Building2 size={16} />} hint="distributed load" />
      </div>

      <Card title="Proposed plan" subtitle="One lane per charging point; each bar is a vehicle's charging slot" icon={<CalendarClock size={16} />}
        actions={!applied && plan.length > 0 && <Button icon={<Rocket size={16} />} onClick={() => setConfirm(true)}>Apply plan</Button>}>
        {plan.length === 0 ? (
          <div className="banner amber"><AlertTriangle size={16} /> No vehicle could be placed inside this window. Try widening the window or lowering the target charge.</div>
        ) : (<>
          <Gantt rows={rows} start={range[0]} end={range[1]} nowAt={now} labelWidth={190} />
          <div className="mt-16"><Table columns={cols} rows={plan.map((p) => ({ ...p, id: p.vehicleId }))} compact /></div>
        </>)}
      </Card>

      {unassigned.length > 0 && (
        <Card title={`Unassigned vehicles (${unassigned.length})`} subtitle="These vehicles could not be scheduled" icon={<AlertTriangle size={16} className="text-amber" />}>
          <div className="col gap-8">
            {unassigned.map((u) => (
              <div key={u.vehicleId} className="unassigned"><XCircle size={16} className="text-red" /><div><b>{u.vehicleLabel}</b><div className="muted small">{u.reason}</div></div></div>
            ))}
          </div>
        </Card>
      )}

      {applied && (
        <Card title="Plan applied" icon={<CheckCircle2 size={16} className="text-green" />} subtitle={`${applied.created.length} bookings created${applied.failures.length ? `, ${applied.failures.length} failed` : ''} · paid from the fleet wallet`}>
          {applied.created.length > 0 && <Table compact serial columns={[
            { key: 'bookingCode', header: 'Booking', render: (b) => <b>{b.bookingCode}</b> },
            { key: 'vehicle', header: 'Vehicle', render: (b) => b.vehicle.nickname || b.vehicle.regNumber },
            { key: 'station', header: 'Station · point', render: (b) => `${b.station.name} · ${b.point.label}` },
            { key: 'startTime', header: 'Slot', render: (b) => `${dateTimeShort(b.startTime)} – ${time(b.endTime)}` },
            { key: 'status', header: 'Status', render: (b) => <span className="pill primary"><span className="dot" />{b.status === 'CONFIRMED' ? 'Confirmed' : b.status}</span> },
            { key: 'estCost', header: 'Paid', numeric: true, render: (b) => inr(b.estCost, { decimals: 2 }) },
          ]} rows={applied.created} />}
          {applied.failures.length > 0 && (
            <div className="col gap-8 mt-12">
              <div className="bold text-red">Failures</div>
              {applied.failures.map((f, i) => <div key={i} className="unassigned"><XCircle size={16} className="text-red" /><div><b>{labelById[f.vehicleId] || `Vehicle ${f.vehicleId}`}</b><div className="muted small">{f.reason}</div></div></div>)}
            </div>
          )}
        </Card>
      )}

      <ConfirmDialog open={confirm} title="Apply this plan?" confirmLabel={`Book ${plan.length} slot${plan.length === 1 ? '' : 's'}`} loading={busy} onConfirm={apply} onCancel={() => setConfirm(false)}>
        <p className="muted">VoltSlot will hold and pay for {plan.length} slot{plan.length === 1 ? '' : 's'} from your wallet.</p>
        <div className="confirm-sum"><span>Total</span><b>{inr(result.totalCost, { decimals: 2 })}</b></div>
        <div className="confirm-sum"><span>Wallet balance</span><b className={short ? 'text-red' : ''}>{inr(balance, { decimals: 2 })}</b></div>
        {short && <div className="banner red mt-8"><AlertTriangle size={16} /> Balance is lower than the plan total; some bookings may fail.</div>}
      </ConfirmDialog>
    </div>
  );
}
