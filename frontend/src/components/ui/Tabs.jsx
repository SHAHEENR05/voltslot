/** <Tabs tabs={[{value,label,count?,icon?}]} value onChange /> underline tabs */
export default function Tabs({ tabs, value, onChange, className = '' }) {
  return (
    <div className={`tabs ${className}`} role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} className={value === t.value ? 'active' : ''} onClick={() => onChange(t.value)}>
          {t.icon}{t.label}{t.count !== undefined && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
