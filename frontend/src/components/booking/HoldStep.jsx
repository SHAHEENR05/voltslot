import { Timer, MapPin, Zap, CalendarClock, Hourglass } from 'lucide-react';
import CountdownRing from '../ui/CountdownRing.jsx';
import { useClock } from '../../lib/clock.jsx';
import { day, time, inr, kw, minutesHuman, kwh, parseLocal } from '../../lib/format.js';
import { secondsUntil, useTick } from './bookingUtils.js';

/** total length of the hold window (s): from creation to expiry, 300 s when unknown */
export const holdTotal = (b) => {
  const a = parseLocal(b.createdAt), e = parseLocal(b.holdExpiresAt);
  const t = a && e ? Math.round((e - a) / 1000) : 300;
  return t > 0 && t <= 3600 ? t : 300;
};
export const useHoldSeconds = (booking, enabled = true) => {
  const { getNow } = useClock();
  useTick(1000, enabled && !!booking);
  return booking?.holdExpiresAt ? secondsUntil(booking.holdExpiresAt, getNow) : 0;
};

/** Compact booking summary used by Hold / Pay / Done. */
export function BookingSummary({ b }) {
  return (
    <div className="bk-summary" data-testid="booking-summary">
      <div className="row gap-10 start"><MapPin size={15} className="text-primary" style={{ marginTop: 3 }} /><div className="grow"><div className="bold">{b.station.name}</div><div className="muted small">{b.station.zone}</div></div></div>
      <div className="bk-sum-grid">
        <div><span className="f-label"><CalendarClock size={11} /> When</span><b>{day(b.startTime)}</b><span className="muted small">{time(b.startTime)} – {time(b.endTime)} · {minutesHuman(b.slots * 30)}</span></div>
        <div><span className="f-label"><Zap size={11} /> Point</span><b>{b.point.label}</b><span className="muted small">{b.point.connectorCode} · {kw(b.point.powerKw)}</span></div>
        <div><span className="f-label">Vehicle</span><b>{b.vehicle.nickname || b.vehicle.model}</b><span className="muted small">{b.vehicle.regNumber}</span></div>
        <div><span className="f-label">Charge</span><b>{b.socStart}% → {b.socTarget}%</b><span className="muted small">{kwh(b.estEnergyKwh)}</span></div>
      </div>
      <div className="row between bk-sum-total"><span className="muted">{b.payment ? 'Amount paid' : 'Estimated amount'}</span><b>{inr(b.payment ? b.payment.amount : b.estCost, { decimals: 2 })}</b></div>
    </div>
  );
}

/** Step 2: the slot is held for 5 minutes (10 for waitlist offers). */
export default function HoldStep({ booking, remaining }) {
  const total = holdTotal(booking);
  return (
    <div className="col gap-16 bk-hold" data-testid="hold-step">
      <div className="bk-hold-hero">
        <CountdownRing value={Math.max(0, remaining)} total={total} size={150} stroke={10} label="to pay" />
        <div>
          <div className="row gap-8"><Timer size={18} className="text-primary" /><h3 style={{ fontSize: 17 }}>Slot held for you</h3></div>
          <p className="muted mt-4">We are keeping <b className="text-primary">{booking.point.label}</b> for {minutesHuman(Math.round(total / 60))}. Pay before the timer ends or it goes back to other drivers.</p>
          <div className="small muted mt-8"><Hourglass size={12} style={{ verticalAlign: -1 }} /> Booking code <b className="mono" style={{ color: 'var(--text)' }}>{booking.bookingCode}</b></div>
        </div>
      </div>
      <BookingSummary b={booking} />
    </div>
  );
}
