import { useEffect, useMemo, useState } from 'react';
import { Button, Field, FormRow, Modal } from '../ui';
import { useReference } from '../../lib/reference.jsx';
import { useToast } from '../../lib/toast.jsx';
import { api } from '../../lib/api.js';
import { CONNECTOR_LABEL } from '../../lib/constants.js';

/** Add / edit vehicle. vehicle=null -> create. Binds server fieldErrors (modelId, regNumber, nickname, avgDailyKm). */
export default function VehicleModal({ open, vehicle, onClose, onSaved }) {
  const { vehicleModels, loading: refLoading } = useReference();
  const toast = useToast();
  const editing = !!vehicle;
  const [f, setF] = useState({ modelId: '', regNumber: '', nickname: '', avgDailyKm: 30 });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setF(vehicle ? { modelId: String(vehicle.modelId), regNumber: vehicle.regNumber, nickname: vehicle.nickname || '', avgDailyKm: vehicle.avgDailyKm } : { modelId: '', regNumber: '', nickname: '', avgDailyKm: 30 });
      setErrors({});
    }
  }, [open, vehicle]);
  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); };
  const groups = useMemo(() => {
    const m = new Map();
    vehicleModels.forEach((x) => { if (!m.has(x.make)) m.set(x.make, []); m.get(x.make).push(x); });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [vehicleModels]);
  const model = vehicleModels.find((m) => String(m.id) === String(f.modelId));

  const submit = async (e) => {
    e?.preventDefault();
    const errs = {};
    if (!f.modelId) errs.modelId = 'Choose your vehicle model';
    if (!f.regNumber.trim()) errs.regNumber = 'Registration number is required';
    const km = Number(f.avgDailyKm);
    if (f.avgDailyKm === '' || Number.isNaN(km) || km < 1 || km > 500) errs.avgDailyKm = 'Enter 1 to 500 km';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    const body = { modelId: Number(f.modelId), regNumber: f.regNumber.trim().toUpperCase(), nickname: f.nickname.trim() || null, avgDailyKm: km };
    try {
      const saved = editing ? await api.put(`/vehicles/${vehicle.id}`, body) : await api.post('/vehicles', body);
      toast.success(editing ? 'Vehicle updated' : `${saved.make} ${saved.model} added to your garage`);
      onSaved(saved);
    } catch (err) {
      if (err.fieldErrors && Object.keys(err.fieldErrors).length) setErrors(err.fieldErrors); else toast.error(err);
      if (err.status === 409 && !err.fieldErrors?.regNumber) setErrors({ regNumber: err.message });
    } finally { setSaving(false); }
  };

  return (
    <Modal open={open} title={editing ? 'Edit vehicle' : 'Add a vehicle'} onClose={saving ? undefined : onClose}
      footer={<><Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button><Button loading={saving} onClick={submit}>{editing ? 'Save changes' : 'Add vehicle'}</Button></>}>
      <form onSubmit={submit} className="col gap-16" noValidate>
        <Field label="Vehicle model" error={errors.modelId} htmlFor="veh-model">
          <select id="veh-model" className="select" value={f.modelId} onChange={set('modelId')} disabled={refLoading}>
            <option value="">{refLoading ? 'Loading models…' : 'Select make & model'}</option>
            {groups.map(([make, list]) => (
              <optgroup key={make} label={make}>{list.map((m) => <option key={m.id} value={m.id}>{m.model} {m.variant} - {m.rangeKm} km</option>)}</optgroup>
            ))}
          </select>
        </Field>
        {model && (
          <div className="veh-preview fade-in">
            <div><span className="f-label">Battery</span><b>{model.batteryKwh} kWh</b></div>
            <div><span className="f-label">Range</span><b>{model.rangeKm} km</b></div>
            <div><span className="f-label">DC / AC</span><b>{model.dcMaxKw > 0 ? `${model.dcMaxKw}` : '–'} / {model.acMaxKw} kW</b></div>
            <div><span className="f-label">Ports</span><b>{model.connectorCodes.map((c) => CONNECTOR_LABEL[c] || c).join(', ')}</b></div>
          </div>
        )}
        <FormRow>
          <Field label="Registration number" error={errors.regNumber} htmlFor="veh-reg" hint="e.g. MH04 EV 2481">
            <input id="veh-reg" className="input" value={f.regNumber} onChange={set('regNumber')} maxLength={20} placeholder="MH04 EV 1234" autoComplete="off" style={{ textTransform: 'uppercase' }} />
          </Field>
          <Field label="Nickname (optional)" error={errors.nickname} htmlFor="veh-nick">
            <input id="veh-nick" className="input" value={f.nickname} onChange={set('nickname')} maxLength={40} placeholder="Daily driver" />
          </Field>
        </FormRow>
        <Field label="Average daily distance (km)" error={errors.avgDailyKm} htmlFor="veh-km" hint="Helps VoltSlot predict when you will need to charge when there is little history.">
          <input id="veh-km" type="number" min={1} max={500} className="input" value={f.avgDailyKm} onChange={set('avgDailyKm')} />
        </Field>
      </form>
    </Modal>
  );
}
