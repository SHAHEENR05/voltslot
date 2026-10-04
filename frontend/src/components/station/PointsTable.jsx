import { Check, X } from 'lucide-react';
import Table from '../ui/Table.jsx';
import { kw, inr } from '../../lib/format.js';
import { CONNECTOR_LABEL } from '../../lib/constants.js';
import { isCompatible, acceptedKw } from '../booking/bookingUtils.js';

const STATUS = { ACTIVE: ['green', 'Active'], MAINTENANCE: ['amber', 'Maintenance'], OFFLINE: ['red', 'Offline'], INACTIVE: ['red', 'Inactive'] };

/** Connector / point table (house table style via <Table>). When a vehicle is selected a "Your vehicle" column shows compatibility. */
export default function PointsTable({ points, vehicle }) {
  const cols = [
    { key: 'label', header: 'Point', render: (p) => <b>{p.label}</b> },
    { key: 'connectorCode', header: 'Connector', render: (p) => CONNECTOR_LABEL[p.connectorCode] || p.connectorName },
    { key: 'currentType', header: 'Current', render: (p) => <span className={`conn-badge ${p.currentType === 'DC' ? 'dc' : 'ac'}`}>{p.currentType}</span> },
    { key: 'powerKw', header: 'Power', numeric: true, render: (p) => kw(p.powerKw) },
    { key: 'tariffPerKwh', header: 'Tariff / kWh', numeric: true, render: (p) => inr(p.tariffPerKwh, { decimals: 2 }) },
    { key: 'status', header: 'Status', render: (p) => { const [t, l] = STATUS[p.status] || ['grey', p.status]; return <span className={`pill ${t}`}><span className="dot" />{l}</span>; } },
  ];
  if (vehicle) {
    cols.push({
      key: 'compat', header: 'Fits', render: (p) => (isCompatible(vehicle, p)
        ? <span className="text-green row gap-4"><Check size={14} />{kw(acceptedKw(vehicle, p))}</span>
        : <span className="text-red row gap-4"><X size={14} />No</span>),
    });
  }
  return <Table columns={cols} rows={points} compact />;
}
