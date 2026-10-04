import { useState } from 'react';
import { Database, RefreshCw, Timer } from 'lucide-react';
import { Card, Button, Table } from '../ui';
import { api } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';
import { num } from '../../lib/format.js';

const nice = (k) => k.replace(/^dw_/, '').replace(/_/g, ' ');

export default function Warehouse() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const refresh = async () => {
    setBusy(true);
    try { const r = await api.post('/admin/warehouse/refresh'); setRes(r); Object.keys(r.rows || {}).length ? toast.success(`Warehouse rebuilt in ${(r.millis / 1000).toFixed(1)} s`) : toast.info('Refresh finished, but no warehouse tables were reported'); }
    catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  const rows = Object.entries(res?.rows || {}).map(([table, count]) => ({ id: table, table, count }));
  const total = rows.reduce((s, r) => s + r.count, 0);
  return (
    <Card title="Data warehouse" subtitle="Star-schema tables behind the Insights page" icon={<Database size={16} />}
      actions={<Button icon={<RefreshCw size={15} />} loading={busy} onClick={refresh}>Refresh warehouse</Button>}>
      <p className="muted small">Rebuilds the <code>dw_*</code> dimension and fact tables from the live booking and session data by calling the <code>sp_refresh_warehouse()</code> procedure. Analytics queries read from these tables.</p>
      {busy && <div className="progress mt-12"><span className="indeterminate" /></div>}
      {res && (rows.length ? (
        <div className="mt-12">
          <div className="row wrap gap-8 mb-8"><span className="pill green"><span className="dot" />Refreshed</span><span className="pill grey"><Timer size={12} /> {res.millis >= 1000 ? `${(res.millis / 1000).toFixed(2)} s` : `${res.millis} ms`}</span><span className="pill grey">{num(total)} rows</span></div>
          <Table compact columns={[{ key: 'table', header: 'Table', render: (r) => <code>{r.table}</code> }, { key: 'kind', header: 'Type', render: (r) => (r.table.includes('fact') ? 'Fact' : 'Dimension') }, { key: 'count', header: 'Rows', numeric: true, sortable: true, render: (r) => num(r.count) }]} rows={rows} />
        </div>
      ) : <div className="banner amber mt-12">The procedure ran but returned no table counts ({res.millis} ms). This happens on databases without the warehouse schema.</div>)}
    </Card>
  );
}
