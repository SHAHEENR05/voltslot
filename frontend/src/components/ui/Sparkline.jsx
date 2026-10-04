/** Tiny SVG sparkline. <Sparkline data={[1,3,2]} color="#22d3ee" width={90} height={28} fill /> */
export default function Sparkline({ data = [], color = '#22d3ee', width = 90, height = 28, fill = true, strokeWidth = 1.8 }) {
  const d = data.map(Number).filter((x) => !Number.isNaN(x));
  if (d.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...d), max = Math.max(...d), span = max - min || 1, pad = 2;
  const pts = d.map((v, i) => [pad + (i / (d.length - 1)) * (width - pad * 2), height - pad - ((v - min) / span) * (height - pad * 2)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const id = `spk${Math.abs(Math.round(d.reduce((a, b) => a + b, 0) * 100)) % 99999}${d.length}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      {fill && <><defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".35" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        <path d={`${line} L${pts[pts.length - 1][0]} ${height} L${pts[0][0]} ${height} Z`} fill={`url(#${id})`} /></>}
      <path d={line} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.4" fill={color} />
    </svg>
  );
}
