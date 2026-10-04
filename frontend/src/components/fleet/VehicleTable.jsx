import { Truck } from 'lucide-react';
import { Card, Table, EmptyState } from '../ui';
import PredictionChip from './PredictionChip.jsx';
import { relative, whenLabel, kwh } from '../../lib/format.js';
import { useClock } from '../../lib/clock.jsx';

export default function VehicleTable({ rows, loading }) {
  const { now } = useClock();
  const columns = [
    { key: 'vehicle', header: 'Vehicle', sortable: true, sortValue: (r) => r.vehicle.nickname || r.vehicle.model, render: (r) => (
      <div><div className="bold">{r.vehicle.nickname || r.vehicle.model}</div><div className="muted xs">{r.vehicle.make} {r.vehicle.model} · {r.vehicle.regNumber}</div></div>) },
    { key: 'battery', header: 'Battery', numeric: true, sortable: true, sortValue: (r) => r.vehicle.batteryKwh, render: (r) => <span>{kwh(r.vehicle.batteryKwh)}<div className="muted xs">{r.vehicle.rangeKm} km range</div></span> },
    { key: 'connector', header: 'Connectors', render: (r) => <div className="row wrap gap-4">{r.vehicle.connectorCodes.map((c) => <span key={c} className="badge">{c}</span>)}</div> },
    { key: 'lastChargeAt', header: 'Last charge', sortable: true, render: (r) => (r.lastChargeAt ? relative(r.lastChargeAt, now) : '–') },
    { key: 'nextDueAt', header: 'Next due', sortable: true, render: (r) => (r.nextDueAt ? <span>{whenLabel(r.nextDueAt, now)}<div className="muted xs">{relative(r.nextDueAt, now)}</div></span> : <span className="muted">–</span>) },
    { key: 'predictionState', header: 'Prediction', sortable: true, render: (r) => <PredictionChip state={r.predictionState} /> },
    { key: 'upcoming', header: 'Upcoming booking', render: (r) => (r.upcomingBookingCode
      ? <div><div className="bold">{whenLabel(r.upcomingStart, now)}</div><div className="muted xs">{r.upcomingBookingCode} · {r.upcomingStation}</div></div>
      : <span className="muted">None booked</span>) },
  ];
  return (
    <Card title="Vehicles" subtitle="Predicted recharge dates and next booking per vehicle" icon={<Truck size={16} />}>
      <Table columns={columns} rows={(rows || []).map((r) => ({ ...r, id: r.vehicle.id }))} loading={loading} empty={<EmptyState icon={<Truck size={26} />} title="No vehicles in this fleet" text="Vehicles linked to your fleet will appear here." />} />
    </Card>
  );
}
