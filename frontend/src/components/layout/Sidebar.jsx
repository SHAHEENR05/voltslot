import { NavLink, Link } from 'react-router-dom';
import { Zap, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { navFor } from '../../lib/nav.js';
import { useAuth } from '../../lib/auth.jsx';

export function Brand({ compact }) {
  return (
    <Link to="/" className="brand" aria-label="VoltSlot home">
      <span className="bolt"><Zap size={19} fill="currentColor" /></span>
      {!compact && <span className="word grad-text">VoltSlot</span>}
    </Link>
  );
}

/** Left sidebar (desktop). Hidden below 860px - MobileTabBar takes over. */
export default function Sidebar({ collapsed, onToggle, unread = 0 }) {
  const { user } = useAuth();
  const groups = navFor(user);
  return (
    <aside className="sidebar">
      <Brand />
      <nav className="nav" aria-label="Main">
        {groups.map((g) => (
          <div key={g.title} className="col gap-4" style={{ gap: 3 }}>
            <div className="nav-section">{g.title}</div>
            {g.items.map((it) => (
              <NavLink key={it.to} to={it.to} end={it.end} title={collapsed ? it.label : undefined} className={({ isActive }) => (isActive ? 'active' : '')}>
                <it.icon size={19} /><span>{it.label}</span>
                {it.badge === 'unread' && unread > 0 && <span className="nav-badge">{unread}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="side-foot">
        <button className="btn ghost sm block" onClick={onToggle} aria-label="Toggle sidebar">
          {collapsed ? <PanelLeftOpen size={16} /> : <><PanelLeftClose size={16} /><span>Collapse</span></>}
        </button>
      </div>
    </aside>
  );
}
