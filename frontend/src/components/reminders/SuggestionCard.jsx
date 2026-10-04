import { MapPin, Clock, Zap, Navigation, Sparkles } from 'lucide-react';
import CrowdingPill from '../ui/CrowdingPill.jsx';
import { CONNECTOR_LABEL } from '../../lib/constants.js';
import { inr, km, minutesHuman, whenLabel, time } from '../../lib/format.js';

/** The ready-made slot a reminder proposes (SuggestionDto). `now` = app clock Date. */
export default function SuggestionCard({ s, now, compact }) {
  if (!s) {
    return (
      <div className="rp-slot empty">
        <Sparkles size={18} className="text-primary" />
        <div><b>No free slot found right now</b><div className="muted small">Open the charger finder to pick one yourself.</div></div>
      </div>
    );
  }
  return (
    <div className={`rp-slot ${compact ? 'compact' : ''}`}>
      <div className="rp-slot-top">
        <div className="rp-slot-ico"><Zap size={18} fill="currentColor" /></div>
        <div className="grow">
          <div className="rp-slot-label">Suggested slot</div>
          <div className="rp-slot-station truncate" title={s.stationName}>{s.stationName}</div>
          <div className="muted small row gap-4"><MapPin size={12} />{s.zone}{s.connectorCode ? ` · ${CONNECTOR_LABEL[s.connectorCode] || s.connectorCode}` : ''}</div>
        </div>
        <CrowdingPill level={s.crowdingLevel} short live />
      </div>
      <div className="rp-slot-grid">
        <div><span className="f-label"><Clock size={11} /> Time</span><b>{whenLabel(s.slotStart, now)}</b><span className="muted xs">to {time(s.slotEnd)}</span></div>
        <div><span className="f-label">Estimate</span><b className="text-primary">{inr(s.estimatedCost)}</b><span className="muted xs">{minutesHuman(s.chargeMinutes)} · 20→80%</span></div>
        <div><span className="f-label"><Navigation size={11} /> Distance</span><b>{km(s.distanceKm)}</b><span className="muted xs">from home</span></div>
      </div>
      {!compact && s.reason && <div className="rp-slot-reason">{s.reason}</div>}
    </div>
  );
}
