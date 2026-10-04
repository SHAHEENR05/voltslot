import { QRCodeSVG } from 'qrcode.react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import { day, time } from '../../lib/format.js';

/** Big QR for the charger scanner (value = booking.qrPayload). */
export default function QrModal({ booking, onClose }) {
  return (
    <Modal open={!!booking} title="Check-in QR" size="sm" onClose={onClose} footer={<Button variant="ghost" onClick={onClose}>Close</Button>}>
      {booking && (
        <div className="bkq" data-testid="qr-modal">
          <div className="bk-qr big"><QRCodeSVG value={booking.qrPayload} size={236} bgColor="#ffffff" fgColor="#0b1220" level="M" includeMargin /></div>
          <div className="bk-code mono">{booking.bookingCode}</div>
          <div className="bold mt-4">{booking.station.name}</div>
          <div className="muted small">{booking.point.label} · {day(booking.startTime)}, {time(booking.startTime)} – {time(booking.endTime)}</div>
          <p className="muted small mt-12">Scan this at the charger. Check-in works from 15 minutes before to 15 minutes after the start time.</p>
        </div>
      )}
    </Modal>
  );
}
