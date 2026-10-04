/** <Segmented options={[{value,label,icon}]} value onChange size="sm" block /> - options may be plain strings. */
export default function Segmented({ options, value, onChange, size, block, className = '' }) {
  return (
    <div className={`segmented ${size || ''} ${block ? 'block' : ''} ${className}`} role="tablist">
      {options.map((o) => {
        const opt = typeof o === 'object' ? o : { value: o, label: o };
        return <button key={opt.value} type="button" role="tab" aria-selected={value === opt.value} className={value === opt.value ? 'active' : ''} onClick={() => onChange(opt.value)}>{opt.icon}{opt.label}</button>;
      })}
    </div>
  );
}
