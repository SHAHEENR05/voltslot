import { AlertCircle } from 'lucide-react';

/**
 * <Field label="Email" error={errors.email} hint="..."> <input className="input" .../> </Field>
 * Pass server fieldErrors object: error={fieldErrors?.email}.  <FormRow> lays fields in a responsive grid.
 */
export default function Field({ label, error, hint, children, className = '', htmlFor }) {
  return (
    <div className={`field ${error ? 'has-error' : ''} ${className}`}>
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {error ? <div className="err"><AlertCircle size={13} />{error}</div> : hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}
export function FormRow({ children, className = '' }) { return <div className={`form-row ${className}`}>{children}</div>; }
