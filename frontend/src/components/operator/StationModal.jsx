import { useEffect, useState } from 'react';
import { Modal, Button, Field, FormRow, Segmented, Chip, Skeleton } from '../ui';
import MapPicker from '../map/MapPicker.jsx';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useReference } from '../../lib/reference.jsx';
import { useToast } from '../../lib/toast.jsx';
import { DEFAULT_LOCATION } from '../../lib/constants.js';

const BLANK = { name: '', address: '', zone: '', city: 'Mumbai', latitude: DEFAULT_LOCATION.lat, longitude: DEFAULT_LOCATION.lon, tier: 'STANDARD', openHour: 0, closeHour: 24, amenityIds: [], operatorId: '' };
const hourLabel = (h) => `${String(h).padStart(2, '0')}:00${h === 24 ? ' (midnight)' : ''}`;

/** Create / edit a station. `station` = StationSummaryDto when editing, null when creating. */
export default function StationModal({ open, station, operators = [], onClose, onSaved }) {
  const { user } = useAuth();
  const { zones, amenities } = useReference();
  const toast = useToast();
  const [f, setF] = useState(BLANK);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const editing = !!station;

  useEffect(() => {
    if (!open) return;
    setErr(null);
    if (!station) { setF(BLANK); return; }
    setF({ ...BLANK, name: station.name, address: station.address, zone: station.zone, city: station.city, latitude: station.latitude, longitude: station.longitude, tier: station.tier, openHour: station.openHour, closeHour: station.closeHour, operatorId: station.operatorId });
    setLoadingDetail(true);
    api.get(`/stations/${station.id}`, null, { auth: false }).then((d) => setF((x) => ({ ...x, amenityIds: (d.amenities || []).map((a) => a.id) }))).catch(() => {}).finally(() => setLoadingDetail(false));
  }, [open, station]);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const num = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value === '' ? '' : Number(e.target.value) }));
  const fe = err?.fieldErrors || {};
  const toggleAmenity = (id) => setF((x) => ({ ...x, amenityIds: x.amenityIds.includes(id) ? x.amenityIds.filter((a) => a !== id) : [...x.amenityIds, id] }));

  const save = async () => {
    setBusy(true); setErr(null);
    const body = { name: f.name, address: f.address, zone: f.zone, city: f.city, latitude: f.latitude === '' ? null : f.latitude, longitude: f.longitude === '' ? null : f.longitude, tier: f.tier, openHour: f.openHour, closeHour: f.closeHour, status: 'ACTIVE', amenityIds: f.amenityIds, operatorId: user?.role === 'ADMIN' ? Number(f.operatorId) || null : undefined };
    try {
      if (editing) await api.put(`/operator/stations/${station.id}`, body); else await api.post('/operator/stations', body);
      toast.success(editing ? 'Station updated' : 'Station created');
      onSaved?.(); onClose();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} size="lg" title={editing ? `Edit ${station.name}` : 'New station'} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button><Button loading={busy} onClick={save}>{editing ? 'Save changes' : 'Create station'}</Button></>}>
      <div className="col gap-12">
        {err && !Object.keys(fe).length && <div className="form-error-banner" role="alert">{err.message}</div>}
        <FormRow>
          <Field label="Station name" error={fe.name}><input className="input" value={f.name} onChange={set('name')} placeholder="e.g. VoltGrid Powai Hub" /></Field>
          <Field label="Zone" error={fe.zone}><input className="input" list="zone-list" value={f.zone} onChange={set('zone')} placeholder="Powai" /><datalist id="zone-list">{zones.map((z) => <option key={z.zone} value={z.zone} />)}</datalist></Field>
          <Field label="City" error={fe.city}><input className="input" value={f.city} onChange={set('city')} /></Field>
        </FormRow>
        <Field label="Address" error={fe.address}><input className="input" value={f.address} onChange={set('address')} placeholder="Street, area, pincode" /></Field>
        <FormRow>
          <Field label="Tier"><Segmented size="sm" value={f.tier} onChange={(v) => setF((x) => ({ ...x, tier: v }))} options={[{ value: 'STANDARD', label: 'Standard' }, { value: 'HUB', label: 'Hub' }]} /></Field>
          <Field label="Opens at" error={fe.openHour}><select className="select" value={f.openHour} onChange={num('openHour')}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</select></Field>
          <Field label="Closes at" error={fe.closeHour}><select className="select" value={f.closeHour} onChange={num('closeHour')}>{Array.from({ length: 24 }, (_, h) => h + 1).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</select></Field>
          {user?.role === 'ADMIN' && (
            <Field label="Operator" error={fe.operatorId} hint="Required when an administrator creates a station">
              <select className="select" value={f.operatorId} onChange={set('operatorId')}><option value="">Select operator…</option>{operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
            </Field>)}
        </FormRow>
        <Field label="Amenities">
          {loadingDetail ? <Skeleton h={28} /> : <div className="row wrap gap-6">{amenities.map((a) => <Chip key={a.id} size="sm" active={f.amenityIds.includes(a.id)} onClick={() => toggleAmenity(a.id)}>{a.name}</Chip>)}</div>}
        </Field>
        <Field label="Location" error={fe.latitude || fe.longitude} hint="Click the map to drop the pin, or type the coordinates.">
          <MapPicker value={f.latitude !== '' && f.longitude !== '' ? { lat: Number(f.latitude), lon: Number(f.longitude) } : null} onChange={({ lat, lon }) => setF((x) => ({ ...x, latitude: lat, longitude: lon }))} height={220} zoom={12} />
        </Field>
        <FormRow>
          <Field label="Latitude"><input className="input" type="number" step="0.000001" value={f.latitude} onChange={num('latitude')} /></Field>
          <Field label="Longitude"><input className="input" type="number" step="0.000001" value={f.longitude} onChange={num('longitude')} /></Field>
        </FormRow>
      </div>
    </Modal>
  );
}
