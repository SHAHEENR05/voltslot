/** Presentational countdown ring. value = remaining seconds, total = total seconds. Turns red under 60 s. */
export default function CountdownRing({ value = 0, total = 300, size = 120, stroke = 8, label }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const frac = total ? Math.max(0, Math.min(1, value / total)) : 0;
  const mm = String(Math.floor(Math.max(0, value) / 60)).padStart(2, '0'), ss = String(Math.floor(Math.max(0, value) % 60)).padStart(2, '0');
  const col = value < 60 ? '#f87171' : value < 120 ? '#fbbf24' : '#22d3ee';
  return (
    <span className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" stroke={col}
          strokeDasharray={c} strokeDashoffset={c * (1 - frac)} style={{ transition: 'stroke-dashoffset 1s linear, stroke .3s', filter: `drop-shadow(0 0 6px ${col}88)` }} />
      </svg>
      <span className="ring-label"><b style={{ fontSize: size * 0.26, fontWeight: 800 }}>{mm}:{ss}</b>{label && <span className="faint" style={{ fontSize: 11 }}>{label}</span>}</span>
    </span>
  );
}
