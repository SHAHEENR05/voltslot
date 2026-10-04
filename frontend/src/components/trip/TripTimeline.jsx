import { Link } from 'react-router-dom';
import { Car, Zap, Flag, CircleDot } from 'lucide-react';
import { Button, CrowdingPill } from '../ui';
import { CONNECTOR_LABEL } from '../../lib/constants.js';
import { inr, km, minutesHuman, time, dateTimeShort } from '../../lib/format.js';

/** Vertical timeline of a TripResponse: depart -> DRIVE / CHARGE legs -> arrive. */
export default function TripTimeline({ trip, originLabel, destLabel, startSoc, onBook }) {
  let stop = 0;
  return (
    <ol className="tl">
      <li className="tl-item start">
        <span className="tl-dot"><CircleDot size={14} /></span>
        <div className="tl-body">
          <div className="tl-head"><b>Depart {originLabel}</b><span className="tl-time">{time(trip.departAt)}</span></div>
          <div className="muted small">Battery {startSoc}%</div>
        </div>
      </li>
      {trip.legs.map((l, i) => {
        if (l.type === 'DRIVE') {
          return (
            <li key={i} className="tl-item drive">
              <span className="tl-dot"><Car size={14} /></span>
              <div className="tl-body">
                <div className="tl-head"><b>Drive {km(l.distanceKm)} · {minutesHuman(l.durationMin)}</b><span className="tl-time">{time(l.startTime)}–{time(l.endTime)}</span></div>
                <div className="muted small">Battery {l.socStart}% → {l.socEnd}%</div>
              </div>
            </li>
          );
        }
        stop += 1;
        return (
          <li key={i} className="tl-item charge">
            <span className="tl-dot"><Zap size={14} fill="currentColor" /></span>
            <div className="tl-body">
              <div className="tl-head"><b><span className="tl-stop">{stop}</span>Charge at {l.station?.name}</b><span className="tl-time">{time(l.startTime)}–{time(l.endTime)}</span></div>
              <div className="muted small">{l.station?.zone} · {l.pointLabel} {CONNECTOR_LABEL[l.connectorCode] || l.connectorCode}</div>
              <div className="tl-charge">
                <span className="chip sm active">{l.socStart}% → {l.socEnd}%</span>
                <span className="chip sm">{minutesHuman(l.durationMin)}</span>
                <span className="chip sm text-primary">{inr(l.estimatedCost)}</span>
                <CrowdingPill level={l.crowdingLevel} short live />
              </div>
              <div className="row gap-8 mt-8 wrap">
                <Button size="sm" onClick={() => onBook(l)}>Book {time(l.slotStart)} slot</Button>
                {l.station && <Link className="btn sm ghost" to={`/station/${l.station.id}`}>View station</Link>}
              </div>
            </div>
          </li>
        );
      })}
      {trip.feasible && trip.arriveAt && (
        <li className="tl-item end">
          <span className="tl-dot"><Flag size={14} /></span>
          <div className="tl-body">
            <div className="tl-head"><b>Arrive {destLabel}</b><span className="tl-time">{time(trip.arriveAt)}</span></div>
            <div className="muted small">Battery about {trip.arrivalSocPercent}% · {dateTimeShort(trip.arriveAt)}</div>
          </div>
        </li>
      )}
    </ol>
  );
}
