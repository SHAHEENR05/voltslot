import { useState } from 'react';
import { Wallet, Smartphone, CreditCard, ShieldCheck, PlusCircle, Timer } from 'lucide-react';
import Field, { FormRow } from '../ui/Field.jsx';
import Button from '../ui/Button.jsx';
import Chip from '../ui/Chip.jsx';
import { BookingSummary } from './HoldStep.jsx';
import { inr } from '../../lib/format.js';

const METHODS = [
  { value: 'WALLET', label: 'VoltSlot Wallet', icon: Wallet, sub: 'Instant · refunds credited here' },
  { value: 'UPI', label: 'UPI', icon: Smartphone, sub: 'GPay, PhonePe, Paytm · demo' },
  { value: 'CARD', label: 'Credit / Debit card', icon: CreditCard, sub: 'Visa, Mastercard, RuPay · demo' },
];

/** inline wallet top-up shown on a 402 (or when the balance is visibly too low) */
export function TopUp({ shortfall, busy, error, fieldError, onTopUp }) {
  const base = Math.max(100, Math.ceil(shortfall / 100) * 100);
  const quick = [...new Set([base, 500, 1000, 2000].filter((x) => x >= base))].sort((a, b) => a - b).slice(0, 4);
  const [amount, setAmount] = useState(quick[0] || 500);
  const [method, setMethod] = useState('UPI');
  return (
    <div className="bk-topup fade-up" data-testid="topup">
      <div className="row gap-8"><PlusCircle size={16} className="text-amber" /><b>Top up your wallet</b></div>
      <p className="muted small mt-4">You need {inr(shortfall, { decimals: 2 })} more to pay with the wallet. Top up now and we will complete the payment automatically.</p>
      <div className="row wrap gap-6 mt-8">{quick.map((q) => <Chip key={q} active={amount === q} onClick={() => setAmount(q)}>{inr(q, { decimals: 0 })}</Chip>)}</div>
      <FormRow className="mt-8">
        <Field label="Amount (₹)" error={fieldError}><input className="input" type="number" min={100} max={50000} step={50} value={amount} onChange={(e) => setAmount(Number(e.target.value))} aria-label="Top-up amount" /></Field>
        <Field label="Pay with"><select className="select" value={method} onChange={(e) => setMethod(e.target.value)}><option value="UPI">UPI</option><option value="CARD">Card</option><option value="NETBANKING">Net banking</option></select></Field>
      </FormRow>
      {error && <div className="form-error-banner mt-8">{error}</div>}
      <Button className="mt-12" variant="primary" block loading={busy} onClick={() => onTopUp(amount, method)}>Top up {inr(amount, { decimals: 0 })} &amp; pay</Button>
    </div>
  );
}

/** Step 3: payment method + confirm. */
export default function PayStep({ booking, balance, method, setMethod, error, fieldErrors, topUp, remaining, onShowTopUp }) {
  const cost = Number(booking.estCost);
  const short = method === 'WALLET' && balance < cost;
  return (
    <div className="col gap-16" data-testid="pay-step">
      <div className="bk-pay-timer"><Timer size={14} /> Hold expires in <b>{String(Math.floor(Math.max(0, remaining) / 60)).padStart(2, '0')}:{String(Math.max(0, remaining) % 60).padStart(2, '0')}</b></div>
      <BookingSummary b={booking} />
      <div>
        <div className="label mb-8">Payment method</div>
        <div className="bk-methods" role="radiogroup" aria-label="Payment method">
          {METHODS.map((m) => {
            const Icon = m.icon;
            return (
              <button key={m.value} type="button" role="radio" aria-checked={method === m.value} className={`bk-method ${method === m.value ? 'sel' : ''}`} onClick={() => setMethod(m.value)} data-testid={`method-${m.value}`}>
                <span className="bk-method-ico"><Icon size={18} /></span>
                <span className="grow"><b>{m.label}</b><span className="muted small" style={{ display: 'block' }}>{m.sub}</span></span>
                {m.value === 'WALLET' && <span className={`bk-bal ${short ? 'low' : ''}`}>{inr(balance, { decimals: 2 })}</span>}
              </button>
            );
          })}
        </div>
        {fieldErrors.paymentMethod && <div className="field has-error mt-4"><div className="err">{fieldErrors.paymentMethod}</div></div>}
      </div>
      {method === 'UPI' && <Field label="UPI ID (demo)" hint="No real money moves - the payment is simulated."><input className="input" placeholder="name@bank" defaultValue="aarav@okicici" aria-label="UPI ID" /></Field>}
      {method === 'CARD' && (
        <FormRow>
          <Field label="Card number (demo)" className="span-2"><input className="input" inputMode="numeric" defaultValue="4111 1111 1111 1111" aria-label="Card number" /></Field>
          <Field label="Expiry"><input className="input" defaultValue="12/30" aria-label="Expiry" /></Field>
          <Field label="CVV"><input className="input" type="password" defaultValue="123" aria-label="CVV" /></Field>
        </FormRow>
      )}
      {short && !topUp && <div className="bk-warn"><Wallet size={14} /> Wallet balance is {inr(cost - balance, { decimals: 2 })} short for this booking. <button type="button" className="btn link" onClick={onShowTopUp}>Top up now</button></div>}
      {topUp}
      {error && <div className="form-error-banner" role="alert">{error}</div>}
      <div className="bk-secure small muted"><ShieldCheck size={14} /> Free cancellation up to 60 min before start (full refund), 50 % after. Total {inr(cost, { decimals: 2 })}.</div>
    </div>
  );
}
