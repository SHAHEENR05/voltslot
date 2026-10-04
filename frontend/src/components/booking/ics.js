import { parseLocal } from '../../lib/format.js';
import { downloadText } from '../../lib/api.js';

const pad = (n) => String(n).padStart(2, '0');
const stamp = (s) => { const d = parseLocal(s); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`; };
const esc = (t) => String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

/** Builds an .ics (floating local time = IST wall clock, no time-zone conversion) for a BookingDto and downloads it. */
export function addToCalendar(b) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//VoltSlot//Booking//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${b.bookingCode}@voltslot.in`,
    `DTSTAMP:${stamp(b.createdAt || b.startTime)}`,
    `DTSTART:${stamp(b.startTime)}`, `DTEND:${stamp(b.endTime)}`,
    `SUMMARY:${esc(`EV charging at ${b.station?.name}`)}`,
    `LOCATION:${esc(`${b.station?.name}, ${b.station?.address || ''}`)}`,
    `DESCRIPTION:${esc(`VoltSlot booking ${b.bookingCode}\nPoint ${b.point?.label} (${b.point?.connectorCode}, ${b.point?.powerKw} kW)\nVehicle ${b.vehicle?.regNumber}\nCharge ${b.socStart}% to ${b.socTarget}%\nCheck in from 15 min before the start time.`)}`,
    `GEO:${b.station?.latitude};${b.station?.longitude}`,
    'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:Your charging slot starts in 30 minutes', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  downloadText(lines.join('\r\n'), `chargeiq-${b.bookingCode}.ics`, 'text/calendar');
}
