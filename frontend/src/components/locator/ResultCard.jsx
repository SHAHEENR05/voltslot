import { useState } from 'react';
import { Check, ChevronDown, Navigation, Clock, Zap, Wallet, Sparkles, Star, BadgeIndianRupee, Users, Rocket, MapPin } from 'lucide-react';
import ScoreRing from '../ui/ScoreRing.jsx';
import CrowdingPill from '../ui/CrowdingPill.jsx';
import Button from '../ui/Button.jsx';
import Badge from '../ui/Badge.jsx';
import WhyBar from './WhyBar.jsx';
import StationQuickPanel from './StationQuickPanel.jsx';
import { inr, km, minutesHuman, time, whenLabel } from '../../lib/format.js';
import { useClock } from '../../lib/clock.jsx';

const TAGS = {
  'Best overall': { cls: 'best', icon: Sparkles }, Fastest: { cls: 'fast', icon: Rocket }, Cheapest: { cls: 'cheap', icon: BadgeIndianRupee },
  Quietest: { cls: 'quiet', icon: Users }, Nearest: { cls: 'near', icon: MapPin },
};

export default function ResultCard({ item, selected, onSelect, onBook, onOpen, now }) {
  const [why, setWhy] = useState(false);
  const s = item.station;
  const clock = useClock();
  const wait = item.waitMinutes;
  return (
    <div className={`card rec-card hoverable fade-up ${selected ? 'selected' : ''}`} onClick={() => onSelect(item)} data-testid="rec-card">
      <div className="row start gap-12">
        <span className="rank">{item.rank}</span>
        <div className="grow">
          <div className="row gap-8"><h3 className="truncate" style={{ fontSize: 15 }}>{s.name}</h3>{s.tier === 'HUB' && <Badge tone="hub">Hub</Badge>}</div>
          <div className="muted small truncate">{s.zone} · {s.address}</div>
          <div className="row wrap gap-6 mt-8">
            <CrowdingPill level={item.crowdingLevel} index={item.crowdingIndex} live />
            {item.tags?.map((t) => { const T = TAGS[t] || { cls: 'quiet', icon: Star }; return <span key={t} className={`tag ${T.cls}`}><T.icon size={11} />{t}</span>; })}
          </div>
        </div>
        <ScoreRing value={item.score} size={58} stroke={6} label="score" />
      </div>

      <div className="facts mt-12" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <div className="fact"><div className="f-label">Distance</div><div className="f-val">{km(s.distanceKm)}</div><div className="f-sub">{item.etaMinutes} min drive</div></div>
        <div className="fact"><div className="f-label">Slot</div><div className="f-val">{time(item.slotStart)}</div><div className="f-sub" style={{ color: wait === 0 ? 'var(--green)' : undefined }}>{wait === 0 ? 'No wait' : `+${minutesHuman(wait)} wait`}</div></div>
        <div className="fact"><div className="f-label">Charge</div><div className="f-val">{minutesHuman(item.chargeMinutes)}</div><div className="f-sub">{item.point.powerKw} kW {item.point.connectorCode}</div></div>
        <div className="fact"><div className="f-label">Cost</div><div className="f-val">{inr(item.estimatedCost, { decimals: 0 })}</div><div className="f-sub">₹{Number(item.effectiveTariff).toFixed(1)}/kWh</div></div>
      </div>

      {item.reasons?.length > 0 && (
        <ul className="reasons mt-12">{item.reasons.slice(0, 4).map((r, i) => <li key={i}><Check size={14} />{r}</li>)}</ul>
      )}

      <div className="row between mt-12">
        <button className="btn link small" onClick={(e) => { e.stopPropagation(); setWhy((w) => !w); }} aria-expanded={why}>
          Why this score? <ChevronDown size={14} style={{ transform: why ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
        </button>
        <Button variant="primary" size="sm" icon={<Zap size={14} />} onClick={(e) => { e.stopPropagation(); onBook(item); }}>Book {whenLabel(item.slotStart, clock.now).split(' ')[0] === 'Today' ? time(item.slotStart) : whenLabel(item.slotStart, clock.now)}</Button>
      </div>
      {why && <div className="mt-12 fade-in" onClick={(e) => e.stopPropagation()}><WhyBar breakdown={item.breakdown} /></div>}
      {selected && <div onClick={(e) => e.stopPropagation()}><StationQuickPanel stationId={s.id} summary={s} onOpen={() => onOpen(s.id)} /></div>}
    </div>
  );
}
