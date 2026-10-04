import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import { navFor } from '../../lib/nav.js';
import { useAuth } from '../../lib/auth.jsx';
import Drawer from '../ui/Drawer.jsx';

/** Bottom tab bar for phones: first 4 items + "More" sheet. */
export default function MobileTabBar() {
  const { user } = useAuth();
  const [more, setMore] = useState(false);
  const items = navFor(user).flatMap((g) => g.items);
  const primary = items.length > 5 ? items.slice(0, 4) : items;
  const rest = items.length > 5 ? items.slice(4) : [];
  const short = (l) => l.replace('Find chargers', 'Find').replace('Trip planner', 'Trip').replace('My bookings', 'Bookings').replace(' console', '').replace('Smart reminders', 'Reminders');
  return (
    <>
      <nav className="tabbar" aria-label="Main">
        {primary.map((it) => (
          <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => (isActive ? 'active' : '')}><it.icon size={20} /><span>{short(it.label)}</span></NavLink>
        ))}
        {rest.length > 0 && <button onClick={() => setMore(true)}><MoreHorizontal size={20} /><span>More</span></button>}
      </nav>
      <Drawer open={more} title="Menu" onClose={() => setMore(false)}>
        <div className="col gap-4">
          {rest.map((it) => (
            <NavLink key={it.to} to={it.to} onClick={() => setMore(false)} className="menu-item" style={{ borderRadius: 12 }}><it.icon size={19} />{it.label}</NavLink>
          ))}
        </div>
      </Drawer>
    </>
  );
}
