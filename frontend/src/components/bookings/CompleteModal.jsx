import { useState } from 'react';
import { PlayCircle } from 'lucide-react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import Slider from '../ui/Slider.jsx';
import Field from '../ui/Field.jsx';
import { api } from '../../lib/api.js';

/** Demo: simulate the end of a charging session; optionally set the final state of charge. */
export default function CompleteModal({ booking, onClose, onDone }) {
  const [soc, setSoc] = useState(booking.socTarget);
  const [custom, setCustom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fe, setFe] = useState({});
  const submit = async () => {
    setBusy(true); setError(null); setFe({});
    try { const b = await api.post(`/bookings/${booking.id}/complete`, custom ? { socEnd: soc } : {}); onDone(b); }
    catch (e) { setError(e.message); setFe(e.fieldErrors || {}); } finally { setBusy(false); }
  };
  return (
    <Modal open title="Complete charge" size="sm" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose} disabled={busy}>Not yet</Button><Button variant="primary" loading={busy} icon={<PlayCircle size={15} />} onClick={submit} data-testid="complete-confirm">Finish session</Button></>}>
      <p className="muted">Demo only: a real charger reports this automatically. We will bill the energy actually delivered{booking.socTarget ? ` (booked ${booking.socStart}% → ${booking.socTarget}%)` : ''} and refund any difference.</p>
      <label className="check mt-12"><input type="checkbox" checked={custom} onChange={(e) => setCustom(e.target.checked)} />Stop earlier / later than the target</label>
      {custom && (
        <div className="mt-12">
          <Field label={`Final charge: ${soc}%`} error={fe.socEnd}><Slider min={Math.min(100, booking.socStart + 1)} max={100} value={soc} onChange={setSoc} ariaLabel="Final charge" /></Field>
        </div>
      )}
      {error && <div className="form-error-banner mt-12" role="alert">{error}</div>}
    </Modal>
  );
}
