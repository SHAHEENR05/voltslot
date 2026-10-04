// Booking drawer: Plan -> Hold -> Pay -> Done. Opened through useBooking().openBooking(opts).
// opts: { stationId, pointId, slotStart, vehicleId, socStart, socTarget, heldBooking, step? }
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Lock, CreditCard, X, Timer } from 'lucide-react';
import Drawer from '../ui/Drawer.jsx';
import Button from '../ui/Button.jsx';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useClock } from '../../lib/clock.jsx';
import { useToast } from '../../lib/toast.jsx';
import { useDebounced, useFetch } from '../../lib/hooks.js';
import { parseLocal, inr } from '../../lib/format.js';
import Stepper from './Stepper.jsx';
import PlanStep from './PlanStep.jsx';
import HoldStep, { useHoldSeconds } from './HoldStep.jsx';
import PayStep, { TopUp } from './PayStep.jsx';
import DoneStep from './DoneStep.jsx';
import { bestPointFor, isCompatible, notifyBookingsChanged, useVehicles } from './bookingUtils.js';

const TITLES = { plan: 'Book a charging slot', hold: 'Slot on hold', pay: 'Payment', done: 'Booking confirmed' };

function initialStart(opts, clock) {
  const d = opts.slotStart ? parseLocal(opts.slotStart) : null;
  if (d) return d;
  const n = new Date(clock.now.getTime());
  n.setSeconds(0, 0);
  const m = n.getMinutes();
  if (m !== 0 && m !== 30) n.setMinutes(m < 30 ? 30 : 60);
  return n;
}

export default function BookingDrawer({ opts, onClose }) {
  const nav = useNavigate();
  const toast = useToast();
  const clock = useClock();
  const { user, refreshUser } = useAuth();
  const { vehicles, loading: vehiclesLoading } = useVehicles();
  const held = opts.heldBooking || null;

  const [stationId, setStationId] = useState(opts.stationId ?? held?.station?.id ?? null);
  const [booking, setBooking] = useState(held);
  const [step, setStep] = useState(!held ? 'plan' : ['CONFIRMED', 'CHECKED_IN', 'COMPLETED'].includes(held.status) ? 'done' : 'pay');
  const [form, setForm] = useState(() => {
    const s = initialStart(opts, clock);
    return { vehicleId: opts.vehicleId ?? null, pointId: opts.pointId ?? 'auto', date: format(s, 'yyyy-MM-dd'), time: format(s, 'HH:mm'), soc: [opts.socStart ?? 20, opts.socTarget ?? 80] };
  });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [availTick, setAvailTick] = useState(0);
  const [method, setMethod] = useState('WALLET');
  const [payErr, setPayErr] = useState(null);
  const [payFieldErrs, setPayFieldErrs] = useState({});
  const [showTopUp, setShowTopUp] = useState(false);
  const [topBusy, setTopBusy] = useState(false);
  const [topErr, setTopErr] = useState(null);
  const [topField, setTopField] = useState(null);
  const [serverExpired, setServerExpired] = useState(false);
  const [est, setEst] = useState({ data: null, loading: false, error: null });

  // ---------- data ----------
  const { data: station, loading: stationLoading } = useFetch(stationId ? `/stations/${stationId}` : null, { enabled: !!stationId });
  const vehicle = vehicles.find((v) => v.id === Number(form.vehicleId)) || null;
  const points = station?.points || [];
  const { data: availability } = useFetch(stationId ? `/stations/${stationId}/availability` : null, {
    params: { date: form.date, vehicleId: form.vehicleId || undefined }, enabled: step === 'plan' && !!stationId && !!form.vehicleId, deps: [availTick],
  });

  // first vehicle by default
  useEffect(() => {
    if (!vehicles.length) return;
    if (!vehicles.some((v) => v.id === Number(form.vehicleId))) setForm((f) => ({ ...f, vehicleId: vehicles[0].id }));
  }, [vehicles]); // eslint-disable-line
  // keep the chosen point valid for the chosen vehicle / station
  useEffect(() => {
    if (form.pointId === 'auto' || !station || !vehicle) return;
    const p = points.find((x) => x.id === Number(form.pointId));
    if (!p || !isCompatible(vehicle, p) || p.status !== 'ACTIVE') setForm((f) => ({ ...f, pointId: 'auto' }));
  }, [station, vehicle, form.pointId]); // eslint-disable-line
  // a held booking passed in (reminders, bookings page): refresh it from the server
  useEffect(() => {
    if (!held?.id) return;
    api.get(`/bookings/${held.id}`).then((b) => { setBooking(b); if (b.status !== 'HOLD') setStep(b.status === 'CONFIRMED' || b.status === 'CHECKED_IN' || b.status === 'COMPLETED' ? 'done' : 'pay'); }).catch(() => {});
  }, [held?.id]); // eslint-disable-line

  // ---------- live estimate (debounced) ----------
  const estPoint = form.pointId === 'auto' ? bestPointFor(vehicle, points) : points.find((p) => p.id === Number(form.pointId));
  const startIso = `${form.date}T${form.time}:00`;
  const estKey = step === 'plan' && vehicle && estPoint ? JSON.stringify([vehicle.id, estPoint.id, form.soc[0], form.soc[1], startIso]) : null;
  const dKey = useDebounced(estKey, 350);
  useEffect(() => {
    if (!dKey) { setEst({ data: null, loading: false, error: null }); return undefined; }
    const [vehicleId, chargingPointId, socStart, socTarget, startTime] = JSON.parse(dKey);
    let dead = false;
    setEst((e) => ({ ...e, loading: true, error: null }));
    api.post('/bookings/estimate', { vehicleId, chargingPointId, startTime, socStart, socTarget })
      .then((data) => { if (!dead) setEst({ data, loading: false, error: null }); })
      .catch((error) => { if (!dead) setEst({ data: null, loading: false, error }); });
    return () => { dead = true; };
  }, [dKey]);
  const estPending = estKey !== dKey;

  // ---------- hold ----------
  const doHold = useCallback(async (o = {}) => {
    setBusy(true); setErrors({}); setBanner(null); setConflict(null);
    const pid = o.chargingPointId !== undefined ? o.chargingPointId : (form.pointId === 'auto' ? null : Number(form.pointId));
    const body = { vehicleId: Number(form.vehicleId), stationId: o.stationId || stationId, startTime: o.startTime || startIso, socStart: form.soc[0], socTarget: form.soc[1], source: 'WEB' };
    if (pid) body.chargingPointId = pid;
    try {
      const b = await api.post('/bookings', body);
      setBooking(b); setStep('hold'); setServerExpired(false); setPayErr(null); setShowTopUp(false);
      notifyBookingsChanged();
    } catch (e) {
      if (e.status === 409 && e.alternatives) { setConflict({ message: e.message, alternatives: e.alternatives }); setAvailTick((t) => t + 1); }
      else if (Object.keys(e.fieldErrors || {}).length) { setErrors(e.fieldErrors); setBanner(e.message); }
      else setBanner(e.message);
    } finally { setBusy(false); }
  }, [form, stationId, startIso]);

  const rebookSlot = (o) => {
    const d = parseLocal(o.start);
    setForm((f) => ({ ...f, pointId: o.pointId, date: format(d, 'yyyy-MM-dd'), time: format(d, 'HH:mm') }));
    doHold({ chargingPointId: o.pointId, startTime: o.start });
  };
  const rebookStation = (it) => {
    const d = parseLocal(it.slotStart);
    setStationId(it.station.id);
    setForm((f) => ({ ...f, pointId: it.point.pointId, date: format(d, 'yyyy-MM-dd'), time: format(d, 'HH:mm') }));
    doHold({ stationId: it.station.id, chargingPointId: it.point.pointId, startTime: it.slotStart });
  };
  const joinWaitlist = async () => {
    setBusy(true);
    try {
      await api.post('/waitlist', { vehicleId: Number(form.vehicleId), stationId, desiredStart: startIso, slots: est.data?.slots || 2 });
      toast.success('You are on the waiting list. We will hold the slot for you if it frees up.');
      notifyBookingsChanged(); onClose();
    } catch (e) { setBanner(e.message); } finally { setBusy(false); }
  };

  // ---------- hold clock ----------
  const remaining = useHoldSeconds(booking, (step === 'hold' || step === 'pay') && !!booking);
  const expired = (step === 'hold' || step === 'pay') && !!booking && (serverExpired || remaining <= 0 || booking.status === 'EXPIRED' || booking.status === 'CANCELLED');
  useEffect(() => { if (expired) notifyBookingsChanged(); }, [expired]);

  // ---------- pay ----------
  const pay = useCallback(async (m) => {
    setBusy(true); setPayErr(null); setPayFieldErrs({});
    try {
      const b = await api.post(`/bookings/${booking.id}/confirm`, { paymentMethod: m || method });
      setBooking(b); setStep('done'); setShowTopUp(false);
      refreshUser(); notifyBookingsChanged();
    } catch (e) {
      if (e.status === 402) { setShowTopUp(true); setPayErr(null); }
      else if (e.status === 409) { if (/expired|current status/i.test(e.message)) setServerExpired(true); else setPayErr(e.message); }
      else { setPayFieldErrs(e.fieldErrors || {}); setPayErr(e.message); }
    } finally { setBusy(false); }
  }, [booking, method, refreshUser]);

  const topUp = async (amount, m) => {
    setTopBusy(true); setTopErr(null); setTopField(null);
    try {
      await api.post('/wallet/topup', { amount, method: m });
      await refreshUser();
      toast.success(`Wallet topped up with ${inr(amount, { decimals: 0 })}`);
      setMethod('WALLET'); setShowTopUp(false);
      await pay('WALLET');
    } catch (e) { setTopField(e.fieldErrors?.amount || null); setTopErr(e.fieldErrors?.amount ? null : e.message); }
    finally { setTopBusy(false); }
  };

  const release = async () => {
    setBusy(true);
    try { await api.post(`/bookings/${booking.id}/cancel`, { reason: 'Hold released' }); toast.info('Hold released.'); notifyBookingsChanged(); onClose(); }
    catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  const close = () => {
    if ((step === 'hold' || step === 'pay') && booking && !expired) toast.info('Your slot stays on hold - pay from My bookings before the timer ends.');
    onClose();
  };
  const restart = () => { setBooking(null); setStep('plan'); setServerExpired(false); setConflict(null); setBanner(null); setAvailTick((t) => t + 1); };

  const balance = Number(user?.walletBalance ?? 0);
  const shortfall = booking ? Math.max(0, Number(booking.estCost) - balance) : 0;

  // ---------- footer ----------
  let footer = null;
  if (expired) footer = <Button variant="primary" block onClick={restart} icon={<Timer size={16} />}>Pick a slot again</Button>;
  else if (step === 'plan') {
    footer = (
      <Button variant="primary" size="lg" block loading={busy} disabled={!est.data || !!est.error || estPending || !form.vehicleId} onClick={() => doHold()} icon={<Lock size={16} />} data-testid="hold-btn">
        Hold slot for 5 min{est.data ? ` · ${inr(est.data.estimatedCost, { decimals: 2 })}` : ''}
      </Button>
    );
  } else if (step === 'hold') {
    footer = <><Button variant="ghost" loading={busy} onClick={release} icon={<X size={15} />}>Release</Button><Button variant="primary" className="grow" onClick={() => setStep('pay')} icon={<CreditCard size={16} />} data-testid="to-pay">Continue to payment</Button></>;
  } else if (step === 'pay') {
    footer = <><Button variant="ghost" onClick={() => setStep('hold')}>Back</Button><Button variant="primary" size="lg" className="grow" loading={busy} onClick={() => pay()} data-testid="pay-btn">Pay {inr(booking.estCost, { decimals: 2 })}</Button></>;
  } else if (step === 'done') {
    footer = <Button variant="ghost" block onClick={onClose}>Close</Button>;
  }

  return (
    <Drawer open title={TITLES[step]} onClose={close} wide footer={footer}>
      <Stepper step={step} />
      <div className="bk-body">
        {expired ? (
          <div className="empty bk-expired" data-testid="hold-expired"><div className="e-icon err"><Timer size={26} /></div><h3>Hold expired</h3><p>The slot was released so other drivers can book it. You can pick a slot again - it only takes a moment.</p></div>
        ) : step === 'plan' ? (
          <PlanStep station={station} stationLoading={stationLoading} vehicles={vehicles} vehiclesLoading={vehiclesLoading} form={form} setForm={(f) => { setConflict(null); setBanner(null); setErrors({}); setForm(f); }}
            availability={availability} est={{ ...est, loading: est.loading || estPending }} errors={errors} banner={banner} conflict={conflict} busy={busy}
            onPickSlot={rebookSlot} onPickStation={rebookStation} onWaitlist={joinWaitlist} />
        ) : step === 'hold' ? <HoldStep booking={booking} remaining={remaining} />
          : step === 'pay' ? (
            <PayStep booking={booking} balance={balance} method={method} setMethod={setMethod} error={payErr} fieldErrors={payFieldErrs} remaining={remaining} onShowTopUp={() => setShowTopUp(true)}
              topUp={showTopUp && <TopUp shortfall={shortfall || Number(booking.estCost)} busy={topBusy} error={topErr} fieldError={topField} onTopUp={topUp} />} />
          ) : <DoneStep booking={booking} onView={() => { onClose(); nav('/bookings'); }} />}
      </div>
    </Drawer>
  );
}
