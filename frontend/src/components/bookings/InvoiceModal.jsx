import { Printer, Zap } from 'lucide-react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import Table from '../ui/Table.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import ErrorState from '../ui/ErrorState.jsx';
import { useFetch } from '../../lib/hooks.js';
import { dateTime, inr, kwh } from '../../lib/format.js';
import { PAY_LABEL, PAY_STATUS } from './payLabels.js';

/** Invoice from GET /bookings/{id}/invoice with a print stylesheet (see app.css @media print). */
export default function InvoiceModal({ booking, onClose }) {
  const { data: inv, loading, error, reload } = useFetch(`/bookings/${booking.id}/invoice`);
  const rows = inv ? [
    { id: 1, item: 'Energy charge', detail: `${kwh(inv.energyKwh)} × ${inr(inv.effectiveTariff, { decimals: 2 })}/kWh (${inv.connector})`, amount: Number(inv.amount) },
    ...(Number(inv.refundedAmount) > 0 ? [{ id: 2, item: 'Refund', detail: PAY_STATUS[inv.status] || inv.status, amount: -Number(inv.refundedAmount) }] : []),
  ] : [];
  return (
    <Modal open title="Invoice" size="lg" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button><Button variant="primary" icon={<Printer size={15} />} onClick={() => window.print()} disabled={!inv} data-testid="print-invoice">Print</Button></>}>
      {loading ? <div className="col gap-8"><Skeleton h={28} w="40%" /><Skeleton h={120} r={12} /></div>
        : error ? <ErrorState error={error} onRetry={reload} title="No invoice available" />
        : (
          <div className="invoice-sheet" data-testid="invoice">
            <div className="inv-head">
              <div className="inv-brand"><span className="bolt"><Zap size={16} /></span> VoltSlot</div>
              <div className="inv-meta"><b>Tax invoice</b><div>{inv.invoiceNo}</div><div>{dateTime(inv.issuedAt)}</div></div>
            </div>
            <div className="inv-grid">
              <div><span className="inv-k">Billed to</span><b>{inv.customerName}</b><div>{inv.vehicle}</div></div>
              <div><span className="inv-k">Station</span><b>{inv.stationName}</b><div>{inv.stationAddress}</div></div>
              <div><span className="inv-k">Booking</span><b className="mono">{inv.bookingCode}</b><div>Paid via {PAY_LABEL[inv.method] || inv.method}</div></div>
            </div>
            <div className="inv-table"><Table columns={[
              { key: 'item', header: 'Item', render: (r) => <b>{r.item}</b> },
              { key: 'detail', header: 'Details' },
              { key: 'amount', header: 'Amount', numeric: true, render: (r) => inr(r.amount, { decimals: 2 }) },
            ]} rows={rows} compact /></div>
            <div className="inv-total"><span>Net amount {Number(inv.refundedAmount) > 0 ? 'after refund' : 'paid'}</span><b>{inr(Number(inv.amount) - Number(inv.refundedAmount || 0), { decimals: 2 })}</b></div>
            <div className="inv-foot">Payment status: <b>{PAY_STATUS[inv.status] || inv.status}</b> · This is a simulated invoice for demonstration purposes.</div>
          </div>
        )}
    </Modal>
  );
}
