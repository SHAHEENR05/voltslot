import { BOOKING_STATUS } from '../../lib/constants.js';

/** Booking status pill (HOLD, CONFIRMED, CHECKED_IN, COMPLETED, CANCELLED, NO_SHOW, EXPIRED). */
export default function StatusChip({ status }) {
  const s = BOOKING_STATUS[status] || { cls: 'grey', label: status };
  return <span className={`pill ${s.cls}`}><span className="dot" />{s.label}</span>;
}
