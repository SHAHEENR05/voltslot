import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { BellRing, X, ChevronDown, Moon, Clock3, CalendarCheck2, Info } from 'lucide-react';
import { useAuth } from '../../lib/auth.jsx';
import { useBooking } from '../../lib/booking.jsx';
import { useClock } from '../../lib/clock.jsx';
import { useToast } from '../../lib/toast.jsx';
import { usePolling } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { clamp, parseLocal, dateTimeShort } from '../../lib/format.js';
import BatteryGlow from './BatteryGlow.jsx';
import SuggestionCard from './SuggestionCard.jsx';
import { REMINDERS_CHANGED, REMINDERS_SHOW, getHandled, markHandled, notifyRemindersChanged, humanHours, confidenceLabel, agoText, splitLabel } from './reminderUtil.js';

/**
 * Smart recharge reminder popup ("time to re-order"). Rendered once by Layout for signed-in users.
 * Fetches GET /reminders/active on mount, on every route change, every 60 s and whenever the reminders change elsewhere.
 * Reminders the driver closed this session (sessionStorage) are not shown again; snoozed / dismissed / booked ones disappear server-side.
 * Shows one reminder at a time ("Reminder 1 of 2").
 */
export default function ReminderPopup() {
  const { user } = useAuth();
  const { now } = useClock();
  const { openBooking, isOpen: bookingOpen } = useBooking();
  const toast = useToast();
  const nav = useNavigate();
  const loc = useLocation();
  const [items, setItems] = useState([]);
  const [handled, setHandled] = useState(getHandled);
  const [done, setDone] = useState(0);        // reminders handled in the current batch (for "Reminder 2 of 3")
  const [busy, setBusy] = useState('');
  const [why, setWhy] = useState(false);
  const [pred, setPred] = useState(null);
  const primaryRef = useRef(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(() => {
    if (!user) return Promise.resolve();
    return api.get('/reminders/active').then((l) => { if (alive.current) setItems(Array.isArray(l) ? l : []); }).catch(() => {});
  }, [user]);

  usePolling(load, 60000, { enabled: !!user, immediate: false });
  useEffect(() => { load(); }, [load, loc.pathname]);
  useEffect(() => {
    const changed = () => load();
    const show = () => { setHandled(getHandled()); load(); };
    window.addEventListener(REMINDERS_CHANGED, changed); window.addEventListener(REMINDERS_SHOW, show);
    return () => { window.removeEventListener(REMINDERS_CHANGED, changed); window.removeEventListener(REMINDERS_SHOW, show); };
  }, [load]);

  const visible = items.filter((i) => !handled.has(i.notificationId));
  const cur = bookingOpen || !user || user.reminderEnabled === false ? null : visible[0];
  const curId = cur?.notificationId;
  useEffect(() => { if (visible.length === 0 && done) setDone(0); }, [visible.length, done]);
  useEffect(() => { setWhy(false); setPred(null); }, [curId]);
  useEffect(() => { if (curId) setTimeout(() => primaryRef.current?.focus?.(), 50); }, [curId]);
  useEffect(() => {
    if (!cur) return undefined;
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const h = (e) => { if (e.key === 'Escape') closeIt(); };
    document.addEventListener('keydown', h);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', h); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curId]);
  useEffect(() => {
    if (why && cur && !pred) api.get('/reminders/predictions').then((l) => { if (alive.current) setPred((l || []).find((p) => p.vehicleId === cur.vehicle.id) || { none: true }); }).catch(() => setPred({ none: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [why, curId]);

  if (!cur) return null;

  const removeCur = () => { setItems((l) => l.filter((x) => x.notificationId !== cur.notificationId)); setDone((d) => d + 1); };
  const closeIt = () => { markHandled(curId); setHandled(getHandled()); setDone((d) => d + 1); };

  const act = async (kind, fn, okMsg) => {
    setBusy(kind);
    try { const r = await fn(); removeCur(); notifyRemindersChanged(); if (okMsg) toast.success(okMsg); return r; }
    catch (e) { toast.error(e); if (e.status === 409 || e.status === 404) { removeCur(); load(); } return null; }
    finally { if (alive.current) setBusy(''); }
  };
  const snooze = (hours, msg) => act('snooze' + hours, () => api.post(`/reminders/${curId}/snooze`, { hours }), msg);
  const tomorrow = () => {
    const t = new Date(now); t.setDate(t.getDate() + 1); t.setHours(8, 0, 0, 0);
    return clamp(Math.ceil((t - now) / 3600000), 1, 168);
  };
  const dismiss = () => act('dismiss', () => api.post(`/reminders/${curId}/dismiss`), 'Okay - we will nudge you again after your next charge.');
  const book = async () => {
    if (!cur.suggestion) { closeIt(); nav('/'); return; }
    const booking = await act('book', () => api.post(`/reminders/${curId}/book`));
    if (booking) { toast.success(`Slot held for 5 minutes at ${booking.station?.name || 'the station'}`); openBooking({ heldBooking: booking, step: 'payment' }); }
  };

  const v = cur.vehicle;
  const dueH = (parseLocal(cur.dueAt) - now) / 3600000;
  const overdue = cur.overdue || dueH < 0;
  const tone = overdue && dueH < -6 ? 'red' : overdue || dueH <= 12 ? 'amber' : 'primary';
  const dueNow = overdue && dueH > -0.25;
  const cad = Math.max(1, Math.round(cur.medianIntervalDays));
  const last = parseLocal(cur.lastChargeAt);
  const progress = last ? clamp((now - last) / Math.max(1, parseLocal(cur.dueAt) - last), 0, 1.2) : 0.9;
  const level = clamp(80 - progress * 60, 9, 90);
  const words = `${v.make} ${v.model}`.split(' ');
  const headB = words.pop(); const headA = words.length ? `${words.join(' ')} ` : '';
  const first = (user.fullName || '').trim().split(/\s+/)[0];
  const total = done + visible.length;
  const sessions = pred && !pred.none ? pred.sessionsUsed : null;

  return createPortal(
    <div className="overlay rp-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) closeIt(); }}>
      <div className={`rp-card ${tone}`} role="dialog" aria-modal="true" aria-labelledby="rp-title" key={curId}>
        <button className="rp-close btn ghost icon sm" onClick={closeIt} aria-label="Close reminder"><X size={16} /></button>
        <div className="rp-hero">
          {total > 1 && <span className="rp-count">Reminder {done + 1} of {total}</span>}
          <BatteryGlow level={level} tone={tone} />
        </div>
        <div className="rp-body">
          <div className="rp-eyebrow"><BellRing size={13} /> {first ? `Hi ${first}` : 'Heads up'} · smart reminder</div>
          <h2 id="rp-title" className="rp-title">Time to recharge your {headA}<span className="nowrap">{headB} <span className="rp-bolt-emoji">⚡</span></span></h2>
          <p className="rp-sub">You usually charge every <b>~{cad} {cad === 1 ? 'day' : 'days'}</b>; your last charge was <b>{agoText(parseLocal(cur.lastChargeAt), now)}</b>.</p>
          <div className="row wrap gap-8 rp-chips">
            <span className={`pill ${tone}`}><span className="dot" />{dueNow ? 'Due now' : overdue ? `Overdue by ${humanHours(dueH)}` : `Due in ${humanHours(dueH)}`}</span>
            <span className="pill grey">{splitLabel(v.label).reg}</span>
          </div>

          <SuggestionCard s={cur.suggestion} now={now} />

          <div className="rp-actions">
            <button ref={primaryRef} className="btn primary lg block rp-book" onClick={book} disabled={!!busy}>
              {busy === 'book' ? <span className="spinner" /> : <CalendarCheck2 size={18} />}
              {cur.suggestion ? 'Book this slot' : 'Find a charger'}
            </button>
            <div className="rp-snooze">
              <button className="btn ghost" onClick={() => snooze(3, 'Got it - we will remind you again in 3 hours.')} disabled={!!busy}>{busy === 'snooze3' ? <span className="spinner" /> : <Clock3 size={15} />}Remind me in 3 h</button>
              <button className="btn ghost" onClick={() => { const h = tomorrow(); snooze(h, 'Got it - we will remind you tomorrow morning.'); }} disabled={!!busy}>{busy.startsWith('snooze') && busy !== 'snooze3' ? <span className="spinner" /> : <Moon size={15} />}Tomorrow</button>
              <button className="btn link rp-notnow" onClick={dismiss} disabled={!!busy}>{busy === 'dismiss' ? <span className="spinner" /> : null}Not now</button>
            </div>
          </div>

          <button className={`rp-why-btn ${why ? 'open' : ''}`} onClick={() => setWhy((w) => !w)} aria-expanded={why}>
            <Info size={13} /> Why am I seeing this? <ChevronDown size={14} />
          </button>
          {why && (
            <div className="rp-why fade-in">
              <div className="rp-why-grid">
                <div><span className="f-label">Median interval</span><b>{cur.medianIntervalDays.toFixed(1)} days</b></div>
                <div><span className="f-label">Confidence</span><b>{Math.round(cur.confidence * 100)}% <small className="muted">· {confidenceLabel(cur.confidence)}</small></b></div>
                <div><span className="f-label">Sessions used</span><b>{sessions ?? (pred ? '–' : '…')}</b></div>
              </div>
              <div className="progress mt-8"><span style={{ width: `${Math.round(cur.confidence * 100)}%` }} /></div>
              <p className="muted small mt-8">VoltSlot looks at the gaps between your last completed charges, takes the <b>median</b> (so one holiday does not skew it) and adds it to your last charge — {dateTimeShort(cur.lastChargeAt)} — to predict when you will need power again: <b>{dateTimeShort(cur.dueAt)}</b>. You can switch reminders off any time in Profile.</p>
            </div>
          )}
        </div>
      </div>
    </div>, document.body);
}
