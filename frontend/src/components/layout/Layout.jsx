import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';
import MobileTabBar from './MobileTabBar.jsx';
import ReminderPopup from '../reminders/ReminderPopup.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { api } from '../../lib/api.js';
import { usePolling } from '../../lib/hooks.js';

/** App shell: sidebar + topbar + routed content (+ bottom tab bar on phones). Unread count polled every 30 s. */
export default function Layout() {
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('chargeiq.sidebar') === '1'; } catch { return false; } });
  const [unread, setUnread] = useState(0);
  const { user } = useAuth();
  const loc = useLocation();
  useEffect(() => { try { localStorage.setItem('chargeiq.sidebar', collapsed ? '1' : '0'); } catch { /* */ } }, [collapsed]);
  usePolling(() => { if (user) api.get('/notifications/unread-count').then((r) => setUnread(r.count || 0)).catch(() => {}); }, 30000, { enabled: !!user });
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  return (
    <div className={`shell ${collapsed ? 'collapsed' : ''}`}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} unread={unread} />
      <div className="main">
        <Topbar unread={unread} setUnread={setUnread} />
        <main className="content"><Outlet /></main>
      </div>
      <MobileTabBar />
      {user && <ReminderPopup />}
    </div>
  );
}
