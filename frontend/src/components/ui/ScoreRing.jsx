import { useEffect, useState } from 'react';

const colorFor = (v) => (v >= 75 ? '#34d399' : v >= 55 ? '#22d3ee' : v >= 35 ? '#fbbf24' : '#f87171');

/** Animated SVG ring 0-100. <ScoreRing value={86.4} size={64} stroke={6} label="score" color? /> */
export default function ScoreRing({ value = 0, size = 64, stroke = 6, color, label, decimals = 0, children }) {
  const [v, setV] = useState(0);
  useEffect(() => { const t = requestAnimationFrame(() => setV(value)); return () => cancelAnimationFrame(t); }, [value]);
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const col = color || colorFor(value);
  return (
    <span className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <defs><linearGradient id={`sg${size}${Math.round(value)}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={col} /><stop offset="1" stopColor="#a78bfa" /></linearGradient></defs>
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle className="ring-arc" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          stroke={`url(#sg${size}${Math.round(value)})`} strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, Math.max(0, v)) / 100)} style={{ filter: `drop-shadow(0 0 5px ${col}66)` }} />
      </svg>
      <span className="ring-label">
        {children || <><b style={{ fontSize: size * 0.3, fontWeight: 800 }}>{Number(value).toFixed(decimals)}</b>{label && <span className="faint" style={{ fontSize: Math.max(9, size * 0.14) }}>{label}</span>}</>}
      </span>
    </span>
  );
}
