import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Bell, Wallet, Clock, LogOut, UserCircle, KeyRound, CheckCheck, MapPin } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useClock } from '../../lib/clock.jsx';
import { useDebounced, usePolling } from '../../lib/hooks.js';
import { inr, initials, relative } from '../../lib/format.js';
import Tooltip from '../ui/Tooltip.jsx';
import Button from '../ui/Button.jsx';
import { Brand } from './Sidebar.jsx';

function useOutside(ref, cb) {
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) cb(); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, [ref, cb]);
}

function GlobalSearch() {
  const [q, setQ] = useState(''); const [res, setRes] = useState([]); const [open, setOpen] = useState(false);
  const dq = useDebounced(q, 250); const nav = useNavigate(); const ref = useRef(null);
  useOutside(ref, () => setOpen(false));
  useEffect(() => {
    if (dq.trim().length < 2) { setRes([]); return; }
    let live = true;
    api.get('/stations', { q: dq, size: 6 }, { auth: false }).then((r) => live && setRes(r.content || [])).catch(() => {});
    return () => { live = false; };
  }, [dq]);
  return (
    <div className="search" ref={ref}>
      <div className="input-wrap"><Search size={16} /><input className="input" placeholder="Search stations, zones…" value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} aria-label="Search stations" /></div>
      {open && q.trim().length >= 2 && (
        <div className="pop-menu search-results">
          {res.length === 0 && <div className="muted small" style={{ padding: 14 }}>No stations match “{q}”.</div>}
          {res.map((s) => (
            <button key={s.id} className="menu-item" onClick={() => { setOpen(false); setQ(''); nav(`/station/${s.id}`); }}>
              <MapPin size={16} className="text-primary" /><div><div style={{ fontWeight: 600 }}>{s.name}</div><div className="muted xs">{s.zone} · {s.address}</div></div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Bell_({ unread, setUnread }) {
  const [open, setOpen] = useState(false); const [items, setItems] = useState(null);
  const ref = useRef(null); const clock = useClock(); const nav = useNavigate();
  useOutside(ref, () => setOpen(false));
  const load = () => api.get('/notifications', { size: 8 }).then((r) => setItems(r.content || [])).catch(() => setItems([]));
  const toggle = () => { setOpen((o) => !o); if (!open) load(); };
  const readAll = async () => { await api.post('/notifications/read-all').catch(() => {}); setUnread(0); load(); };
  return (
    <div className="bell" ref={ref}>
      <button className="btn ghost icon" onClick={toggle} aria-label="Notifications"><Bell size={18} />{unread > 0 && <span className="count">{unread > 9 ? '9+' : unread}</span>}</button>
      {open && (
        <div className="pop-menu" style={{ right: 0, top: 46, width: 'min(380px, 92vw)' }}>
          <div className="row between" style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
            <b>Notifications</b>
            <button className="btn link small" onClick={readAll}><CheckCheck size={14} /> Mark all read</button>
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {items === null && <div className="muted small" style={{ padding: 16 }}>Loading…</div>}
            {items?.length === 0 && <div className="muted small" style={{ padding: 16 }}>You are all caught up.</div>}
            {items?.map((n) => (
              <div key={n.id} className="menu-item" style={{ alignItems: 'flex-start', background: n.read ? 'none' : 'rgba(34,211,238,.05)' }}>
                {!n.read && <span style={{ width: 7, height: 7, borderRadius: 4, background: 'var(--primary)', marginTop: 7, flex: 'none' }} />}
                <div><div style={{ fontWeight: 600 }}>{n.title}</div><div className="muted small">{n.message}</div><div className="faint xs">{relative(n.createdAt, clock.now)}</div></div>
              </div>
            ))}
          </div>
          <button className="menu-item" style={{ justifyContent: 'center', borderTop: '1px solid var(--border)', color: 'var(--primary)' }} onClick={() => { setOpen(false); nav('/notifications'); }}>View all</button>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth(); const [open, setOpen] = useState(false); const ref = useRef(null); const nav = useNavigate();
  useOutside(ref, () => setOpen(false));
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="avatar" style={{ border: 0, cursor: 'pointer' }} onClick={() => setOpen((o) => !o)} aria-label="User menu">{initials(user.fullName)}</button>
      {open && (
        <div className="pop-menu" style={{ right: 0, top: 44, width: 240 }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 650 }}>{user.fullName}</div><div className="muted xs">{user.email}</div>
            <span className="badge primary mt-8">{user.role.replace('_', ' ')}</span>
          </div>
          <button className="menu-item" onClick={() => { setOpen(false); nav('/profile'); }}><UserCircle size={16} />Profile</button>
          <button className="menu-item" onClick={() => { setOpen(false); nav('/profile#password'); }}><KeyRound size={16} />Change password</button>
          <button className="menu-item danger" onClick={logout}><LogOut size={16} />Log out</button>
        </div>
      )}
    </div>
  );
}

export default function Topbar({ unread, setUnread }) {
  const { user, refreshUser } = useAuth(); const clock = useClock();
  usePolling(() => { if (user) refreshUser(); }, 60000, { enabled: !!user, immediate: false });
  return (
    <header className="topbar">
      <span className="mobile-brand"><Brand compact /></span>
      <GlobalSearch />
      <div className="ml-auto row gap-8">
        <Tooltip bottom right text="Demo time machine: VoltSlot runs on a controllable clock so bookings, reminders and forecasts can be demonstrated at any date. Admins can fast-forward it.">
          <span className="clock-chip"><span className="dot" /><Clock size={14} /><span>{clock.label}</span></span>
        </Tooltip>
        {user ? (
          <>
            {user.role !== 'ADMIN' && user.role !== 'OPERATOR' && <Link to="/wallet" className="wallet-chip" title="Wallet"><Wallet size={15} /><span className="w-label">{inr(user.walletBalance ?? 0)}</span></Link>}
            <Bell_ unread={unread} setUnread={setUnread} />
            <UserMenu />
          </>
        ) : (
          <>
            <Link to="/login"><Button variant="ghost" size="sm">Sign in</Button></Link>
            <Link to="/register" className="hide-xs"><Button variant="primary" size="sm">Create account</Button></Link>
          </>
        )}
      </div>
    </header>
  );
}
