import { Zap } from 'lucide-react';

/** Animated battery with a pulsing glow - the hero of the reminder popup. tone: 'primary' | 'amber' | 'red'. level 0-100 (visual only). */
export default function BatteryGlow({ level = 24, tone = 'primary', size = 'lg' }) {
  return (
    <div className={`rp-battery ${tone} ${size}`} style={{ '--lvl': `${Math.max(6, Math.min(100, level))}%` }} aria-hidden="true">
      <span className="rp-ring r1" /><span className="rp-ring r2" />
      <span className="rp-glow" />
      <div className="rp-bat-wrap">
        <div className="rp-bat-body">
          <div className="rp-bat-fill"><i /></div>
          <div className="rp-bat-cells"><b /><b /><b /><b /></div>
          <Zap className="rp-bolt" size={size === 'lg' ? 34 : 22} fill="currentColor" strokeWidth={1.5} />
        </div>
        <div className="rp-bat-cap" />
      </div>
      <span className="rp-spark s1" /><span className="rp-spark s2" /><span className="rp-spark s3" />
    </div>
  );
}
