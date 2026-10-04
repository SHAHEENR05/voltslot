import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, CalendarPlus, ListChecks, Navigation } from 'lucide-react';
import { BookingSummary } from './HoldStep.jsx';
import { addToCalendar } from './ics.js';
import { PAY_LABEL } from '../bookings/payLabels.js';
import { inr } from '../../lib/format.js';

/** Step 4: success - animated check, booking code, QR, calendar. */
export default function DoneStep({ booking, onView }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { try { navigator.clipboard?.writeText(booking.bookingCode); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* */ } };
  const maps = `https://www.google.com/maps/dir/?api=1&destination=${booking.station.latitude},${booking.station.longitude}`;
  return (
    <div className="col gap-16 bk-done" data-testid="done-step">
      <div className="bk-done-hero">
        <svg className="bk-check" viewBox="0 0 80 80" width="84" height="84" aria-hidden="true">
          <circle className="bk-check-ring" cx="40" cy="40" r="34" fill="none" strokeWidth="5" />
          <path className="bk-check-tick" d="M25 41.5 L36 52 L56 29" fill="none" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h2>Booking confirmed</h2>
        <p className="muted">Paid {inr(booking.payment?.amount ?? booking.estCost, { decimals: 2 })} via {PAY_LABEL[booking.payment?.method] || 'wallet'} · invoice {booking.payment?.invoiceNo}</p>
      </div>
      <div className="bk-ticket">
        <div className="bk-qr"><QRCodeSVG value={booking.qrPayload} size={148} bgColor="#ffffff" fgColor="#0b1220" level="M" includeMargin /></div>
        <div className="bk-ticket-info">
          <span className="label">Booking code</span>
          <div className="bk-code mono" data-testid="booking-code">{booking.bookingCode}</div>
          <button className="btn ghost sm" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy code'}</button>
          <p className="muted small mt-8">Show this QR at the charger. Check-in opens 15 minutes before your start time.</p>
        </div>
      </div>
      <BookingSummary b={booking} />
      <div className="row wrap gap-8">
        <button className="btn ghost" onClick={() => addToCalendar(booking)}><CalendarPlus size={16} />Add to calendar</button>
        <a className="btn ghost" href={maps} target="_blank" rel="noreferrer"><Navigation size={16} />Directions</a>
        <button className="btn primary ml-auto" onClick={onView}><ListChecks size={16} />View booking</button>
      </div>
    </div>
  );
}
