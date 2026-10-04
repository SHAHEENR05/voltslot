import { Link } from 'react-router-dom';
import { MapPin, Zap, Car, Clock, QrCode, CalendarPlus, XCircle, LogIn, PlayCircle, Receipt, Star, CreditCard, Timer, Leaf, BatteryCharging, Undo2 } from 'lucide-react';
import Button from '../ui/Button.jsx';
import StatusChip from '../ui/StatusChip.jsx';
import Badge from '../ui/Badge.jsx';
import { useClock } from '../../lib/clock.jsx';
import { day, time, inr, kw, kwh, minutesHuman, parseLocal, dateTime } from '../../lib/format.js';
import { secondsUntil, useTick, SOURCE_LABEL } from '../booking/bookingUtils.js';
import { PAY_LABEL } from './payLabels.js';

const STRIP = { HOLD: 'amber', CONFIRMED: 'primary', CHECKED_IN: 'violet', COMPLETED: 'green', CANCELLED: 'grey', NO_SHOW: 'red', EXPIRED: 'grey' };

/** countdown / status line for a booking, measured on the app clock */
function Timing({ b }) {
  const { getNow } = useClock();
  useTick(b.status === 'HOLD' ? 1000 : 15000);
  const nowMs = getNow().getTime();
  const start = parseLocal(b.startTime).getTime(), end = parseLocal(b.endTime).getTime();
  if (b.status === 'HOLD') {
    const s = secondsUntil(b.holdExpiresAt, getNow);
    if (s <= 0) return <span className="bkc-timing red"><Timer size={13} />Hold expired</span>;
    return <span className={`bkc-timing ${s < 60 ? 'red' : 'amber'}`}><Timer size={13} />Pay within {String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}</span>;
  }
  if (b.status === 'CONFIRMED') {
    const m = Math.round((start - nowMs) / 60000);
    if (m > 0) return <span className="bkc-timing primary"><Clock size={13} />Starts in {minutesHuman(m)}</span>;
    return <span className="bkc-timing amber"><Clock size={13} />Started {minutesHuman(-m)} ago</span>;
  }
  if (b.status === 'CHECKED_IN') {
    const left = Math.round((end - nowMs) / 60000);
    return <span className="bkc-timing violet"><BatteryCharging size={13} />{left > 0 ? `Charging · ${minutesHuman(left)} left` : 'Charging · finishing'}</span>;
  }
  return null;
}

function Progress({ b }) {
  const { getNow } = useClock();
  useTick(10000);
  const start = parseLocal(b.checkedInAt || b.startTime).getTime(), end = parseLocal(b.endTime).getTime();
  const p = Math.max(3, Math.min(100, ((getNow().getTime() - start) / Math.max(1, end - start)) * 100));
  return <div className="progress mt-8" aria-label="Session progress"><span style={{ width: `${p}%` }} /></div>;
}

/** One booking as a card. Actions are callbacks so the page owns dialogs. */
export default function BookingCard({ b, busyId, rated, onPay, onCheckIn, onCancel, onComplete, onQr, onInvoice, onRate, onCalendar }) {
  const busy = busyId === b.id;
  const live = ['HOLD', 'CONFIRMED', 'CHECKED_IN'].includes(b.status);
  const pay = b.payment;
  return (
    <article className={`card bkc ${STRIP[b.status] || 'grey'} ${b.canCheckIn ? 'ready' : ''}`} data-testid="booking-card" data-status={b.status}>
      <div className="bkc-head">
        <div className="row wrap gap-8">
          <StatusChip status={b.status} />
          <span className="bkc-code mono">{b.bookingCode}</span>
          {SOURCE_LABEL[b.source] && <Badge tone="violet">{SOURCE_LABEL[b.source]}</Badge>}
        </div>
        <Timing b={b} />
      </div>

      <div className="bkc-main">
        <div className="grow">
          <h3 className="bkc-station"><Link to={`/station/${b.station.id}`}>{b.station.name}</Link></h3>
          <div className="muted small row gap-4"><MapPin size={12} />{b.station.zone}</div>
        </div>
        <div className="bkc-when">
          <div className="bold">{day(b.startTime)}</div>
          <div className="muted small">{time(b.startTime)} – {time(b.endTime)} · {minutesHuman(b.slots * 30)}</div>
        </div>
      </div>

      <div className="bkc-meta">
        <span title="Charging point"><Zap size={13} />{b.point.label} · {b.point.connectorCode} · {kw(b.point.powerKw)}</span>
        <span title="Vehicle"><Car size={13} />{b.vehicle.nickname || b.vehicle.model} · {b.vehicle.regNumber}</span>
        <span title="Charge range">{b.socStart}% → {b.status === 'COMPLETED' && b.session ? b.session.socEnd : b.socTarget}%</span>
        <span className="bkc-amount">{pay ? <>{inr(pay.amount, { decimals: 2 })} <small className="muted">{PAY_LABEL[pay.method]}</small></> : <>{inr(b.estCost, { decimals: 2 })} <small className="muted">est.</small></>}</span>
      </div>

      {b.status === 'CHECKED_IN' && <Progress b={b} />}
      {b.status === 'COMPLETED' && b.session && (
        <div className="bkc-session">
          <span><b>{kwh(b.session.energyKwh)}</b> delivered</span>
          <span><Leaf size={12} className="text-green" /> <b>{b.session.co2AvoidedKg.toFixed(1)} kg</b> CO₂ avoided</span>
          <span>Final bill <b>{inr(b.session.amount, { decimals: 2 })}</b></span>
        </div>
      )}
      {(b.status === 'CANCELLED' || b.status === 'NO_SHOW' || b.status === 'EXPIRED') && (
        <div className="bkc-note">
          {b.status === 'CANCELLED' && <span><XCircle size={13} /> Cancelled {b.cancelledAt ? dateTime(b.cancelledAt) : ''}{b.cancelReason ? ` · ${b.cancelReason}` : ''}</span>}
          {b.status === 'NO_SHOW' && <span><XCircle size={13} /> You did not check in within 15 minutes of the start. A 25 % fee was retained.</span>}
          {b.status === 'EXPIRED' && <span><Timer size={13} /> The hold was not paid in time and was released.</span>}
          {pay && pay.refundedAmount > 0 && <span className="text-green"><Undo2 size={13} /> {inr(pay.refundedAmount, { decimals: 2 })} refunded</span>}
        </div>
      )}

      <div className="bkc-actions">
        {b.status === 'HOLD' && <>
          <Button variant="primary" size="sm" icon={<CreditCard size={14} />} onClick={() => onPay(b)} data-testid="pay-now">Pay now</Button>
          <Button variant="ghost" size="sm" loading={busy} icon={<XCircle size={14} />} onClick={() => onCancel(b)}>Release</Button>
        </>}
        {b.status === 'CONFIRMED' && <>
          <Button variant={b.canCheckIn ? 'primary' : 'ghost'} size="sm" icon={<LogIn size={14} />} disabled={!b.canCheckIn} loading={busy} onClick={() => onCheckIn(b)} title={b.canCheckIn ? 'Check in now' : 'Check-in opens 15 minutes before the start time'} data-testid="check-in">Check in</Button>
          <Button variant="ghost" size="sm" icon={<QrCode size={14} />} onClick={() => onQr(b)} data-testid="show-qr">QR</Button>
          <Button variant="ghost" size="sm" icon={<CalendarPlus size={14} />} onClick={() => onCalendar(b)}>Calendar</Button>
          <Button variant="danger" size="sm" icon={<XCircle size={14} />} onClick={() => onCancel(b)} data-testid="cancel-btn">Cancel</Button>
        </>}
        {b.status === 'CHECKED_IN' && <>
          <Button variant="primary" size="sm" icon={<PlayCircle size={14} />} onClick={() => onComplete(b)} data-testid="complete-btn">Complete charge</Button>
          <Button variant="ghost" size="sm" icon={<QrCode size={14} />} onClick={() => onQr(b)}>QR</Button>
        </>}
        {b.status === 'COMPLETED' && <>
          <Button variant="ghost" size="sm" icon={<Receipt size={14} />} onClick={() => onInvoice(b)} data-testid="invoice-btn">Invoice</Button>
          {rated ? <span className="pill green"><Star size={12} fill="currentColor" />Rated</span> : <Button variant="success" size="sm" icon={<Star size={14} />} onClick={() => onRate(b)} data-testid="rate-btn">Rate this station</Button>}
        </>}
        {!live && b.status !== 'COMPLETED' && pay && <Button variant="ghost" size="sm" icon={<Receipt size={14} />} onClick={() => onInvoice(b)}>Invoice</Button>}
        {b.status === 'HOLD' || <Link className="btn link small ml-auto" to={`/station/${b.station.id}`}>Station</Link>}
      </div>
    </article>
  );
}
