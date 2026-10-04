import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpDown, Route as RouteIcon, Navigation, Timer, Zap, BatteryMedium, Flag, AlertTriangle, CheckCircle2, StickyNote, ChevronDown } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { useBooking } from '../lib/booking.jsx';
import { useClock } from '../lib/clock.jsx';
import { useReference } from '../lib/reference.jsx';
import { useToast } from '../lib/toast.jsx';
import { useFetch } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { km, minutesHuman, time } from '../lib/format.js';
import { Button, Card, Field, Segmented, Slider } from '../components/ui';
import PlacePicker, { resolvePlace } from '../components/trip/PlacePicker.jsx';
import TripTimeline from '../components/trip/TripTimeline.jsx';
import TripMap from '../components/trip/TripMap.jsx';

/** Trip planner (public): origin/destination, vehicle, start charge -> map polyline, charging stops, timeline, summary and notes. */
export default function Trip() {
  const { user, isAuthed } = useAuth();
  const { openBooking } = useBooking();
  const { today, now } = useClock();
  const { zones } = useReference();
  const toast = useToast();
  const vehicles = useFetch('/vehicles', { enabled: isAuthed });
  const home = user?.homeLat != null && user?.homeLon != null ? { lat: user.homeLat, lon: user.homeLon } : null;

  const [origin, setOrigin] = useState({ key: 'zone:Borivali', lat: '', lon: '' });
  const [dest, setDest] = useState({ key: 'zone:Panvel', lat: '', lon: '' });
  const [vehicleId, setVehicleId] = useState('');
  const [soc, setSoc] = useState(25);
  const [reserve, setReserve] = useState(10);
  const [adv, setAdv] = useState(false);
  const [depart, setDepart] = useState('now');
  const [departAt, setDepartAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [res, setRes] = useState(null);       // { trip, originLabel, destLabel, startSoc, vehicleId }
  const [fitKey, setFitKey] = useState(0);
  const resultRef = useRef(null);

  const vlist = vehicles.data || [];
  useEffect(() => { if (vlist.length && vehicleId === '') setVehicleId(String(vlist[0].id)); }, [vlist.length]); // eslint-disable-line
  useEffect(() => { if (!departAt) setDepartAt(`${today}T${String(now.getHours()).padStart(2, '0')}:00`); }, [today]); // eslint-disable-line

  const o = useMemo(() => resolvePlace(origin, zones, home), [origin, zones, home]);
  const d = useMemo(() => resolvePlace(dest, zones, home), [dest, zones, home]);
  useEffect(() => { if (o && d) setFitKey((k) => k + 1); }, [o?.lat, o?.lon, d?.lat, d?.lon]); // eslint-disable-line
  const veh = vlist.find((v) => String(v.id) === String(vehicleId));
  const errs = { origin: !o ? 'Pick a valid origin' : '', dest: !d ? 'Pick a valid destination' : (o && d && o.lat === d.lat && o.lon === d.lon ? 'Destination must differ from the origin' : '') };

  const plan = async (e) => {
    e?.preventDefault();
    if (errs.origin || errs.dest) { setError({ message: errs.origin || errs.dest }); return; }
    setBusy(true); setError(null);
    try {
      const body = { originLat: o.lat, originLon: o.lon, destLat: d.lat, destLon: d.lon, vehicleId: vehicleId ? Number(vehicleId) : null, startSocPercent: soc, reserveSocPercent: reserve };
      if (depart === 'later' && departAt) body.departAt = `${departAt}:00`;
      const trip = await api.post('/trips/plan', body);
      setRes({ trip, originLabel: o.label, destLabel: d.label, startSoc: soc, vehicleId: body.vehicleId });
      setFitKey((k) => k + 1);
      setTimeout(() => { if (window.matchMedia('(max-width: 900px)').matches) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 100);
    } catch (ex) { setError(ex); setRes(null); toast.error(ex); } finally { setBusy(false); }
  };
  const swap = () => { setOrigin(dest); setDest(origin); setRes(null); };
  const book = (l) => openBooking({ stationId: l.station.id, pointId: l.pointId, slotStart: l.slotStart, vehicleId: res.vehicleId || undefined, socStart: l.socStart, socTarget: l.socEnd });
  const trip = res?.trip;
  const stops = trip ? trip.legs.filter((l) => l.type === 'CHARGE').length : 0;

  return (
    <div className="page trip-page">
      <div className="page-head"><div><h1>Trip planner</h1><p>Heading out of town? VoltSlot finds the charging stops along the way and times them with live availability.</p></div></div>
      <div className="trip-layout">
        <Card className="trip-form">
          <form onSubmit={plan} className="col gap-16" noValidate>
            <div className="trip-ends">
              <div className="grow col gap-12">
                <PlacePicker id="trip-from" label="From" value={origin} onChange={setOrigin} zones={zones} home={home} error={errs.origin} />
                <PlacePicker id="trip-to" label="To" value={dest} onChange={setDest} zones={zones} home={home} error={errs.dest} />
              </div>
              <button type="button" className="btn ghost icon trip-swap" onClick={swap} aria-label="Swap origin and destination" title="Swap"><ArrowUpDown size={16} /></button>
            </div>
            <Field label="Vehicle" htmlFor="trip-veh" hint={isAuthed ? undefined : 'Sign in to plan with your own vehicle - using a generic 250 km CCS2 car.'}>
              <select id="trip-veh" className="select" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                <option value="">Generic EV (250 km, CCS2)</option>
                {vlist.map((v) => <option key={v.id} value={v.id}>{v.make} {v.model}{v.nickname ? ` "${v.nickname}"` : ''} - {v.rangeKm} km</option>)}
              </select>
            </Field>
            <div>
              <div className="row between small"><span className="label">Starting charge</span><b>{soc}%{veh ? ` · ~${Math.round(veh.rangeKm * soc / 100)} km` : ''}</b></div>
              <Slider min={5} max={100} step={1} value={soc} onChange={setSoc} ariaLabel="Starting charge" />
              <div className="row between xs faint"><span>5%</span><span>100%</span></div>
            </div>
            <Field label="Depart"><Segmented block value={depart} onChange={setDepart} options={[{ value: 'now', label: 'Now' }, { value: 'later', label: 'Later' }]} />
              {depart === 'later' && <input type="datetime-local" className="input mt-8" value={departAt} min={`${today}T00:00`} onChange={(e) => setDepartAt(e.target.value)} aria-label="Departure time" />}
            </Field>
            <button type="button" className="adv-toggle" onClick={() => setAdv((a) => !a)} aria-expanded={adv}>Advanced <ChevronDown size={14} style={{ transform: adv ? 'rotate(180deg)' : 'none' }} /></button>
            {adv && (
              <div className="fade-in">
                <div className="row between small"><span className="label">Battery reserve at arrival / between stops</span><b>{reserve}%</b></div>
                <Slider min={0} max={40} step={1} value={reserve} onChange={setReserve} ariaLabel="Reserve" />
              </div>
            )}
            <Button type="submit" size="lg" block icon={<RouteIcon size={17} />} loading={busy}>Plan trip</Button>
            {error && <div className="form-error-banner">{error.message}</div>}
          </form>
        </Card>

        <div className="trip-map"><TripMap origin={o} dest={d} trip={trip} fitKey={fitKey} /></div>

        <div className="trip-result" ref={resultRef}>
          {!trip && !busy && (
            <Card className="trip-hint"><div className="row gap-12"><div className="rem-active-ico"><Zap size={20} /></div><div><b>Tip</b><div className="muted small">The default 25% charge on a Borivali → Panvel run needs a stop. Lower the charge or pick a longer route to see how VoltSlot plans stops.</div></div></div></Card>
          )}
          {trip && (
            <div className="col gap-16 fade-up">
              {!trip.feasible && <div className="trip-banner bad"><AlertTriangle size={18} /><div><b>This trip cannot be planned as entered</b><div className="small">{trip.notes.find((n) => /reserve|No compatible|none has|More than/.test(n)) || 'Try a higher starting charge or a different route.'}</div></div></div>}
              {trip.feasible && !trip.needsCharging && <div className="trip-banner good"><CheckCircle2 size={18} /><div><b>No charging stop needed</b><div className="small">You can reach {res.destLabel} on the current charge.</div></div></div>}
              <div className="trip-chips">
                <div><span className="f-label"><Navigation size={11} /> Distance</span><b>{km(trip.distanceKm)}</b></div>
                <div><span className="f-label"><Timer size={11} /> Driving</span><b>{minutesHuman(trip.drivingMinutes)}</b></div>
                <div><span className="f-label"><Zap size={11} /> Stops</span><b>{stops}</b></div>
                <div><span className="f-label"><BatteryMedium size={11} /> Arrive at</span><b>{trip.feasible ? `${trip.arrivalSocPercent}%` : '–'}</b></div>
                <div><span className="f-label"><Flag size={11} /> ETA</span><b>{trip.arriveAt ? time(trip.arriveAt) : '–'}</b></div>
              </div>
              <Card title="Your route" subtitle={`${res.originLabel} → ${res.destLabel}`}>
                <TripTimeline trip={trip} originLabel={res.originLabel} destLabel={res.destLabel} startSoc={res.startSoc} onBook={book} />
              </Card>
              <Card title="Notes" icon={<StickyNote size={16} className="text-amber" />}>
                <ul className="trip-notes">{trip.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
