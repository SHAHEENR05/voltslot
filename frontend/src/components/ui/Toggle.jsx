/** <Toggle checked onChange={(bool)=>..} label? /> */
export default function Toggle({ checked, onChange, disabled, label }) {
  return <button type="button" role="switch" aria-checked={!!checked} aria-label={label} disabled={disabled} className={`toggle ${checked ? 'on' : ''}`} onClick={() => onChange?.(!checked)} />;
}
