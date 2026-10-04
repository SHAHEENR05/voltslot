import { Car, Bike, Truck, CarTaxiFront, Pencil, Trash2, Battery, Gauge, Zap, Plug, Route } from 'lucide-react';
import { PredictionMini } from '../reminders/PredictionCard.jsx';
import { CONNECTOR_LABEL } from '../../lib/constants.js';

export const CATEGORY = {
  CAR: { icon: Car, label: 'Car', grad: 'linear-gradient(135deg, rgba(34,211,238,.28), rgba(167,139,250,.22))', color: '#22d3ee' },
  TWO_WHEELER: { icon: Bike, label: 'Two-wheeler', grad: 'linear-gradient(135deg, rgba(52,211,153,.26), rgba(34,211,238,.18))', color: '#34d399' },
  THREE_WHEELER: { icon: CarTaxiFront, label: 'Three-wheeler', grad: 'linear-gradient(135deg, rgba(251,191,36,.26), rgba(244,114,182,.16))', color: '#fbbf24' },
  LCV: { icon: Truck, label: 'Light commercial', grad: 'linear-gradient(135deg, rgba(167,139,250,.28), rgba(244,114,182,.2))', color: '#a78bfa' },
};

/** Garage vehicle card: gradient banner with category icon, spec chips, prediction mini card, edit / delete. */
export default function VehicleCard({ v, prediction, now, onEdit, onDelete }) {
  const cat = CATEGORY[v.category] || CATEGORY.CAR;
  const Icon = cat.icon;
  return (
    <div className="card veh-card hoverable">
      <div className="veh-banner" style={{ background: cat.grad }}>
        <div className="veh-ico" style={{ color: cat.color }}><Icon size={30} /></div>
        <div className="grow">
          <div className="veh-make">{v.make}</div>
          <div className="veh-model truncate">{v.model} <span className="muted">{v.variant}</span></div>
        </div>
        <span className="badge" style={{ background: 'rgba(255,255,255,.08)' }}>{cat.label}</span>
      </div>
      <div className="veh-body">
        <div className="row between gap-8">
          <div className="min0">
            <div className="veh-nick truncate">{v.nickname || `${v.make} ${v.model}`}</div>
            <div className="veh-plate">{v.regNumber}</div>
          </div>
          <div className="row gap-4">
            <button className="btn ghost icon sm" onClick={() => onEdit(v)} aria-label={`Edit ${v.nickname || v.model}`} title="Edit"><Pencil size={14} /></button>
            <button className="btn danger icon sm" onClick={() => onDelete(v)} aria-label={`Delete ${v.nickname || v.model}`} title="Delete"><Trash2 size={14} /></button>
          </div>
        </div>
        <div className="row wrap gap-6 mt-12">
          <span className="chip sm"><Battery size={12} />{v.batteryKwh} kWh</span>
          <span className="chip sm"><Route size={12} />{v.rangeKm} km range</span>
          {v.dcMaxKw > 0 && <span className="chip sm"><Zap size={12} />DC {v.dcMaxKw} kW</span>}
          {v.acMaxKw > 0 && <span className="chip sm"><Gauge size={12} />AC {v.acMaxKw} kW</span>}
        </div>
        <div className="row wrap gap-6 mt-8">
          {(v.connectorCodes || []).map((c) => <span key={c} className={`conn-badge ${c === 'TYPE2' ? 'ac' : 'dc'}`}><Plug size={10} />{CONNECTOR_LABEL[c] || c}</span>)}
          <span className="muted small ml-auto">~{v.avgDailyKm} km/day · {v.kmPerKwh} km/kWh</span>
        </div>
        <PredictionMini p={prediction} now={now} />
      </div>
    </div>
  );
}
