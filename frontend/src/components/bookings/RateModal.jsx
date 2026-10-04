import Modal from '../ui/Modal.jsx';
import { ReviewForm } from '../station/ReviewsSection.jsx';

/** "Rate this station" after a completed session (links the review to the booking). */
export default function RateModal({ booking, onClose, onDone }) {
  return (
    <Modal open title={`Rate ${booking.station.name}`} size="sm" onClose={onClose}>
      <p className="muted small mb-8">Booking {booking.bookingCode} · {booking.session ? `${booking.session.energyKwh.toFixed(1)} kWh delivered` : 'completed'}</p>
      <ReviewForm stationId={booking.station.id} bookingId={booking.id} onDone={onDone} />
    </Modal>
  );
}
