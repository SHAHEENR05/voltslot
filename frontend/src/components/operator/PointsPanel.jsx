import { useState } from 'react';
import { Plus, Pencil, Trash2, PlugZap, X } from 'lucide-react';
import { Card, Button, Table, Modal, Field, FormRow, ConfirmDialog, ErrorState, Skeleton, EmptyState } from '../ui';
import { api } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { useReference } from '../../lib/reference.jsx';
import { useToast } from '../../lib/toast.jsx';
import { inr, kw } from '../../lib/format.js';

const STATUSES = [
  { value: 'ACTIVE', label: 'Active', cls: 'green' },
  { value: 'MAINTENANCE', label: 'Maint.', cls: 'amber' },
  { value: 'OFFLINE', label: 'Offline', cls: 'red' },
];

function StatusToggle({ value, onChange, busy }) {
  return (
    <div className="status-toggle" role="radiogroup" aria-label="Point status">
      {STATUSES.map((s) => (
        <button key={s.value} type="button" role="radio" aria-checked={value === s.value} disabled={busy} className={`${s.cls} ${value === s.value ? 'on' : ''}`} onClick={() => value !== s.value && onChange(s.value)}>{s.label}</button>
      ))}
    </div>
  );
}

function PointModal({ open, stationId, point, onClose, onSaved }) {
  const { connectors } = useReference();
  const toast = useToast();
  const [f, setF] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const editing = !!point;
  // (re)initialise when opened
  const key = `${open}|${point?.id ?? 'new'}`;
  const [lastKey, setLastKey] = useState('');
  if (open && key !== lastKey) {
    setLastKey(key); setErr(null);
    const c = point ? connectors.find((x) => x.code === point.connectorCode) : connectors[0];
    setF({ label: point?.label || '', connectorTypeId: c?.id || '', powerKw: point?.powerKw ?? c?.typicalKw ?? '', tariffPerKwh: point?.tariffPerKwh ?? 18, status: point?.status || 'ACTIVE' });
  }
  if (!open && lastKey) setLastKey('');
  if (!open || !f) return null;
  const fe = err?.fieldErrors || {};
  const pickConnector = (e) => {
    const id = Number(e.target.value); const c = connectors.find((x) => x.id === id);
    setF((x) => ({ ...x, connectorTypeId: id, powerKw: editing ? x.powerKw : c?.typicalKw ?? x.powerKw }));
  };
  const save = async () => {
    setBusy(true); setErr(null);
    const body = { label: f.label, connectorTypeId: Number(f.connectorTypeId) || null, powerKw: f.powerKw === '' ? null : Number(f.powerKw), tariffPerKwh: f.tariffPerKwh === '' ? null : Number(f.tariffPerKwh), status: f.status };
    try {
      if (editing) await api.put(`/operator/points/${point.id}`, body); else await api.post(`/operator/stations/${stationId}/points`, body);
      toast.success(editing ? 'Point updated' : 'Point added'); onSaved(); onClose();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <Modal open size="sm" title={editing ? `Edit ${point.label}` : 'Add charging point'} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button><Button loading={busy} onClick={save}>{editing ? 'Save' : 'Add point'}</Button></>}>
      <div className="col gap-12">
        {err && !Object.keys(fe).length && <div className="form-error-banner" role="alert">{err.message}</div>}
        <Field label="Label" error={fe.label}><input className="input" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="DC-3" maxLength={20} /></Field>
        <Field label="Connector" error={fe.connectorTypeId}>
          <select className="select" value={f.connectorTypeId} onChange={pickConnector}>{connectors.map((c) => <option key={c.id} value={c.id}>{c.displayName} ({c.currentType})</option>)}</select>
        </Field>
        <FormRow>
          <Field label="Power (kW)" error={fe.powerKw}><input className="input" type="number" min="0" step="0.1" value={f.powerKw} onChange={(e) => setF({ ...f, powerKw: e.target.value })} /></Field>
          <Field label="Tariff (₹ / kWh)" error={fe.tariffPerKwh}><input className="input" type="number" min="0" step="0.5" value={f.tariffPerKwh} onChange={(e) => setF({ ...f, tariffPerKwh: e.target.value })} /></Field>
        </FormRow>
        <Field label="Status"><StatusToggle value={f.status} onChange={(s) => setF({ ...f, status: s })} /></Field>
      </div>
    </Modal>
  );
}

/** Charging points of one station: add / edit / delete and status toggle. */
export default function PointsPanel({ station, onClose, onChanged }) {
  const toast = useToast();
  const { data, loading, error, reload } = useFetch(`/stations/${station.id}`, { params: undefined, deps: [station.id] });
  const [modal, setModal] = useState({ open: false, point: null });
  const [del, setDel] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [delBusy, setDelBusy] = useState(false);
  const points = data?.points || [];
  const refresh = () => { reload(true); onChanged?.(); };

  const setStatus = async (p, status) => {
    setBusyId(p.id);
    try { await api.put(`/operator/points/${p.id}/status`, { status }); toast.success(`${p.label} is now ${status.toLowerCase()}`); refresh(); } catch (e) { toast.error(e); } finally { setBusyId(null); }
  };
  const remove = async () => {
    setDelBusy(true);
    try { await api.del(`/operator/points/${del.id}`); toast.success(`${del.label} deleted`); setDel(null); refresh(); } catch (e) { toast.error(e); setDel(null); } finally { setDelBusy(false); }
  };

  const columns = [
    { key: 'label', header: 'Point', sortable: true, render: (p) => <b>{p.label}</b> },
    { key: 'connectorCode', header: 'Connector', render: (p) => <div><span className="badge">{p.connectorCode}</span><div className="muted xs">{p.currentType} · {p.connectorName}</div></div> },
    { key: 'powerKw', header: 'Power', numeric: true, sortable: true, render: (p) => kw(p.powerKw) },
    { key: 'tariffPerKwh', header: 'Tariff (₹/kWh)', numeric: true, sortable: true, render: (p) => inr(p.tariffPerKwh, { decimals: 2 }) },
    { key: 'status', header: 'Status', render: (p) => <StatusToggle value={p.status} busy={busyId === p.id} onChange={(s) => setStatus(p, s)} /> },
    { key: 'actions', header: 'Actions', render: (p) => (
      <div className="row gap-4" style={{ justifyContent: 'center' }}>
        <Button size="sm" variant="ghost" iconOnly aria-label={`Edit ${p.label}`} onClick={() => setModal({ open: true, point: p })}><Pencil size={14} /></Button>
        <Button size="sm" variant="ghost" iconOnly aria-label={`Delete ${p.label}`} onClick={() => setDel(p)}><Trash2 size={14} className="text-red" /></Button>
      </div>) },
  ];

  return (
    <Card title={`Charging points · ${station.name}`} subtitle="Set a point to Maintenance or Offline to stop new bookings on it" icon={<PlugZap size={16} />} className="fade-up"
      actions={<><Button size="sm" icon={<Plus size={14} />} onClick={() => setModal({ open: true, point: null })}>Add point</Button><Button size="sm" variant="ghost" iconOnly aria-label="Close points panel" onClick={onClose}><X size={15} /></Button></>}>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <Skeleton.Lines n={4} /> : (
        <Table columns={columns} rows={points} empty={<EmptyState icon={<PlugZap size={26} />} title="No charging points" text="Add the first point to start taking bookings." />} />
      )}
      <PointModal open={modal.open} point={modal.point} stationId={station.id} onClose={() => setModal({ open: false, point: null })} onSaved={refresh} />
      <ConfirmDialog open={!!del} danger title="Delete charging point?" message={del ? `${del.label} will be removed. Points with booking history cannot be deleted – set them to Offline instead.` : ''} confirmLabel="Delete" loading={delBusy} onConfirm={remove} onCancel={() => setDel(null)} />
    </Card>
  );
}
