import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Save, KeyRound, MapPinned, LocateFixed, X, BellRing, UserRound, Wallet, ShieldAlert, Building2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import { api } from '../lib/api.js';
import { inr, initials, titleCase } from '../lib/format.js';
import { Badge, Button, Card, Field, FormRow, Slider, Toggle } from '../components/ui';
import MapPicker from '../components/map/MapPicker.jsx';

const fromUser = (u) => ({ fullName: u.fullName || '', phone: u.phone || '', city: u.city || '', home: u.homeLat != null && u.homeLon != null ? { lat: u.homeLat, lon: u.homeLon } : null, reminderEnabled: u.reminderEnabled, reminderLeadHours: u.reminderLeadHours });

/** Profile: account details, home location (MapPicker), reminder preferences and change-password. */
export default function Profile() {
  const { user, refreshUser } = useAuth();
  const toast = useToast();
  const [f, setF] = useState(() => fromUser(user));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { setF(fromUser(user)); }, [user]); // eslint-disable-line
  const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };
  const dirty = JSON.stringify(f) !== JSON.stringify(fromUser(user));

  const save = async (e) => {
    e?.preventDefault();
    if (!f.fullName.trim()) { setErrors({ fullName: 'Full name is required' }); return; }
    setSaving(true);
    try {
      await api.put('/users/me', { fullName: f.fullName.trim(), phone: f.phone.trim() || null, city: f.city.trim() || null, homeLat: f.home?.lat ?? null, homeLon: f.home?.lon ?? null, reminderEnabled: f.reminderEnabled, reminderLeadHours: f.reminderLeadHours });
      await refreshUser();
      toast.success('Profile saved');
    } catch (ex) { if (ex.fieldErrors && Object.keys(ex.fieldErrors).length) setErrors(ex.fieldErrors); else toast.error(ex); }
    finally { setSaving(false); }
  };
  const locate = () => {
    if (!navigator.geolocation) { toast.error('Location is not available in this browser.'); return; }
    navigator.geolocation.getCurrentPosition((p) => set('home', { lat: +p.coords.latitude.toFixed(6), lon: +p.coords.longitude.toFixed(6) }), () => toast.error('Could not read your location. Click the map instead.'), { timeout: 6000 });
  };

  return (
    <div className="page">
      <div className="page-head"><div><h1>Profile</h1><p>Your details, home location and reminder preferences.</p></div>
        <Button icon={<Save size={16} />} loading={saving} disabled={!dirty} onClick={save}>Save changes</Button></div>

      <div className="profile-layout">
        <div className="col gap-16">
          <Card hero className="profile-id">
            <div className="row gap-16 wrap">
              <div className="avatar-lg">{initials(user.fullName)}</div>
              <div className="grow min0">
                <h2 className="truncate">{user.fullName}</h2>
                <div className="muted truncate">{user.email}</div>
                <div className="row wrap gap-6 mt-8">
                  <Badge tone="primary">{titleCase(user.role)}</Badge>
                  {user.operatorName && <Badge tone="violet"><Building2 size={11} />{user.operatorName}</Badge>}
                  {user.fleetName && <Badge tone="violet"><Building2 size={11} />{user.fleetName}</Badge>}
                </div>
              </div>
            </div>
            <div className="profile-stats">
              <Link to="/wallet" className="profile-stat"><span className="f-label"><Wallet size={11} /> Wallet</span><b>{inr(user.walletBalance, { decimals: 2 })}</b></Link>
              <div className="profile-stat"><span className="f-label"><ShieldAlert size={11} /> No-shows</span><b className={user.noShowCount > 0 ? 'text-amber' : ''}>{user.noShowCount}</b></div>
            </div>
          </Card>

          <Card title="Change password" icon={<KeyRound size={16} className="text-primary" />}><PasswordForm /></Card>
        </div>

        <div className="col gap-16">
          <Card title="Personal details" icon={<UserRound size={16} className="text-primary" />}>
            <form onSubmit={save} className="col gap-16" noValidate>
              <Field label="Full name" error={errors.fullName} htmlFor="pf-name"><input id="pf-name" className="input" value={f.fullName} onChange={(e) => set('fullName', e.target.value)} maxLength={100} /></Field>
              <FormRow>
                <Field label="Email" hint="Email cannot be changed" htmlFor="pf-email"><input id="pf-email" className="input" value={user.email} disabled /></Field>
                <Field label="Phone" error={errors.phone} htmlFor="pf-phone"><input id="pf-phone" className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} maxLength={20} inputMode="tel" /></Field>
              </FormRow>
              <Field label="City" error={errors.city} htmlFor="pf-city"><input id="pf-city" className="input" value={f.city} onChange={(e) => set('city', e.target.value)} maxLength={40} /></Field>
            </form>
          </Card>

          <Card title="Home location" subtitle="Used to suggest chargers near you and for reminders" icon={<MapPinned size={16} className="text-primary" />}
            actions={<><Button size="sm" variant="ghost" icon={<LocateFixed size={14} />} onClick={locate}>Use my location</Button>{f.home && <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => set('home', null)}>Clear</Button>}</>}>
            <MapPicker value={f.home} onChange={(h) => set('home', h)} height={260} />
            {errors.homeLat && <div className="field has-error mt-8"><div className="err">{errors.homeLat}</div></div>}
          </Card>

          <Card title="Reminder preferences" subtitle="Smart recharge reminders" icon={<BellRing size={16} className="text-primary" />}>
            <div className="row between gap-12">
              <div><b>Recharge reminders</b><div className="muted small">Pop up when a vehicle is due. <Link to="/reminders">See predictions</Link></div></div>
              <Toggle checked={f.reminderEnabled} onChange={(v) => set('reminderEnabled', v)} label="Recharge reminders" />
            </div>
            <div className={`mt-16 ${f.reminderEnabled ? '' : 'rem-disabled'}`}>
              <div className="row between small"><span className="muted">Remind me before due</span><b>{f.reminderLeadHours} h</b></div>
              <Slider min={1} max={72} step={1} value={f.reminderLeadHours} onChange={(v) => set('reminderLeadHours', v)} ariaLabel="Lead hours" />
              {errors.reminderLeadHours && <div className="field has-error"><div className="err">{errors.reminderLeadHours}</div></div>}
            </div>
          </Card>
          <div className="row" style={{ justifyContent: 'flex-end' }}><Button size="lg" icon={<Save size={16} />} loading={saving} disabled={!dirty} onClick={save}>Save changes</Button></div>
        </div>
      </div>
    </div>
  );
}

function PasswordForm() {
  const toast = useToast();
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); };
  const submit = async (e) => {
    e.preventDefault();
    const er = {};
    if (!f.currentPassword) er.currentPassword = 'Enter your current password';
    if (f.newPassword.length < 8 || f.newPassword.length > 64) er.newPassword = 'Password must be 8-64 characters';
    else if (!/[A-Za-z]/.test(f.newPassword) || !/\d/.test(f.newPassword)) er.newPassword = 'Password must contain a letter and a digit';
    if (f.confirm !== f.newPassword) er.confirm = 'Passwords do not match';
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    try { await api.post('/auth/change-password', { currentPassword: f.currentPassword, newPassword: f.newPassword }); toast.success('Password changed'); setF({ currentPassword: '', newPassword: '', confirm: '' }); }
    catch (ex) { if (ex.fieldErrors && Object.keys(ex.fieldErrors).length) setErrors(ex.fieldErrors); else { setErrors({ currentPassword: ex.message }); } }
    finally { setBusy(false); }
  };
  const type = show ? 'text' : 'password';
  return (
    <form onSubmit={submit} className="col gap-12" noValidate>
      <Field label="Current password" error={errors.currentPassword} htmlFor="pw-cur"><input id="pw-cur" type={type} className="input" value={f.currentPassword} onChange={set('currentPassword')} autoComplete="current-password" /></Field>
      <Field label="New password" error={errors.newPassword} hint="8-64 characters with a letter and a digit" htmlFor="pw-new"><input id="pw-new" type={type} className="input" value={f.newPassword} onChange={set('newPassword')} autoComplete="new-password" /></Field>
      <Field label="Confirm new password" error={errors.confirm} htmlFor="pw-conf"><input id="pw-conf" type={type} className="input" value={f.confirm} onChange={set('confirm')} autoComplete="new-password" /></Field>
      <div className="row between">
        <button type="button" className="btn link" onClick={() => setShow((s) => !s)}>{show ? <EyeOff size={14} /> : <Eye size={14} />}{show ? 'Hide' : 'Show'} passwords</button>
        <Button type="submit" loading={busy}>Update password</Button>
      </div>
    </form>
  );
}
