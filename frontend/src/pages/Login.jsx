import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogIn, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import AuthShell from './AuthShell.jsx';
import { useAuth, homeFor } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import Button from '../components/ui/Button.jsx';
import Field from '../components/ui/Field.jsx';

export const DEMO_ACCOUNTS = [
  { label: 'Driver – Aarav', email: 'demo@voltslot.in', password: 'User@123', hint: 'Reminder active' },
  { label: 'Driver – Rahul (overdue)', email: 'rahul@voltslot.in', password: 'User@123' },
  { label: 'Fleet manager', email: 'fleet@voltslot.in', password: 'Fleet@123' },
  { label: 'Operator', email: 'operator@voltslot.in', password: 'Operator@123' },
  { label: 'Admin', email: 'admin@voltslot.in', password: 'Admin@123' },
];

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate(); const loc = useLocation(); const toast = useToast();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [show, setShow] = useState(false); const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({}); const [formError, setFormError] = useState('');

  const go = (user) => {
    const from = loc.state?.from;
    const target = from?.pathname && from.pathname !== '/login' ? from.pathname + (from.search || '') : homeFor(user);
    toast.success(`Welcome back, ${user.fullName.split(' ')[0]}!`);
    nav(target, { replace: true, state: loc.state?.openBooking ? { openBooking: loc.state.openBooking } : null });
  };
  const submit = async (e, creds) => {
    e?.preventDefault();
    const em = creds?.email ?? email.trim(), pw = creds?.password ?? password;
    const errs = {};
    if (!em) errs.email = 'Email is required'; else if (!/^\S+@\S+\.\S+$/.test(em)) errs.email = 'Enter a valid email';
    if (!pw) errs.password = 'Password is required';
    setErrors(errs); setFormError('');
    if (Object.keys(errs).length) return;
    setBusy(true);
    try { go(await login(em, pw)); }
    catch (err) { setErrors(err.fieldErrors || {}); setFormError(err.message); setBusy(false); }
  };
  const demo = (a) => { setEmail(a.email); setPassword(a.password); submit(null, a); };

  return (
    <AuthShell>
      <h1>Sign in</h1>
      <p className="muted mt-4 mb-16">Welcome back – let’s find you a charger.</p>
      <form className="col gap-12" onSubmit={submit} noValidate>
        {formError && <div className="form-error-banner">{formError}</div>}
        <Field label="Email" error={errors.email}>
          <div className="input-wrap"><Mail size={16} /><input className="input" type="email" autoComplete="username" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        </Field>
        <Field label="Password" error={errors.password}>
          <div className="input-wrap"><Lock size={16} />
            <input className="input" type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} style={{ paddingRight: 40 }} />
            <button type="button" className="btn link" style={{ position: 'absolute', right: 12, top: 12, color: 'var(--faint)' }} onClick={() => setShow((s) => !s)} aria-label="Toggle password">{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
        </Field>
        <Button variant="primary" size="lg" type="submit" loading={busy} icon={<LogIn size={17} />} block>Sign in</Button>
      </form>
      <div className="row gap-8 mt-16 muted" style={{ fontSize: 12 }}><hr className="divider grow" style={{ margin: 0 }} />Demo accounts – one click<hr className="divider grow" style={{ margin: 0 }} /></div>
      <div className="demo-chips mt-12">
        {DEMO_ACCOUNTS.map((a) => <button key={a.email} type="button" className="chip" disabled={busy} onClick={() => demo(a)}>{a.label}</button>)}
      </div>
      <p className="muted small mt-24 center">New to VoltSlot? <Link to="/register">Create an account</Link> · <Link to="/">Browse as guest</Link></p>
    </AuthShell>
  );
}
