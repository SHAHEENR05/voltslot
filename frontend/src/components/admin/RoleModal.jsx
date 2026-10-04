import { useEffect, useState } from 'react';
import { Modal, Button, Field, Segmented } from '../ui';
import { api } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';
import { titleCase } from '../../lib/format.js';

const ROLES = [{ value: 'USER', label: 'Driver' }, { value: 'OPERATOR', label: 'Operator' }, { value: 'FLEET_MANAGER', label: 'Fleet' }, { value: 'ADMIN', label: 'Admin' }];

/** Change a user's role. OPERATOR needs operatorId, FLEET_MANAGER needs fleetId (backend rule). */
export default function RoleModal({ user, operators, onClose, onSaved }) {
  const toast = useToast();
  const [role, setRole] = useState('USER');
  const [operatorId, setOperatorId] = useState('');
  const [fleetId, setFleetId] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (user) { setRole(user.role); setOperatorId(user.operatorId || ''); setFleetId(''); setErr(null); } }, [user]);
  if (!user) return null;
  const fe = err?.fieldErrors || {};
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await api.put(`/admin/users/${user.id}/role`, { role, operatorId: role === 'OPERATOR' ? Number(operatorId) || null : null, fleetId: role === 'FLEET_MANAGER' ? Number(fleetId) || null : null });
      toast.success(`${user.fullName} is now ${titleCase(role)}`); onSaved?.(); onClose();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const missing = (role === 'OPERATOR' && !operatorId) || (role === 'FLEET_MANAGER' && !fleetId);
  return (
    <Modal open title="Change role" size="sm" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button><Button loading={busy} disabled={missing || role === user.role && role !== 'OPERATOR' && role !== 'FLEET_MANAGER'} onClick={save}>Save role</Button></>}>
      <div className="col gap-12">
        <div><div className="bold">{user.fullName}</div><div className="muted small">{user.email} · currently {titleCase(user.role)}</div></div>
        {err && !Object.keys(fe).length && <div className="form-error-banner" role="alert">{err.message}</div>}
        <Field label="New role" error={fe.role}><Segmented options={ROLES} value={role} onChange={setRole} size="sm" block /></Field>
        {role === 'OPERATOR' && (
          <Field label="Operator" hint="Required: the operator organisation this user manages" error={fe.operatorId}>
            {operators.length ? <select className="select" value={operatorId} onChange={(e) => setOperatorId(e.target.value)}><option value="">Select operator…</option>{operators.map((o) => <option key={o.id} value={o.id}>{o.name} (#{o.id})</option>)}</select>
              : <input className="input" type="number" min="1" value={operatorId} onChange={(e) => setOperatorId(e.target.value)} placeholder="operatorId" />}
          </Field>)}
        {role === 'FLEET_MANAGER' && (
          <Field label="Fleet ID" hint="Required: id of the fleet this user manages (e.g. 1 – SwiftLogix)" error={fe.fleetId}>
            <input className="input" type="number" min="1" value={fleetId} onChange={(e) => setFleetId(e.target.value)} placeholder="fleetId" />
          </Field>)}
      </div>
    </Modal>
  );
}
