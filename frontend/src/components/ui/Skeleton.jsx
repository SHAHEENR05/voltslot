/** <Skeleton w={120} h={14} r={8} /> ; <Skeleton.Card /> / <Skeleton.Lines n={3} /> */
export default function Skeleton({ w = '100%', h = 14, r = 8, style, className = '' }) {
  return <div className={`skeleton ${className}`} style={{ width: w, height: h, borderRadius: r, ...style }} />;
}
Skeleton.Lines = function Lines({ n = 3 }) { return <div className="col gap-8">{Array.from({ length: n }, (_, i) => <Skeleton key={i} w={`${100 - i * 12}%`} />)}</div>; };
Skeleton.Card = function SkCard({ h = 120 }) { return <div className="card"><Skeleton w="45%" h={16} /><div style={{ height: 10 }} /><Skeleton h={h} r={12} /></div>; };
