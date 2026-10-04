import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, BatteryCharging, History, Hourglass, Zap, RefreshCw } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useBooking } from '../lib/booking.jsx';
import { useToast } from '../lib/toast.jsx';
import { useAsync, useLocalState, usePolling } from '../lib/hooks.js';
import { inr } from '../lib/format.js';
import Tabs from '../components/ui/Tabs.jsx';
import Button from '../components/ui/Button.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import Pagination from '../components/ui/Pagination.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import BookingCard from '../components/bookings/BookingCard.jsx';
import QrModal from '../components/bookings/QrModal.jsx';
import InvoiceModal from '../components/bookings/InvoiceModal.jsx';
import CompleteModal from '../components/bookings/CompleteModal.jsx';
import RateModal from '../components/bookings/RateModal.jsx';
import WaitlistTable from '../components/bookings/WaitlistTable.jsx';
import { addToCalendar } from '../components/booking/ics.js';
import { notifyBookingsChanged, useBookingsChanged } from '../components/booking/bookingUtils.js';

const LIVE = ['HOLD', 'CONFIRMED', 'CHECKED_IN'];
const PAST_SIZE = 8;

function ListSkeleton() { return <div className="col gap-12"><Skeleton h={150} r={16} /><Skeleton h={150} r={16} /></div>; }

/** /bookings - Upcoming / Active / Past / Waitlist. */
export default function Bookings() {
  const toast = useToast();
  const { refreshUser } = useAuth();
  const { openBooking } = useBooking();
  const [tab, setTab] = useState('upcoming');
  const [pastPage, setPastPage] = useState(0);
  const [busyId, setBusyId] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [qr, setQr] = useState(null);
  const [invoice, setInvoice] = useState(null);
  const [completing, setCompleting] = useState(null);
  const [rating, setRating] = useState(null);
  const [rated, setRated] = useLocalState('chargeiq.rated', []);
  const [waitCancel, setWaitCancel] = useState(null);

  const upcoming = useAsync(() => api.get('/bookings', { upcoming: true, size: 100 }), []);
  const past = useAsync(() => api.get('/bookings', { upcoming: false, page: pastPage, size: PAST_SIZE }), [pastPage]);
  const waitlist = useAsync(() => api.get('/waitlist'), []);

  const reloadAll = useCallback((silent = true) => { upcoming.reload(silent); past.reload(silent); waitlist.reload(silent); }, []); // eslint-disable-line
  useBookingsChanged(() => reloadAll(true));
  usePolling(() => upcoming.reload(true), 20000, { immediate: false });

  const upRows = upcoming.data?.content || [];
  const hold = upRows.filter((b) => b.status === 'HOLD');
  const soon = upRows.filter((b) => b.status === 'HOLD' || b.status === 'CONFIRMED');
  const active = upRows.filter((b) => b.status === 'CHECKED_IN');
  const pastRows = (past.data?.content || []).filter((b) => !LIVE.includes(b.status));
  const waiting = (waitlist.data || []);
  const waitingCount = waiting.filter((w) => w.status === 'WAITING' || w.status === 'PROMOTED').length;

  const tabs = useMemo(() => [
    { value: 'upcoming', label: 'Upcoming', icon: <CalendarClock size={15} />, count: upcoming.data ? soon.length : undefined },
    { value: 'active', label: 'Active', icon: <BatteryCharging size={15} />, count: upcoming.data ? active.length : undefined },
    { value: 'past', label: 'Past', icon: <History size={15} />, count: past.data ? past.data.totalElements : undefined },
    { value: 'waitlist', label: 'Waitlist', icon: <Hourglass size={15} />, count: waitlist.data ? waitingCount : undefined },
  ], [upcoming.data, past.data, waitlist.data, soon.length, active.length, waitingCount]);

  // ---- actions ----
  const done = (msg) => { if (msg) toast.success(msg); refreshUser(); notifyBookingsChanged(); };
  const checkIn = async (b) => {
    setBusyId(b.id);
    try { await api.post(`/bookings/${b.id}/check-in`); done(`Checked in at ${b.station.name}. Plug in and charge!`); setTab('active'); }
    catch (e) { toast.error(e); } finally { setBusyId(null); }
  };
  const confirmCancel = async () => {
    const b = cancelTarget; setCancelBusy(true);
    try {
      const r = await api.post(`/bookings/${b.id}/cancel`, { reason: 'Cancelled by user' });
      const refund = Number(r.payment?.refundedAmount || 0);
      done(b.status === 'HOLD' ? 'Hold released.' : refund > 0 ? `Booking cancelled. ${inr(refund, { decimals: 2 })} refunded${r.payment?.method === 'WALLET' ? ' to your wallet' : ''}.` : 'Booking cancelled.');
      setCancelTarget(null);
    } catch (e) { toast.error(e); } finally { setCancelBusy(false); }
  };
  const payHeld = (b) => openBooking({ heldBooking: b, stationId: b.station.id });
  const payPromoted = async (w) => {
    setBusyId(`w${w.id}`);
    try { const b = await api.get(`/bookings/${w.promotedBookingId}`); if (b.status === 'HOLD') payHeld(b); else toast.info(b.status === 'CONFIRMED' ? 'That booking is already confirmed.' : 'That offer has expired.'); }
    catch (e) { toast.error(e); } finally { setBusyId(null); }
  };
  const leaveWaitlist = async () => {
    const w = waitCancel; setBusyId(`w${w.id}`);
    try { await api.del(`/waitlist/${w.id}`); toast.success('Removed from the waiting list.'); setWaitCancel(null); waitlist.reload(true); }
    catch (e) { toast.error(e); } finally { setBusyId(null); }
  };

  const cardProps = {
    busyId, rated: false, onPay: payHeld, onCheckIn: checkIn, onCancel: setCancelTarget, onComplete: setCompleting, onQr: setQr, onInvoice: setInvoice, onRate: setRating, onCalendar: addToCalendar,
  };
  const renderList = (rows, loading, error, retry, empty, extra) => {
    if (loading && !rows.length) return <ListSkeleton />;
    if (error) return <ErrorState error={error} onRetry={retry} title="Could not load your bookings" />;
    if (!rows.length) return empty;
    return <div className="col gap-12 stagger" data-testid="booking-list">{extra}{rows.map((b) => <BookingCard key={b.id} b={b} {...cardProps} rated={rated.includes(b.id)} />)}</div>;
  };
  const findCta = <Link className="btn primary" to="/"><Zap size={15} />Find chargers</Link>;

  return (
    <div className="page bk-page">
      <div className="page-head">
        <div><h1>My bookings</h1><p>Manage your charging slots, check in, and review past sessions.</p></div>
        <div className="row gap-8"><Button variant="ghost" icon={<RefreshCw size={15} />} onClick={() => reloadAll(false)}>Refresh</Button>{findCta}</div>
      </div>

      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="mt-16" role="tabpanel">
        {tab === 'upcoming' && renderList(soon, upcoming.loading, upcoming.error, upcoming.reload,
          <EmptyState icon={<CalendarClock size={26} />} title="No upcoming bookings" text="Book a slot at a nearby charger and it will show up here with a countdown." action={findCta} />,
          hold.length > 0 && <div className="bk-banner amber" key="hold-banner">You have {hold.length} slot{hold.length > 1 ? 's' : ''} on hold. Pay before the timer ends to keep {hold.length > 1 ? 'them' : 'it'}.</div>)}
        {tab === 'active' && renderList(active, upcoming.loading, upcoming.error, upcoming.reload,
          <EmptyState icon={<BatteryCharging size={26} />} title="No active session" text="Check in from an upcoming booking (opens 15 minutes before the start) and your live session appears here." />)}
        {tab === 'past' && (
          <>
            {renderList(pastRows, past.loading, past.error, past.reload, <EmptyState icon={<History size={26} />} title="No past bookings yet" text="Completed, cancelled and missed bookings are listed here." action={findCta} />)}
            {past.data && <Pagination page={past.data.page} totalPages={past.data.totalPages} totalElements={past.data.totalElements} size={PAST_SIZE} onChange={setPastPage} />}
          </>
        )}
        {tab === 'waitlist' && (waitlist.error ? <ErrorState error={waitlist.error} onRetry={waitlist.reload} title="Could not load your waiting list" />
          : <div className="card pad-0"><div style={{ padding: 8 }}><WaitlistTable rows={waiting} loading={waitlist.loading && !waitlist.data} busyId={busyId} onCancel={setWaitCancel} onPay={payPromoted} /></div></div>)}
      </div>

      <ConfirmDialog open={!!cancelTarget} danger loading={cancelBusy} onCancel={() => setCancelTarget(null)} onConfirm={confirmCancel}
        title={cancelTarget?.status === 'HOLD' ? 'Release this hold?' : 'Cancel this booking?'}
        confirmLabel={cancelTarget?.status === 'HOLD' ? 'Release hold' : 'Cancel booking'}>
        {cancelTarget && (
          <div data-testid="cancel-dialog">
            <p className="muted">{cancelTarget.station.name} · {cancelTarget.point.label}</p>
            {cancelTarget.status === 'HOLD'
              ? <p className="mt-8">Nothing has been charged yet. The slot goes back to other drivers.</p>
              : <div className="bk-refund mt-12"><span className="muted">You will get back</span><b data-testid="refund-amount">{inr(cancelTarget.refundIfCancelled, { decimals: 2 })}</b>
                  <span className="xs muted">{Number(cancelTarget.refundIfCancelled) >= Number(cancelTarget.payment?.amount || 0) ? '100 % - cancelling at least 60 minutes before the start.' : '50 % - cancelling less than 60 minutes before the start.'}</span></div>}
          </div>
        )}
      </ConfirmDialog>
      <ConfirmDialog open={!!waitCancel} danger onCancel={() => setWaitCancel(null)} onConfirm={leaveWaitlist} loading={!!busyId && String(busyId).startsWith('w')}
        title="Leave the waiting list?" message="We will stop watching this slot for you." confirmLabel="Leave waitlist" />

      <QrModal booking={qr} onClose={() => setQr(null)} />
      {invoice && <InvoiceModal booking={invoice} onClose={() => setInvoice(null)} />}
      {completing && <CompleteModal booking={completing} onClose={() => setCompleting(null)} onDone={(b) => { setCompleting(null); done(`Charge complete: ${b.session?.energyKwh?.toFixed?.(1)} kWh · final bill ${inr(b.session?.amount, { decimals: 2 })}`); setTab('past'); }} />}
      {rating && <RateModal booking={rating} onClose={() => setRating(null)} onDone={() => { setRated([...new Set([...rated, rating.id])]); setRating(null); }} />}
    </div>
  );
}
