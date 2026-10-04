import { CalendarClock, MapPin, ArrowRight, AlertTriangle } from 'lucide-react';
import Button from '../ui/Button.jsx';
import CrowdingPill from '../ui/CrowdingPill.jsx';
import { inr, km, minutesHuman, whenLabel, time, dayShort } from '../../lib/format.js';
import { useClock } from '../../lib/clock.jsx';

/** 409 recovery: other slots at the same station (chips) + other stations (cards); everything rebooks in one click. */
export default function Alternatives({ message, alternatives, busy, onPickSlot, onPickStation, onWaitlist, canWaitlist }) {
  const { now } = useClock();
  const same = alternatives?.sameStation || [];
  const other = alternatives?.otherStations || [];
  return (
    <div className="bk-alt fade-up" role="alert" data-testid="alternatives">
      <div className="row gap-10 start">
        <span className="bk-alt-ico"><AlertTriangle size={18} /></span>
        <div>
          <b>{message || 'That slot was just taken.'}</b>
          <div className="muted small">Pick one of these instead - we will hold it for you straight away.</div>
        </div>
      </div>
      {same.length > 0 && (
        <div className="mt-12">
          <div className="label mb-8"><CalendarClock size={12} style={{ verticalAlign: -1 }} /> Other times at this station</div>
          <div className="row wrap gap-6">
            {same.map((o) => (
              <button key={`${o.pointId}|${o.start}`} className="chip bk-alt-chip" disabled={busy} onClick={() => onPickSlot(o)} data-testid="alt-slot">
                <b>{time(o.start)}</b><span className="muted">{dayShort(o.start)}</span><span className="faint">· {o.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {other.length > 0 && (
        <div className="mt-12">
          <div className="label mb-8"><MapPin size={12} style={{ verticalAlign: -1 }} /> Other nearby stations</div>
          <div className="col gap-8">
            {other.map((it) => (
              <div className="bk-alt-card" key={`${it.station.id}|${it.point.pointId}`} data-testid="alt-station">
                <div className="grow">
                  <div className="truncate bold">{it.station.name}</div>
                  <div className="muted small">{it.station.zone}{it.station.distanceKm != null ? ` · ${km(it.station.distanceKm)} away` : ''} · {it.point.label} {it.point.connectorCode}</div>
                  <div className="row wrap gap-8 mt-4 small">
                    <span><b>{whenLabel(it.slotStart, now)}</b></span>
                    <span className="muted">{minutesHuman(it.chargeMinutes)} · {inr(it.estimatedCost, { decimals: 0 })}</span>
                    <CrowdingPill level={it.crowdingLevel} short />
                  </div>
                </div>
                <Button size="sm" variant="primary" disabled={busy} onClick={() => onPickStation(it)}>Book<ArrowRight size={14} /></Button>
              </div>
            ))}
          </div>
        </div>
      )}
      {same.length === 0 && other.length === 0 && <div className="muted small mt-8">No alternatives found nearby. Try another time or join the waitlist.</div>}
      {canWaitlist && <div className="mt-12"><Button size="sm" variant="ghost" disabled={busy} onClick={onWaitlist}>Notify me if this slot frees up</Button></div>}
    </div>
  );
}
