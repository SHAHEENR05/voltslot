import { Star } from 'lucide-react';

/** <RatingStars value={4.2} size={14} count={237} /> ; pass onChange for an input. */
export default function RatingStars({ value = 0, size = 14, count, onChange, showValue = true }) {
  return (
    <span className="stars" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const full = value >= i - 0.25;
        const half = !full && value >= i - 0.75;
        const star = (
          <span key={i} style={{ position: 'relative', display: 'inline-flex', cursor: onChange ? 'pointer' : 'default' }} onClick={onChange ? () => onChange(i) : undefined}>
            <Star size={size} className="off" fill="currentColor" strokeWidth={0} />
            {(full || half) && <span style={{ position: 'absolute', inset: 0, width: half ? '50%' : '100%', overflow: 'hidden' }}><Star size={size} fill="currentColor" strokeWidth={0} /></span>}
          </span>
        );
        return star;
      })}
      {showValue && <span style={{ color: 'var(--text)', fontWeight: 650, fontSize: size - 1, marginLeft: 5 }}>{Number(value).toFixed(1)}</span>}
      {count !== undefined && <span className="muted" style={{ fontSize: size - 2, marginLeft: 3 }}>({count})</span>}
    </span>
  );
}
