import { useState } from 'react';
import { Wallet as WalletIcon, ArrowDownLeft, ArrowUpRight, Receipt, Undo2, AlertOctagon } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { useCountUp, useFetch } from '../lib/hooks.js';
import { inr, dateTime } from '../lib/format.js';
import { Card, EmptyState, ErrorState, Pagination, Skeleton, Table } from '../components/ui';
import TopupCard from '../components/wallet/TopupCard.jsx';

const SIZE = 10;
const TYPE = {
  TOPUP: { label: 'Top-up', cls: 'green', sign: 1, icon: ArrowDownLeft },
  REFUND: { label: 'Refund', cls: 'violet', sign: 1, icon: Undo2 },
  DEBIT: { label: 'Charge', cls: 'red', sign: -1, icon: ArrowUpRight },
  PENALTY: { label: 'Penalty', cls: 'amber', sign: -1, icon: AlertOctagon },
};

function Balance({ value }) {
  const v = useCountUp(value, 900);
  return <div className="wallet-amt">{inr(v, { decimals: 2 })}</div>;
}

/** Wallet: balance hero, top-up, paginated ledger. */
export default function Wallet() {
  const { refreshUser } = useAuth();
  const [page, setPage] = useState(0);
  const wallet = useFetch('/wallet');
  const txns = useFetch('/wallet/transactions', { params: { page, size: SIZE } });

  const done = async () => {
    setPage(0);
    await Promise.all([wallet.reload(true), txns.reload(true), refreshUser()]);
  };

  const columns = [
    { key: 'createdAt', header: 'Date', render: (t) => <span className="muted">{dateTime(t.createdAt)}</span> },
    { key: 'type', header: 'Type', render: (t) => { const m = TYPE[t.type] || { label: t.type, cls: 'grey' }; const I = m.icon; return <span className={`pill ${m.cls}`}>{I && <I size={12} />}{m.label}</span>; } },
    { key: 'reference', header: 'Reference', render: (t) => t.reference || '–' },
    { key: 'amount', header: 'Amount', numeric: true, render: (t) => { const m = TYPE[t.type] || { sign: 1 }; return <b className={m.sign > 0 ? 'text-green' : 'text-red'}>{m.sign > 0 ? '+' : '−'}{inr(t.amount, { decimals: 2 })}</b>; } },
    { key: 'balanceAfter', header: 'Balance after', numeric: true, render: (t) => inr(t.balanceAfter, { decimals: 2 }) },
  ];

  return (
    <div className="page">
      <div className="page-head"><div><h1>Wallet</h1><p>Prepaid balance for instant, one-tap booking payments. Cancelled bookings are refunded here automatically.</p></div></div>

      <div className="grid cols-2 wallet-top">
        <Card hero className="wallet-hero">
          <div className="row gap-12">
            <div className="wallet-ico"><WalletIcon size={22} /></div>
            <div className="muted bold small">Available balance</div>
          </div>
          {wallet.loading && !wallet.data ? <Skeleton h={44} w={220} /> : wallet.error ? <ErrorState error={wallet.error} onRetry={wallet.reload} /> : <Balance value={wallet.data?.balance ?? 0} />}
          <div className="muted small">Use it at checkout - no card details every time.</div>
          {wallet.data?.recent?.length > 0 && (
            <div className="wallet-recent">
              {wallet.data.recent.slice(0, 3).map((t) => { const m = TYPE[t.type] || { sign: 1 }; return (
                <div key={t.id} className="row between small"><span className="muted truncate">{t.reference}</span><b className={m.sign > 0 ? 'text-green' : 'text-red'}>{m.sign > 0 ? '+' : '−'}{inr(t.amount, { decimals: 2 })}</b></div>
              ); })}
            </div>
          )}
        </Card>
        <TopupCard onDone={done} />
      </div>

      <Card className="mt-16" title="Transactions" icon={<Receipt size={16} className="text-primary" />} subtitle={txns.data ? `${txns.data.totalElements} entries, newest first` : undefined}>
        <div>
          {txns.error ? <ErrorState error={txns.error} onRetry={txns.reload} /> : (
            <Table columns={columns} rows={txns.data?.content || []} loading={txns.loading && !txns.data} startIndex={page * SIZE}
              empty={<EmptyState icon={<Receipt size={26} />} title="No transactions yet" text="Top up your wallet or book a charge and your ledger will appear here." />} />
          )}
          {txns.data && txns.data.totalPages > 1 && <Pagination page={txns.data.page} totalPages={txns.data.totalPages} totalElements={txns.data.totalElements} size={SIZE} onChange={setPage} />}
        </div>
      </Card>
    </div>
  );
}
