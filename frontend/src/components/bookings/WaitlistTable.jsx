import { Link } from 'react-router-dom';
import { Hourglass, X, CreditCard } from 'lucide-react';
import Table from '../ui/Table.jsx';
import Button from '../ui/Button.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import { dateTimeShort, dateTime, minutesHuman } from '../../lib/format.js';

const STATUS = { WAITING: ['amber', 'Waiting'], PROMOTED: ['green', 'Slot offered'], EXPIRED: ['grey', 'Expired'], CANCELLED: ['grey', 'Cancelled'] };

/** "Waitlist" tab: entries from GET /waitlist with leave / pay-now actions. */
export default function WaitlistTable({ rows, loading, busyId, onCancel, onPay }) {
  const cols = [
    { key: 'station', header: 'Station', render: (w) => <Link to={`/station/${w.station.id}`}><b>{w.station.name}</b></Link> },
    { key: 'vehicleLabel', header: 'Vehicle' },
    { key: 'desiredStart', header: 'Wanted slot', render: (w) => dateTimeShort(w.desiredStart) },
    { key: 'slots', header: 'Duration', numeric: true, render: (w) => minutesHuman(w.slots * 30) },
    { key: 'status', header: 'Status', render: (w) => { const [t, l] = STATUS[w.status] || ['grey', w.status]; return <span className={`pill ${t}`}><span className="dot" />{l}</span>; } },
    { key: 'createdAt', header: 'Joined', render: (w) => dateTime(w.createdAt) },
    { key: 'act', header: 'Action', render: (w) => (
      <span className="row gap-6">
        {w.status === 'PROMOTED' && w.promotedBookingId && <Button size="sm" variant="primary" icon={<CreditCard size={13} />} loading={busyId === `w${w.id}`} onClick={() => onPay(w)}>Pay now</Button>}
        {w.status === 'WAITING' && <Button size="sm" variant="ghost" icon={<X size={13} />} loading={busyId === `w${w.id}`} onClick={() => onCancel(w)} data-testid="leave-waitlist">Leave</Button>}
      </span>
    ) },
  ];
  return (
    <Table columns={cols} rows={rows} loading={loading} defaultSort={null}
      empty={<EmptyState icon={<Hourglass size={26} />} title="You are not on any waiting list" text="When a slot you want is booked, choose it on the station page and tap “Join waitlist”. We will hold it for you if someone cancels." action={<Link className="btn primary" to="/">Find chargers</Link>} />} />
  );
}
