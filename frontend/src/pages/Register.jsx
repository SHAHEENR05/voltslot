import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import AuthShell from './AuthShell.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import Button from '../components/ui/Button.jsx';
import Field, { FormRow } from '../components/ui/Field.jsx';

export default function Register() {
  const { register } = useAuth(); const nav = useNavigate(); const loc = useLocation(); const toast = useToast();
  const [f, setF] = useState({ fullName: '', email: '', password: '', phone: '', city: '' });
  const [errors, setErrors] = useState({}); const [formError, setFormError] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const validate = () => {
    const e = {};
    if (!f.fullName.trim()) e.fullName = 'Full name is required';
    if (!f.email.trim()) e.email = 'Email is required'; else if (!/^\S+@\S+\.\S+$/.test(f.email)) e.email = 'Email is not valid';
    if (!f.password) e.password = 'Password is required';
    else if (f.password.length < 8 || f.password.length > 64) e.password = 'Password must be 8-64 characters';
    else if (!/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)) e.password = 'Password must contain a letter and a digit';
    return e;
  };
  const submit = async (ev) => {
    ev.preventDefault();
    const e = validate(); setErrors(e); setFormError('');
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const u = await register({ ...f, fullName: f.fullName.trim(), email: f.email.trim(), phone: f.phone || undefined, city: f.city || undefined });
      toast.success(`Welcome to VoltSlot, ${u.fullName.split(' ')[0]}!`);
      const from = loc.state?.from;
      nav(from?.pathname && !['/login', '/register'].includes(from.pathname) ? from.pathname + (from.search || '') : '/', { replace: true, state: loc.state?.openBooking ? { openBooking: loc.state.openBooking } : null });
    } catch (err) { setErrors(err.fieldErrors || {}); setFormError(err.message); setBusy(false); }
  };
  return (
    <AuthShell>
      <h1>Create your account</h1>
      <p className="muted mt-4 mb-16">Book slots, get recharge reminders and track your charging.</p>
      <form className="col gap-12" onSubmit={submit} noValidate>
        {formError && <div className="form-error-banner">{formError}</div>}
        <Field label="Full name" error={errors.fullName}><input className="input" placeholder="Aarav Mehta" value={f.fullName} onChange={set('fullName')} /></Field>
        <Field label="Email" error={errors.email}><input className="input" type="email" autoComplete="username" placeholder="you@example.com" value={f.email} onChange={set('email')} /></Field>
        <Field label="Password" error={errors.password} hint="8+ characters with a letter and a digit"><input className="input" type="password" autoComplete="new-password" value={f.password} onChange={set('password')} /></Field>
        <FormRow>
          <Field label="Phone (optional)" error={errors.phone}><input className="input" inputMode="tel" placeholder="98200 00000" value={f.phone} onChange={set('phone')} /></Field>
          <Field label="City (optional)" error={errors.city}><input className="input" placeholder="Thane" value={f.city} onChange={set('city')} /></Field>
        </FormRow>
        <Button variant="primary" size="lg" type="submit" loading={busy} icon={<UserPlus size={17} />} block>Create account</Button>
      </form>
      <p className="muted small mt-24 center">Already registered? <Link to="/login" state={loc.state}>Sign in</Link></p>
    </AuthShell>
  );
}
