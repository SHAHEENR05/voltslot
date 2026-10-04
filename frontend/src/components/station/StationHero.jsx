import { Link } from 'react-router-dom';
import { MapPin, Clock, Zap, ShieldCheck, ArrowLeft, Navigation, Building2, Plug } from 'lucide-react';
import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import RatingStars from '../ui/RatingStars.jsx';
import Gauge from '../ui/Gauge.jsx';
import CrowdingPill from '../ui/CrowdingPill.jsx';
import ConnectorBadges from '../locator/ConnectorBadges.jsx';
import { pct, inr } from '../../lib/format.js';

const hours = (s) => (s.openHour === 0 && s.closeHour === 24 ? 'Open 24 h' : `${String(s.openHour).padStart(2, '0')}:00 – ${String(s.closeHour % 24).padStart(2, '0')}:00`);

/** Sentiment split bar (positive / neutral / negative %). */
export function SentimentBar({ split }) {
  if (!split) return null;
  const parts = [['Positive', split.positivePct, 'var(--green)'], ['Neutral', split.neutralPct, 'var(--faint)'], ['Negative', split.negativePct, 'var(--red)']];
  return (
    <div>
      <div className="stackbar" role="img" aria-label={`Sentiment: ${split.positivePct}% positive, ${split.neutralPct}% neutral, ${split.negativePct}% negative`}>
        {parts.map(([l, v, c]) => <span key={l} style={{ width: `${v}%`, background: c }} title={`${l} ${v}%`} />)}
      </div>
      <div className="row between xs muted mt-4">{parts.map(([l, v, c]) => <span key={l}><span className="legend-dot" style={{ background: c, marginRight: 5 }} />{l} {v}%</span>)}</div>
    </div>
  );
}

/** Hero card: name, tier, address, hours, rating, reliability gauge, sentiment. */
export default function StationHero({ detail, onBook, bookLabel = 'Book a slot' }) {
  const s = detail.summary;
  const maps = `https://www.google.com/maps/dir/?api=1&destination=${s.latitude},${s.longitude}`;
  return (
    <div className="card hero sd-hero pad-lg fade-up">
      <Link to="/" className="btn link small sd-back"><ArrowLeft size={14} /> All chargers</Link>
      <div className="sd-hero-grid">
        <div className="sd-hero-main">
          <div className="row wrap gap-8">
            {s.tier === 'HUB' && <Badge tone="hub">Hub</Badge>}
            <span className={`pill ${s.openNow ? 'green' : 'red'}`}><span className="dot" />{s.openNow ? 'Open now' : 'Closed now'}</span>
            <CrowdingPill level={s.crowdingLevelNow} index={s.crowdingIndexNow} live />
          </div>
          <h1 className="sd-title">{s.name}</h1>
          <div className="muted row gap-6 start"><MapPin size={15} style={{ marginTop: 3, flex: 'none' }} /><span>{s.address}</span></div>
          <div className="row wrap gap-16 mt-12 small muted">
            <span className="row gap-4"><Clock size={14} />{hours(s)}</span>
            <span className="row gap-4"><Building2 size={14} />{s.operatorName}</span>
            <span className="row gap-4"><Plug size={14} /><b style={{ color: 'var(--text)' }}>{s.freeNowPoints}</b>/{s.activePoints} points free now</span>
            <span className="row gap-4"><Zap size={14} />from {inr(s.minTariff, { decimals: 0 })}/kWh</span>
            <span className="row gap-4"><ShieldCheck size={14} />{pct(detail.uptimePct, 1)} uptime</span>
          </div>
          <div className="mt-12"><ConnectorBadges connectors={s.connectors} /></div>
          <div className="row wrap gap-8 mt-16">
            <Button variant="primary" size="lg" icon={<Zap size={17} />} onClick={onBook} data-testid="book-station">{bookLabel}</Button>
            <a className="btn ghost lg" href={maps} target="_blank" rel="noreferrer"><Navigation size={16} />Directions</a>
          </div>
        </div>
        <div className="sd-hero-side">
          <div className="sd-stat"><span className="label">Rating</span><RatingStars value={s.avgRating} size={16} count={s.reviewCount} /></div>
          <div className="sd-gauge"><Gauge value={s.reliabilityScore} label="Reliability" size={132} /></div>
          <div className="sd-stat"><span className="label">Driver sentiment</span><SentimentBar split={detail.sentiment} /></div>
        </div>
      </div>
    </div>
  );
}
