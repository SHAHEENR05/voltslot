import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Car, Wand2, Plug, Ban } from 'lucide-react';
import Field, { FormRow } from '../ui/Field.jsx';
import Slider from '../ui/Slider.jsx';
import Chip from '../ui/Chip.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import EstimateCard from './EstimateCard.jsx';
import Alternatives from './Alternatives.jsx';
import { acceptedKw, isCompatible, vehicleLabel, HALF_HOURS } from './bookingUtils.js';
import { kw, inr, parseLocal } from '../../lib/format.js';
import { CONNECTOR_LABEL } from '../../lib/constants.js';
import { useClock } from '../../lib/clock.jsx';
import { format, addDays } from 'date-fns';

/** Step 1: choose vehicle, point, start and SoC range; live estimate; 409 alternatives. */
export default function PlanStep({ station, stationLoading, vehicles, vehiclesLoading, form, setForm, availability, est, errors, banner, conflict, busy, onPickSlot, onPickStation, onWaitlist }) {
  const { today } = useClock();
  const vehicle = vehicles.find((v) => v.id === Number(form.vehicleId)) || null;
  const points = station?.points || [];
  const maxDate = format(addDays(parseLocal(today), 14), 'yyyy-MM-dd');

  // per half-hour: 'PAST' | 'UNAVAILABLE' | 'BOOKED' | 'FREE' for the chosen point (or any compatible point when auto-assigning)
  const stateAt = useMemo(() => {
    const map = {};
    const av = availability?.points;
    if (!av) return map;
    const rows = form.pointId === 'auto' ? av.filter((p) => p.compatible) : av.filter((p) => p.pointId === Number(form.pointId));
    HALF_HOURS.forEach((t, i) => {
      const sts = rows.map((r) => r.slots[i]?.state).filter(Boolean);
      map[t] = !sts.length ? null : sts.includes('FREE') ? 'FREE' : sts.every((s) => s === 'PAST') ? 'PAST' : sts.every((s) => s === 'UNAVAILABLE' || s === 'PAST') ? 'UNAVAILABLE' : 'BOOKED';
    });
    return map;
  }, [availability, form.pointId]);
  const picked = stateAt[form.time];

  if (!vehiclesLoading && vehicles.length === 0) {
    return <EmptyState icon={<Car size={26} />} title="Add a vehicle first" text="We need your vehicle to check connector compatibility and estimate the charge." action={<Link className="btn primary" to="/garage">Go to Garage</Link>} />;
  }
  return (
    <div className="col gap-16" data-testid="plan-step">
      <div className="bk-station">
        <span className="bk-station-ico"><MapPin size={18} /></span>
        <div className="grow">
          {stationLoading && !station ? <><Skeleton w="70%" h={16} /><div style={{ height: 6 }} /><Skeleton w="40%" h={12} /></> : (
            <><div className="bold truncate">{station?.summary?.name || 'Station'}</div><div className="muted small truncate">{station?.summary?.zone} · {station?.summary?.address}</div></>
          )}
        </div>
      </div>

      <Field label="Vehicle" error={errors.vehicleId}>
        <select className="select" value={form.vehicleId ?? ''} onChange={(e) => setForm((f) => ({ ...f, vehicleId: Number(e.target.value), pointId: 'auto' }))} aria-label="Vehicle">
          {vehicles.map((v) => <option key={v.id} value={v.id}>{vehicleLabel(v)} · {v.regNumber}</option>)}
        </select>
      </Field>

      <div>
        <div className="label mb-8">Charging point</div>
        <div className="bk-points" role="radiogroup" aria-label="Charging point">
          <button type="button" role="radio" aria-checked={form.pointId === 'auto'} className={`bk-point ${form.pointId === 'auto' ? 'sel' : ''}`} onClick={() => setForm((f) => ({ ...f, pointId: 'auto' }))}>
            <span className="bk-point-ico auto"><Wand2 size={15} /></span>
            <span className="grow"><b>Auto-assign</b><span className="muted small"> · best free compatible point</span></span>
            <span className="badge primary">Recommended</span>
          </button>
          {stationLoading && !station && <Skeleton h={44} r={12} />}
          {points.map((p) => {
            const ok = isCompatible(vehicle, p) && p.status === 'ACTIVE';
            const why = p.status !== 'ACTIVE' ? 'Out of service' : !vehicle ? '' : !(vehicle.connectorCodes || []).includes(p.connectorCode) ? `Needs ${CONNECTOR_LABEL[p.connectorCode] || p.connectorCode} connector` : 'Not compatible';
            return (
              <button key={p.id} type="button" role="radio" aria-checked={form.pointId === p.id} disabled={!ok} className={`bk-point ${form.pointId === p.id ? 'sel' : ''}`} onClick={() => setForm((f) => ({ ...f, pointId: p.id }))} title={!ok ? why : undefined}>
                <span className={`bk-point-ico ${p.currentType === 'DC' ? 'dc' : 'ac'}`}>{ok ? <Plug size={15} /> : <Ban size={15} />}</span>
                <span className="grow">
                  <b>{p.label}</b><span className="muted small"> · {CONNECTOR_LABEL[p.connectorCode] || p.connectorCode} · {kw(p.powerKw)}{ok && vehicle && acceptedKw(vehicle, p) < p.powerKw ? ` (your car: ${kw(acceptedKw(vehicle, p))})` : ''}</span>
                </span>
                {ok ? <span className="small muted">{inr(p.tariffPerKwh, { decimals: 2 })}/kWh</span> : <span className="small text-red">{why}</span>}
              </button>
            );
          })}
        </div>
        {errors.chargingPointId && <div className="field has-error"><div className="err">{errors.chargingPointId}</div></div>}
      </div>

      <FormRow>
        <Field label="Date" error={errors.startTime}>
          <input type="date" className="input" value={form.date} min={today} max={maxDate} onChange={(e) => e.target.value && setForm((f) => ({ ...f, date: e.target.value }))} aria-label="Date" />
        </Field>
        <Field label="Start time">
          <select className="select" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} aria-label="Start time">
            {HALF_HOURS.map((t) => {
              const st = stateAt[t];
              return <option key={t} value={t} disabled={st === 'PAST' || st === 'UNAVAILABLE'}>{t}{st === 'BOOKED' ? '  ·  booked' : st === 'UNAVAILABLE' ? '  ·  closed' : ''}</option>;
            })}
          </select>
        </Field>
      </FormRow>
      {picked && (
        <div className={`bk-slot-hint ${picked === 'FREE' ? 'free' : 'busy'}`} data-testid="slot-hint">
          <span className="dot" />{picked === 'FREE' ? 'This start time is free' : picked === 'BOOKED' ? 'This start time looks booked - try another or join the waitlist' : picked === 'PAST' ? 'This time has passed' : 'Station is closed at this time'}
        </div>
      )}

      <Field label="Charge level" error={errors.socStart || errors.socTarget}>
        <div className="bk-soc">
          <div className="row between">
            <span className="bk-soc-val">{form.soc[0]}%</span>
            <span className="faint">→</span>
            <span className="bk-soc-val target">{form.soc[1]}%</span>
          </div>
          <Slider min={0} max={100} value={form.soc} onChange={(soc) => setForm((f) => ({ ...f, soc }))} minGap={1} ticks={[20, 80]} ariaLabel="Charge range" />
          <div className="row wrap gap-6 mt-8">
            {[[20, 80], [10, 90], [30, 100], [0, 100]].map(([a, b]) => <Chip size="sm" key={`${a}-${b}`} active={form.soc[0] === a && form.soc[1] === b} onClick={() => setForm((f) => ({ ...f, soc: [a, b] }))}>{a}→{b}%</Chip>)}
          </div>
        </div>
      </Field>

      <EstimateCard est={est.data} loading={est.loading} error={est.error} startIso={`${form.date}T${form.time}:00`} />

      {banner && <div className="form-error-banner" role="alert">{banner}</div>}
      {conflict && <Alternatives message={conflict.message} alternatives={conflict.alternatives} busy={busy} onPickSlot={onPickSlot} onPickStation={onPickStation} onWaitlist={onWaitlist} canWaitlist />}
    </div>
  );
}
