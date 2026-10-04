import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { useToast } from './toast.jsx';
import BookingDrawer from '../components/booking/BookingDrawer.jsx';

const BookingCtx = createContext(null);

/**
 * useBooking() -> { openBooking(opts), closeBooking(), opts, isOpen }
 * opts: { stationId, pointId, slotStart, vehicleId, socStart, socTarget, heldBooking, step? }
 * Guests are redirected to /login (state {from, openBooking: opts}); after login this provider re-opens the drawer.
 * The drawer UI lives in components/booking/BookingDrawer.jsx (props: { opts, onClose }).
 */
export function BookingProvider({ children }) {
  const [opts, setOpts] = useState(null);
  const { isAuthed, ready } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const toast = useToast();

  const openBooking = useCallback((o = {}) => {
    if (!isAuthed) {
      toast.info('Please sign in to book a slot.');
      navigate('/login', { state: { from: loc, openBooking: o } });
      return;
    }
    setOpts(o);
  }, [isAuthed, navigate, loc, toast]);
  const closeBooking = useCallback(() => setOpts(null), []);

  // re-open after login redirect
  useEffect(() => {
    if (ready && isAuthed && loc.state?.openBooking) {
      setOpts(loc.state.openBooking);
      navigate(loc.pathname + loc.search, { replace: true, state: null });
    }
  }, [ready, isAuthed, loc, navigate]);

  const value = useMemo(() => ({ openBooking, closeBooking, opts, isOpen: !!opts }), [openBooking, closeBooking, opts]);
  return (
    <BookingCtx.Provider value={value}>
      {children}
      {opts && <BookingDrawer opts={opts} onClose={closeBooking} />}
    </BookingCtx.Provider>
  );
}
export const useBooking = () => useContext(BookingCtx);
