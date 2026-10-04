import { useEffect, useState } from 'react';
import { Search, Users, ShieldCheck, Ban, CheckCircle2 } from 'lucide-react';
import { Card, Button, Table, Pagination, ErrorState, ConfirmDialog, EmptyState } from '../ui';
import RoleModal from './RoleModal.jsx';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useClock } from '../../lib/clock.jsx';
import { useFetch, useDebounced } from '../../lib/hooks.js';
import { useToast } from '../../lib/toast.jsx';
import { initials, relative, titleCase } from '../../lib/format.js';

const ROLE_PILL = { ADMIN: 'pink', OPERATOR: 'violet', FLEET_MANAGER: 'amber', USER: 'primary' };
const ROLES = ['USER', 'OPERATOR', 'FLEET_MANAGER', 'ADMIN'];
const SIZE = 10;

export default function UsersTable({ operators, onChanged }) {
  const { user: me } = useAuth();
  const { now } = useClock();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const dq = useDebounced(q, 300);
  useEffect(() => { setPage(0); }, [dq, role, status]);
  const { data, loading, error, reload } = useFetch('/admin/users', { params: { q: dq, role, status, page, size: SIZE } });
  const [roleFor, setRoleFor] = useState(null);
  const [blockFor, setBlockFor] = useState(null);
  const [busy, setBusy] = useState(false);

  const setUserStatus = async (u, next) => {
    setBusy(true);
    try { await api.put(`/admin/users/${u.id}/status`, { status: next }); toast.success(next === 'BLOCKED' ? `${u.fullName} blocked` : `${u.fullName} unblocked`); setBlockFor(null); reload(true); onChanged?.(); }
    catch (e) { toast.error(e); setBlockFor(null); } finally { setBusy(false); }
  };

  const columns = [
    { key: 'fullName', header: 'User', render: (u) => (
      <div className="row gap-8"><span className="avatar-sm">{initials(u.fullName)}</span><div style={{ minWidth: 0 }}><div className="bold truncate">{u.fullName}{u.id === me?.id && <span className="muted xs"> (you)</span>}</div><div className="muted xs truncate">{u.email}</div></div></div>) },
    { key: 'role', header: 'Role', render: (u) => <span className={`pill ${ROLE_PILL[u.role] || 'grey'}`}>{titleCase(u.role)}</span> },
    { key: 'link', header: 'Linked to', render: (u) => u.operatorName || (u.role === 'FLEET_MANAGER' ? 'Fleet manager' : <span className="muted">–</span>) },
    { key: 'city', header: 'City', render: (u) => u.city || <span className="muted">–</span> },
    { key: 'noShowCount', header: 'No-shows', numeric: true, render: (u) => (u.noShowCount ? <span className={u.noShowCount >= 3 ? 'text-red bold' : ''}>{u.noShowCount}</span> : <span className="muted">0</span>) },
    { key: 'status', header: 'Status', render: (u) => <span className={`pill ${u.status === 'ACTIVE' ? 'green' : 'red'}`}><span className="dot" />{u.status === 'ACTIVE' ? 'Active' : 'Blocked'}</span> },
    { key: 'lastLoginAt', header: 'Last login', render: (u) => (u.lastLoginAt ? relative(u.lastLoginAt, now) : <span className="muted">never</span>) },
    { key: 'actions', header: 'Actions', render: (u) => (
      <div className="row gap-4" style={{ justifyContent: 'center' }}>
        <Button size="sm" variant="ghost" icon={<ShieldCheck size={14} />} disabled={u.id === me?.id} onClick={() => setRoleFor(u)}>Role</Button>
        {u.status === 'ACTIVE'
          ? <Button size="sm" variant="ghost" icon={<Ban size={14} className="text-red" />} disabled={u.id === me?.id} onClick={() => setBlockFor(u)}>Block</Button>
          : <Button size="sm" variant="ghost" icon={<CheckCircle2 size={14} className="text-green" />} loading={busy} onClick={() => setUserStatus(u, 'ACTIVE')}>Unblock</Button>}
      </div>) },
  ];

  return (
    <Card title="Users" subtitle={data ? `${data.totalElements} matching accounts` : 'Search, filter and manage accounts'} icon={<Users size={16} />}>
      <div className="row wrap gap-8 mb-16 filters">
        <div className="input-wrap grow" style={{ minWidth: 200 }}><Search size={16} /><input className="input" placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" /></div>
        <select className="select" style={{ width: 170 }} value={role} onChange={(e) => setRole(e.target.value)} aria-label="Filter by role"><option value="">All roles</option>{ROLES.map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}</select>
        <select className="select" style={{ width: 150 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status"><option value="">Any status</option><option value="ACTIVE">Active</option><option value="BLOCKED">Blocked</option></select>
        {(q || role || status) && <Button variant="ghost" size="sm" onClick={() => { setQ(''); setRole(''); setStatus(''); }}>Clear</Button>}
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : (<>
        <Table columns={columns} rows={data?.content || []} loading={loading && !data} startIndex={page * SIZE} empty={<EmptyState icon={<Users size={26} />} title="No users match" text="Try a different search or clear the filters." />} />
        {data && <Pagination page={data.page} totalPages={data.totalPages} totalElements={data.totalElements} size={data.size} onChange={setPage} />}
      </>)}
      <RoleModal user={roleFor} operators={operators} onClose={() => setRoleFor(null)} onSaved={() => { reload(true); onChanged?.(); }} />
      <ConfirmDialog open={!!blockFor} danger title="Block this user?" message={blockFor ? `${blockFor.fullName} will no longer be able to sign in or book until you unblock the account.` : ''} confirmLabel="Block user" loading={busy} onConfirm={() => setUserStatus(blockFor, 'BLOCKED')} onCancel={() => setBlockFor(null)} />
    </Card>
  );
}
