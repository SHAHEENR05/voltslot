/** Semi-circle gauge. <Gauge value={79.8} max={100} label="Reliability" size={120} /> */
export default function Gauge({ value = 0, max = 100, label, size = 120, unit = '', color }) {
  const stroke = 10, r = (size - stroke) / 2, c = Math.PI * r;
  const frac = Math.min(1, Math.max(0, value / max));
  const col = color || (frac >= 0.75 ? '#34d399' : frac >= 0.5 ? '#22d3ee' : frac >= 0.3 ? '#fbbf24' : '#f87171');
  return (
    <div style={{ width: size, textAlign: 'center' }}>
      <svg width={size} height={size / 2 + stroke / 2 + 2} viewBox={`0 0 ${size} ${size / 2 + stroke / 2 + 2}`}>
        <path d={`M ${stroke / 2} ${size / 2} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${size / 2}`} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={stroke} strokeLinecap="round" />
        <path d={`M ${stroke / 2} ${size / 2} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${size / 2}`} fill="none" stroke={col} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - frac)} style={{ transition: 'stroke-dashoffset .9s cubic-bezier(.2,.7,.2,1)', filter: `drop-shadow(0 0 5px ${col}66)` }} />
      </svg>
      <div style={{ marginTop: -size * 0.27, lineHeight: 1.1 }}>
        <b style={{ fontSize: size * 0.22, fontWeight: 800 }}>{Number(value).toFixed(value % 1 ? 1 : 0)}{unit}</b>
        {label && <div className="muted xs" style={{ marginTop: 2 }}>{label}</div>}
      </div>
    </div>
  );
}
