import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, BatteryCharging, CalendarCheck, XCircle, PartyPopper, Hourglass, Zap, UserX, Info, CheckCheck, BellOff } from 'lucide-react';
import { useClock } from '../lib/clock.jsx';
import { useToast } from '../lib/toast.jsx';
import { useFetch } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { dateTime, relative } from '../lib/format.js';
import { Button, Card, EmptyState, ErrorState, Pagination, Skeleton, Tabs } from '../components/ui';
import { showRemindersAgain } from '../components/reminders/reminderUtil.js';

const SIZE = 15;
export const NOTE_TYPES = {
  RECHARGE_REMINDER: { icon: BatteryCharging, tone: 'amber', label: 'Recharge reminder' },
  BOOKING_CONFIRMED: { icon: CalendarCheck, tone: 'green', label: 'Booking confirmed' },
  BOOKING_CANCELLED: { icon: XCircle, tone: 'red', label: 'Booking cancelled' },
  WAITLIST_PROMOTED: { icon: PartyPopper, tone: 'violet', label: 'Waitlist' },
  BOOKING_SOON: { icon: Hourglass, tone: 'amber', label: 'Starting soon' },
  CHARGE_COMPLETE: { icon: Zap, tone: 'green', label: 'Charge complete' },
  NO_SHOW: { icon: UserX, tone: 'red', label: 'No-show' },
  SYSTEM: { icon: Info, tone: 'primary', label: 'System' },
};
const STATUS_LABEL = { SNOOZED: 'Snoozed', DISMISSED: 'Dismissed' };

/** Notification centre: list, unread filter, mark read / all read, type icons. */
export default function Notifications() {
  const { iso } = useClock();
  const toast = useToast();
  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(0);
  const list = useFetch('/notifications', { params: { unreadOnly: tab === 'unread', page, size: SIZE } });
  const count = useFetch('/notifications/unread-count');
  const [busy, setBusy] = useState(false);
  const unread = count.data?.count ?? 0;

  const markRead = async (n) => {
    if (n.read) return;
    list.setData((d) => d && { ...d, content: d.content.map((x) => (x.id === n.id ? { ...x, read: true } : x)) });
    try { await api.post(`/notifications/${n.id}/read`); count.reload(true); } catch (e) { toast.error(e); list.reload(true); }
  };
  const markAll = async () => {
    setBusy(true);
    try { const r = await api.post('/notifications/read-all'); toast.success(r.updated ? `${r.updated} marked as read` : 'Already all read'); await Promise.all([list.reload(true), count.reload(true)]); }
    catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  const changeTab = (t) => { setTab(t); setPage(0); };
  const items = list.data?.content || [];

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Notifications</h1><p>Bookings, reminders and charging updates in one place.</p></div>
        <Button variant="ghost" icon={<CheckCheck size={16} />} loading={busy} disabled={unread === 0} onClick={markAll}>Mark all as read</Button>
      </div>
      <Tabs tabs={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread', count: unread }]} value={tab} onChange={changeTab} className="mb-16" />

      {list.loading && !list.data && <div className="col gap-8">{[0, 1, 2, 3].map((i) => <Skeleton.Card key={i} h={78} />)}</div>}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {!list.loading && !list.error && items.length === 0 && (
        <Card><EmptyState icon={tab === 'unread' ? <CheckCheck size={26} /> : <BellOff size={26} />} title={tab === 'unread' ? 'You are all caught up' : 'No notifications yet'} text={tab === 'unread' ? 'Nothing unread. Nice.' : 'Booking confirmations, reminders and charge summaries will show up here.'} /></Card>
      )}
      {items.length > 0 && (
        <div className="col gap-8 stagger">
          {items.map((n) => {
            const t = NOTE_TYPES[n.type] || NOTE_TYPES.SYSTEM; const I = t.icon;
            const activeReminder = n.type === 'RECHARGE_REMINDER' && n.status === 'ACTIVE';
            return (
              <div key={n.id} className={`card note-item ${n.read ? '' : 'unread'}`} onClick={() => markRead(n)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') markRead(n); }}>
                <div className={`note-ico ${t.tone}`}><I size={18} /></div>
                <div className="grow">
                  <div className="row gap-8 wrap">
                    <b className="note-title">{n.title}</b>
                    {!n.read && <span className="note-dot" aria-label="Unread" />}
                    {STATUS_LABEL[n.status] && <span className="pill grey">{STATUS_LABEL[n.status]}</span>}
                    {activeReminder && <span className="pill amber"><span className="dot" />Action needed</span>}
                  </div>
                  <div className="muted note-msg">{n.message}</div>
                  <div className="row wrap gap-12 mt-8">
                    <span className="faint xs" title={dateTime(n.createdAt)}>{t.label} · {relative(n.createdAt, iso)}</span>
                    {activeReminder && <Button size="sm" onClick={(e) => { e.stopPropagation(); markRead(n); showRemindersAgain(); }}>Open reminder</Button>}
                    {n.type === 'RECHARGE_REMINDER' && <Link className="xs" to="/reminders" onClick={(e) => e.stopPropagation()}>View predictions</Link>}
                    {['BOOKING_CONFIRMED', 'BOOKING_CANCELLED', 'BOOKING_SOON', 'WAITLIST_PROMOTED', 'CHARGE_COMPLETE', 'NO_SHOW'].includes(n.type) && <Link className="xs" to="/bookings" onClick={(e) => e.stopPropagation()}>View bookings</Link>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {list.data && list.data.totalPages > 1 && <Pagination page={list.data.page} totalPages={list.data.totalPages} totalElements={list.data.totalElements} size={SIZE} onChange={setPage} />}
    </div>
  );
}
