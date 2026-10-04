import { Zap, Clock, Leaf, Route } from 'lucide-react';
import Skeleton from '../ui/Skeleton.jsx';
import { inr, kwh, kw, minutesHuman, num, parseLocal, time, toIso } from '../../lib/format.js';
import { BAND } from './bookingUtils.js';

/** Live estimate from POST /bookings/estimate (EstimateResponse). */
export default function EstimateCard({ est, loading, error, startIso }) {
  if (error) return <div className="form-error-banner" role="alert">{error.message}</div>;
  if (!est && loading) return <div className="bk-est"><Skeleton h={22} w="40%" /><div style={{ height: 12 }} /><div className="bk-est-grid">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={56} r={12} />)}</div></div>;
  if (!est) return <div className="bk-est empty muted small">Pick a vehicle and a compatible point to see the estimate.</div>;
  const band = BAND[est.bandName] || { label: est.bandName, tone: 'primary' };
  const start = parseLocal(startIso);
  const endIso = start ? toIso(new Date(start.getTime() + est.slots * 30 * 60000)) : null;
  return (
    <div className={`bk-est ${loading ? 'is-loading' : ''}`} data-testid="estimate">
      <div className="row between wrap gap-8">
        <div>
          <div className="bk-est-cost">{inr(est.estimatedCost, { decimals: 2 })}</div>
          <div className="muted small">Estimated cost · {inr(est.effectiveTariff, { decimals: 2 })}/kWh</div>
        </div>
        <span className={`badge ${band.tone}`} title={`Pricing band multiplier ×${est.multiplier}`}>{band.label} · ×{num(est.multiplier, 2)}</span>
      </div>
      <div className="bk-est-grid mt-12">
        <div className="fact"><div className="f-label"><Zap size={11} /> Energy</div><div className="f-val">{kwh(est.energyKwh)}</div><div className="f-sub">at {kw(est.acceptedKw)}</div></div>
        <div className="fact"><div className="f-label"><Clock size={11} /> Duration</div><div className="f-val">{minutesHuman(est.durationMinutes)}</div><div className="f-sub">{est.slots} slot{est.slots > 1 ? 's' : ''}{endIso ? ` · ends ${time(endIso)}` : ''}</div></div>
        <div className="fact"><div className="f-label"><Route size={11} /> Range added</div><div className="f-val">{num(est.kmAdded, 0)} km</div><div className="f-sub">approx.</div></div>
        <div className="fact"><div className="f-label"><Leaf size={11} /> CO₂ avoided</div><div className="f-val">{num(est.co2AvoidedKg, 1)} kg</div><div className="f-sub">tailpipe</div></div>
      </div>
    </div>
  );
}
