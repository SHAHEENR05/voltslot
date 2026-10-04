import { useState } from 'react';
import { Plus, Smartphone, CreditCard, Landmark, ShieldCheck } from 'lucide-react';
import { Button, Card, Chip, Field, Segmented } from '../ui';
import { inr } from '../../lib/format.js';
import { api } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';

const QUICK = [500, 1000, 2000, 5000];
const METHODS = [
  { value: 'UPI', label: 'UPI', icon: <Smartphone size={13} /> },
  { value: 'CARD', label: 'Card', icon: <CreditCard size={13} /> },
  { value: 'NETBANKING', label: 'Net banking', icon: <Landmark size={13} /> },
];

/** Wallet top-up: quick chips + custom amount (100 - 50,000) + simulated payment method. */
export default function TopupCard({ onDone }) {
  const toast = useToast();
  const [amount, setAmount] = useState('1000');
  const [method, setMethod] = useState('UPI');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const amt = Number(amount);
  const valid = amount !== '' && !Number.isNaN(amt) && amt >= 100 && amt <= 50000;

  const submit = async (e) => {
    e.preventDefault();
    if (!valid) { setErr(amt > 50000 ? 'Maximum top-up is ₹50,000' : 'Minimum top-up is ₹100'); return; }
    setBusy(true);
    try {
      const w = await api.post('/wallet/topup', { amount: amt, method });
      toast.success(`${inr(amt)} added. New balance ${inr(w.balance, { decimals: 2 })}`);
      onDone?.(w);
    } catch (ex) {
      if (ex.fieldErrors?.amount) setErr(ex.fieldErrors.amount); else toast.error(ex);
    } finally { setBusy(false); }
  };

  return (
    <Card title="Add money" subtitle="Instant, simulated payment" icon={<Plus size={16} className="text-primary" />}>
      <form onSubmit={submit} className="col gap-16" noValidate>
        <div className="row wrap gap-8">
          {QUICK.map((q) => <Chip key={q} active={amt === q} onClick={() => { setAmount(String(q)); setErr(''); }}>{inr(q)}</Chip>)}
        </div>
        <Field label="Amount" error={err} hint="Between ₹100 and ₹50,000" htmlFor="topup-amt">
          <div className="input-wrap amt-wrap">
            <span className="amt-prefix">₹</span>
            <input id="topup-amt" className="input" inputMode="numeric" value={amount} onChange={(e) => { setAmount(e.target.value.replace(/[^\d.]/g, '')); setErr(''); }} placeholder="Enter amount" />
          </div>
        </Field>
        <Field label="Pay with"><Segmented block options={METHODS} value={method} onChange={setMethod} /></Field>
        <Button type="submit" size="lg" block loading={busy} disabled={!valid && amount !== ''}>{valid ? `Add ${inr(amt)}` : 'Add money'}</Button>
        <div className="muted xs row gap-6"><ShieldCheck size={13} className="text-green" />Demo payment - no real money moves.</div>
      </form>
    </Card>
  );
}
