import { WEIGHT_KEYS } from '../../lib/constants.js';

const pick = (b, key) => b?.[key] || (key === 'wait' ? b?.waiting : undefined);

/**
 * Animated stacked bar of the six weighted components. breakdown = { key: {score:0..1 fraction, weight:0..1 fraction, contribution: points 0..100} } (contributions sum to item.score).
 * The filled part of the bar equals the total score; the unfilled remainder is what the station lost.
 */
export default function WhyBar({ breakdown }) {
  if (!breakdown) return null;
  const rows = WEIGHT_KEYS.map((k) => ({ ...k, c: pick(breakdown, k.key) })).filter((r) => r.c);
  const total = rows.reduce((s, r) => s + r.c.contribution, 0);
  return (
    <div className="col gap-8" style={{ gap: 10 }}>
      <div className="stackbar" title={`Total ${total.toFixed(1)} / 100`}>
        {rows.map((r, i) => <span key={r.key} style={{ width: `${r.c.contribution}%`, background: r.color, animationDelay: `${i * 70}ms` }} title={`${r.label}: ${(r.c.score * 100).toFixed(0)} × ${(r.c.weight * 100).toFixed(0)}% = +${r.c.contribution.toFixed(1)}`} />)}
      </div>
      <div className="col" style={{ gap: 6 }}>
        {rows.map((r) => (
          <div className="why-row" key={r.key}>
            <span className="row gap-6"><span className="legend-dot" style={{ background: r.color }} />{r.label}</span>
            <div className="progress" style={{ height: 6 }}><span style={{ width: `${Math.round(r.c.score * 100)}%`, background: r.color }} /></div>
            <span className="right bold num" title={`${(r.c.score * 100).toFixed(0)} × ${(r.c.weight * 100).toFixed(0)}%`} style={{ color: r.color }}>+{r.c.contribution.toFixed(1)}</span>
          </div>
        ))}
      </div>
      <div className="faint xs">Each bar = component score (0–100) · points = score × weight (sums to the total). Total {total.toFixed(1)} / 100.</div>
    </div>
  );
}
