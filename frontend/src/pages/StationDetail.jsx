import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { CalendarClock, MapPin, Plug, Sparkles, Star, BarChart3, Zap, Hourglass, X, Info, MapPinOff } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useBooking } from '../lib/booking.jsx';
import { useClock } from '../lib/clock.jsx';
import { useToast } from '../lib/toast.jsx';
import { useFetch } from '../lib/hooks.js';
import { day, inr, kwh, minutesHuman, parseLocal, time, toIso } from '../lib/format.js';
import Card from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import StationMap from '../components/map/StationMap.jsx';
import StationHero from '../components/station/StationHero.jsx';
import PointsTable from '../components/station/PointsTable.jsx';
import Amenities from '../components/station/Amenities.jsx';
import AvailabilityGrid, { DateBar } from '../components/station/AvailabilityGrid.jsx';
import CrowdingChart from '../components/station/CrowdingChart.jsx';
import ReviewsSection from '../components/station/ReviewsSection.jsx';
import { useBookingsChanged, useVehicles, vehicleLabel } from '../components/booking/bookingUtils.js';

const DEFAULT_SOC = [20, 80];

function PageSkeleton() {
  return <div className="page"><Skeleton h={220} r={16} /><div style={{ height: 16 }} /><div className="grid cols-2"><Skeleton h={260} r={16} /><Skeleton h={260} r={16} /></div></div>;
}

/** /station/:id - hero, points, amenities, availability heat-grid, crowding forecast, reviews. Public (guests may browse). */
export default function StationDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const loc = useLocation();
  const toast = useToast();
  const { isAuthed } = useAuth();
  const { openBooking } = useBooking();
  const { today, now } = useClock();
  const { vehicles } = useVehicles();

  const station = useFetch(`/stations/${id}`, { deps: [id] });
  const forecast = useFetch(`/stations/${id}/forecast`, { deps: [id] });

  const [date, setDate] = useState(today);
  const [vehicleId, setVehicleId] = useState(null);
  const [sel, setSel] = useState(null);            // { pointId, idx }
  const [focus, setFocus] = useState(null);        // quiet-chip target (naive ISO) waiting for the grid
  const [est, setEst] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => { setDate(today); setSel(null); }, [id]); // eslint-disable-line
  useEffect(() => { if (vehicles.length && !vehicles.some((v) => v.id === vehicleId)) setVehicleId(vehicles[0].id); }, [vehicles]); // eslint-disable-line
  const vehicle = vehicles.find((v) => v.id === vehicleId) || null;

  const availability = useFetch(`/stations/${id}/availability`, { params: { date, vehicleId: vehicleId || undefined }, deps: [id, tick] });
  const av = availability.data;
  useBookingsChanged(() => { availability.reload(true); forecast.reload(true); });
  useEffect(() => { setSel(null); }, [date, vehicleId]);

  // ---- selected cell -> start time + estimate ----
  const selPoint = sel && av ? av.points.find((p) => p.pointId === sel.pointId) : null;
  const selSlot = selPoint ? selPoint.slots[sel.idx] : null;
  const startIso = selSlot?.start || null;
  useEffect(() => {
    setEst(null);
    if (!sel || !startIso || !vehicleId || !isAuthed || selPoint?.compatible === false) return undefined;
    let dead = false;
    api.post('/bookings/estimate', { vehicleId, chargingPointId: sel.pointId, startTime: startIso, socStart: DEFAULT_SOC[0], socTarget: DEFAULT_SOC[1] })
      .then((r) => { if (!dead) setEst(r); }).catch(() => {});
    return () => { dead = true; };
  }, [sel?.pointId, sel?.idx, startIso, vehicleId, isAuthed]); // eslint-disable-line

  const slotsNeeded = est?.slots || 2;
  const span = useMemo(() => {
    if (!sel || !selPoint) return null;
    const cells = selPoint.slots.slice(sel.idx, sel.idx + slotsNeeded);
    return { cells, clash: cells.length < slotsNeeded || cells.some((c) => c.state !== 'FREE') };
  }, [sel, selPoint, slotsNeeded]);
  const startBooked = selSlot?.state === 'BOOKED';
  const selection = sel ? { pointId: sel.pointId, idx: sel.idx, slots: slotsNeeded } : null;

  // ---- quiet chip: jump to that date/time and select the first free compatible point ----
  useEffect(() => {
    if (!focus || !av || av.date !== focus.slice(0, 10) || availability.loading) return;
    const d = parseLocal(focus); const idx = d.getHours() * 2 + (d.getMinutes() >= 30 ? 1 : 0);
    const p = av.points.find((x) => x.compatible && x.slots[idx]?.state === 'FREE');
    if (p) setSel({ pointId: p.pointId, idx }); else toast.info('No free compatible point at that time - pick another cell.');
    setFocus(null);
  }, [focus, av, availability.loading]); // eslint-disable-line
  const pickQuiet = (q) => { const d = q.start.slice(0, 10); setFocus(q.start); if (d !== date) setDate(d); };

  // ---- actions ----
  const book = useCallback(() => {
    if (sel && startIso && !startBooked) openBooking({ stationId: Number(id), pointId: sel.pointId, slotStart: startIso, vehicleId: vehicleId || undefined, socStart: DEFAULT_SOC[0], socTarget: DEFAULT_SOC[1] });
    else openBooking({ stationId: Number(id), vehicleId: vehicleId || undefined, slotStart: av?.now && date === today ? undefined : `${date}T09:00:00` });
  }, [sel, startIso, startBooked, openBooking, id, vehicleId, av, date, today]);

  const joinWaitlist = async () => {
    if (!isAuthed) { toast.info('Please sign in to join the waiting list.'); nav('/login', { state: { from: loc } }); return; }
    if (!vehicleId) { toast.error('Add a vehicle in your Garage first.'); return; }
    setBusy(true);
    try {
      await api.post('/waitlist', { vehicleId, stationId: Number(id), desiredStart: startIso, slots: slotsNeeded });
      toast.success('You are on the waiting list. We will hold the slot for you if it frees up.');
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  if (station.loading && !station.data) return <PageSkeleton />;
  if (station.error) {
    return (
      <div className="page">{station.error.status === 404
        ? <EmptyState icon={<MapPinOff size={26} />} title="Station not found" text="This charging station does not exist or was removed." action={<Link className="btn primary" to="/">Find chargers</Link>} />
        : <ErrorState error={station.error} onRetry={station.reload} title="Could not load this station" />}</div>
    );
  }
  const detail = station.data;
  const s = detail.summary;
  const isToday = av?.date === today;
  const nowHour = isToday && av?.now ? parseLocal(av.now).getHours() : null;
  const marker = [{ id: s.id, lat: s.latitude, lon: s.longitude, level: s.crowdingLevelNow, title: s.name, subtitle: s.zone }];

  return (
    <div className="page sd-page">
      <StationHero detail={detail} onBook={book} bookLabel={sel && !startBooked ? 'Book selected slot' : 'Book a slot'} />

      <div className="sd-cols mt-16">
        <Card title="Charging points" subtitle={`${s.activePoints} of ${s.totalPoints} active`} icon={<Plug size={16} className="text-primary" />} className="fade-up" pad="0">
          <div style={{ padding: '0 8px 8px' }}><PointsTable points={detail.points} vehicle={vehicle} /></div>
        </Card>
        <div className="col gap-16">
          <Card title="Location" icon={<MapPin size={16} className="text-primary" />} className="fade-up">
            <div className="sd-map"><StationMap markers={marker} center={[s.latitude, s.longitude]} zoom={15} fitKey={`st-${s.id}`} /></div>
            <div className="muted small mt-8">{s.address}</div>
          </Card>
          <Card title="Amenities" icon={<Sparkles size={16} className="text-primary" />} className="fade-up"><Amenities items={detail.amenities} /></Card>
        </div>
      </div>

      <Card className="mt-16 fade-up" title="Availability" subtitle="Click a free cell to choose your start time · each cell = 30 minutes" icon={<CalendarClock size={16} className="text-primary" />}
        actions={<DateBar date={date} today={today} onChange={setDate} />}>
        <div className="sd-avail-tools">
          {isAuthed && vehicles.length > 0
            ? <label className="row gap-8 small"><span className="muted">Vehicle</span>
                <select className="select sm" style={{ width: 240 }} value={vehicleId ?? ''} onChange={(e) => setVehicleId(Number(e.target.value))} aria-label="Vehicle">{vehicles.map((v) => <option key={v.id} value={v.id}>{vehicleLabel(v)}</option>)}</select></label>
            : <span className="muted small row gap-6"><Info size={14} />{isAuthed ? 'Add a vehicle in Garage to see which points fit.' : <>Sign in to see which points fit your vehicle.</>}</span>}
          {av && vehicle && <span className="small muted">{av.points.filter((p) => p.compatible).length} of {av.points.length} points compatible</span>}
        </div>
        <AvailabilityGrid availability={av} loading={availability.loading} error={availability.error} selection={selection} vehicleSelected={!!vehicle}
          onSelect={(p, idx) => setSel((c) => (c && c.pointId === p.pointId && c.idx === idx ? null : { pointId: p.pointId, idx }))} />

        {sel && selSlot && (
          <div className={`sd-selbar ${startBooked || span?.clash ? 'busy' : 'free'} fade-up`} data-testid="selection-bar">
            <div className="grow">
              <div className="row wrap gap-8"><b>{selPoint.label}</b><span className="muted">· {selPoint.connectorCode} · {selPoint.powerKw} kW</span></div>
              <div className="sd-sel-time">{day(startIso)} · {time(startIso)}{span && !startBooked ? ` – ${time(toIso(new Date(parseLocal(startIso).getTime() + slotsNeeded * 30 * 60000)))}` : ''}</div>
              {est && <div className="small muted mt-4"><Zap size={12} style={{ verticalAlign: -1 }} /> {kwh(est.energyKwh)} · {minutesHuman(est.durationMinutes)} · <b style={{ color: 'var(--text)' }}>{inr(est.estimatedCost, { decimals: 2 })}</b> (20→80 %)</div>}
              {startBooked && <div className="small text-red mt-4"><Hourglass size={12} style={{ verticalAlign: -1 }} /> This slot is booked. Join the waitlist and we will hold it for you if it frees up.</div>}
              {!startBooked && span?.clash && <div className="small text-amber mt-4">A {minutesHuman(slotsNeeded * 30)} charge from here overlaps a booked slot. Pick another start or join the waitlist.</div>}
            </div>
            <div className="row wrap gap-8">
              {(startBooked || span?.clash) && <Button variant="ghost" loading={busy} icon={<Hourglass size={15} />} onClick={joinWaitlist} data-testid="join-waitlist">Join waitlist</Button>}
              {!startBooked && <Button variant="primary" icon={<Zap size={15} />} onClick={book} data-testid="book-selected">{span?.clash ? 'Try anyway' : 'Book this slot'}</Button>}
              <Button variant="ghost" iconOnly onClick={() => setSel(null)} aria-label="Clear selection"><X size={16} /></Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="mt-16 fade-up" title="Crowding forecast" subtitle={`Expected demand by hour · ${day(date)}`} icon={<BarChart3 size={16} className="text-primary" />}>
        {availability.loading && !av ? <Skeleton h={220} r={12} /> : (
          <CrowdingChart byHour={av?.crowdingByHour || []} openHour={s.openHour} closeHour={s.closeHour} isToday={isToday} nowHour={nowHour} now={now}
            quietest={forecast.data?.quietestNext24h || []} onPickQuiet={pickQuiet} />
        )}
      </Card>

      <Card className="mt-16 fade-up" title="Reviews" subtitle="What drivers say about this station" icon={<Star size={16} className="text-amber" />}>
        <ReviewsSection stationId={id} detail={detail} onChanged={() => station.reload(true)} />
      </Card>
    </div>
  );
}
