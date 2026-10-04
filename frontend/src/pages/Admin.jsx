import { useMemo } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { Button, ErrorState } from '../components/ui';
import StatTiles from '../components/admin/StatTiles.jsx';
import UsersTable from '../components/admin/UsersTable.jsx';
import TimeMachine from '../components/admin/TimeMachine.jsx';
import Warehouse from '../components/admin/Warehouse.jsx';
import { useFetch } from '../lib/hooks.js';

/** Admin console: platform stats, users, demo time machine, data-warehouse refresh. */
export default function Admin() {
  const stats = useFetch('/admin/stats');
  const ops = useFetch('/stations', { params: { size: 100 } });
  const operators = useMemo(() => { const m = new Map(); (ops.data?.content || ops.data || []).forEach((s) => s.operatorId && m.set(s.operatorId, s.operatorName)); return [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.id - b.id); }, [ops.data]);
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Admin console</h1><p>Platform health, user management and the demo controls.</p></div>
        <div className="row gap-8">
          <Button variant="ghost" icon={<RefreshCw size={15} />} onClick={() => stats.reload(true)}>Refresh</Button>
          <a className="btn" href="/swagger-ui.html" target="_blank" rel="noreferrer"><ExternalLink size={15} />API docs (Swagger)</a>
        </div>
      </div>
      {stats.error ? <ErrorState error={stats.error} onRetry={stats.reload} title="Could not load platform statistics" /> : <div className="fade-up"><StatTiles stats={stats.data} loading={stats.loading} /></div>}
      <div className="grid cols-2 mt-24" style={{ alignItems: 'start' }}>
        <TimeMachine onChanged={() => stats.reload(true)} />
        <Warehouse />
      </div>
      <div className="mt-24"><UsersTable operators={operators} onChanged={() => stats.reload(true)} /></div>
    </div>
  );
}
