import { MapPin, Plug, Navigation } from 'lucide-react';
import Badge from '../ui/Badge.jsx';
import RatingStars from '../ui/RatingStars.jsx';
import CrowdingPill from '../ui/CrowdingPill.jsx';
import ConnectorBadges from './ConnectorBadges.jsx';
import { km, inr } from '../../lib/format.js';

/** Browse-all card for StationSummaryDto. onClick -> station page, onLocate -> fly the map there. */
export default function StationCard({ s, active, onClick, onLocate }) {
  return (
    <div className={`card station-card hoverable clickable fade-up ${active ? 'selected' : ''}`} onClick={onClick} data-testid="station-card">
      <div className="row between start gap-12">
        <div className="grow">
          <div className="row gap-8"><h3 className="truncate" style={{ fontSize: 15 }}>{s.name}</h3>{s.tier === 'HUB' && <Badge tone="hub">Hub</Badge>}</div>
          <div className="muted small truncate">{s.zone} · {s.city}{s.distanceKm != null && ` · ${km(s.distanceKm)}`}</div>
        </div>
        <button className="btn ghost icon sm" onClick={(e) => { e.stopPropagation(); onLocate?.(s); }} aria-label="Show on map" title="Show on map"><MapPin size={15} /></button>
      </div>
      <div className="row between wrap mt-8">
        <RatingStars value={s.avgRating} count={s.reviewCount} />
        <span className="small muted">Reliability <b style={{ color: s.reliabilityScore >= 75 ? 'var(--green)' : s.reliabilityScore >= 55 ? 'var(--amber)' : 'var(--red)' }}>{Math.round(s.reliabilityScore)}</b></span>
      </div>
      <div className="mt-8"><ConnectorBadges connectors={s.connectors} /></div>
      <div className="row between wrap mt-12">
        <span className="row gap-8"><CrowdingPill level={s.crowdingLevelNow} index={s.crowdingIndexNow} live />{!s.openNow && <span className="pill red">Closed</span>}</span>
        <span className="small muted"><Plug size={13} style={{ verticalAlign: -2 }} /> <b style={{ color: 'var(--text)' }}>{s.freeNowPoints}</b>/{s.activePoints} free · from {inr(s.minTariff, { decimals: 0 })}/kWh</span>
      </div>
    </div>
  );
}
