import { Link } from 'react-router-dom';
import { Zap, Gauge, BellRing, CalendarClock } from 'lucide-react';

const FEATURES = [
  { icon: Gauge, color: 'var(--primary)', bg: 'var(--primary-soft)', text: 'Demand-aware recommendations' },
  { icon: BellRing, color: 'var(--violet)', bg: 'var(--violet-soft)', text: 'Predictive recharge reminders' },
  { icon: CalendarClock, color: 'var(--green)', bg: 'var(--green-soft)', text: 'Live slot booking' },
];

/** Split layout used by Login + Register: animated hero left, form right. */
export default function AuthShell({ children }) {
  return (
    <div className="auth-split">
      <section className="auth-hero">
        <div className="hero-orb" />
        <Link to="/" className="brand" style={{ padding: 0, fontSize: 24 }}>
          <span className="bolt"><Zap size={20} fill="currentColor" /></span><span className="grad-text">VoltSlot</span>
        </Link>
        <div className="fade-up">
          <h1>Charge <span className="grad-text">smarter</span>,<br />not harder.</h1>
          <p className="muted mt-16" style={{ fontSize: 16, maxWidth: 460 }}>Find the right charger at the right time – ranked by distance, wait, crowding, price and reliability.</p>
        </div>
        <div className="col gap-12 hero-features stagger">
          {FEATURES.map((f) => (
            <div className="hero-feature" key={f.text}>
              <span className="f-ico" style={{ background: f.bg, color: f.color }}><f.icon size={19} /></span>
              <b>{f.text}</b>
            </div>
          ))}
        </div>
      </section>
      <section className="auth-form-side">
        <div className="auth-card fade-up">{children}</div>
      </section>
    </div>
  );
}
