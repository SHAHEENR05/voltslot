import { ArrowRight, Clock, ShieldCheck, Plug } from 'lucide-react';
import { useFetch } from '../../lib/hooks.js';
import Chip from '../ui/Chip.jsx';
import RatingStars from '../ui/RatingStars.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import Button from '../ui/Button.jsx';
import ConnectorBadges from './ConnectorBadges.jsx';

/** Inline station panel under the selected card: rating, hours, connectors, amenities (lazy-loads station detail). */
export default function StationQuickPanel({ stationId, summary, onOpen }) {
  const { data, loading } = useFetch(`/stations/${stationId}`, { auth: false });
  const s = summary;
  return (
    <div className="mt-12 fade-in" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
      <div className="row between wrap">
        <RatingStars value={s.avgRating} count={s.reviewCount} />
        <span className="small muted row gap-4"><Clock size={13} />{s.openHour === 0 && s.closeHour === 24 ? 'Open 24 h' : `${String(s.openHour).padStart(2, '0')}:00 – ${String(s.closeHour % 24).padStart(2, '0')}:00`}</span>
        <span className="small muted row gap-4"><ShieldCheck size={13} />Reliability {Math.round(s.reliabilityScore)}</span>
      </div>
      <div className="mt-8"><ConnectorBadges connectors={s.connectors} /></div>
      <div className="row wrap gap-6 mt-8">
        {loading && <Skeleton w={200} h={22} r={11} />}
        {data?.amenities?.map((a) => <Chip key={a.id} size="sm">{a.name}</Chip>)}
      </div>
      <div className="row between mt-12">
        <span className="small muted"><Plug size={13} style={{ verticalAlign: -2 }} /> {s.freeNowPoints}/{s.activePoints} points free now</span>
        <Button size="sm" variant="ghost" onClick={onOpen}>Station details <ArrowRight size={14} /></Button>
      </div>
    </div>
  );
}
