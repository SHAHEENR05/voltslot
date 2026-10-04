import { Download, FileText, RotateCcw, CalendarRange, MapPin, PlugZap, Layers, Building2 } from 'lucide-react';
import { format, subDays, subMonths, subYears, addDays } from 'date-fns';
import { Segmented, Button } from '../ui';
import { parseLocal } from '../../lib/format.js';

export const ALL_FROM = '2025-10-01';
export const PRESET_OPTIONS = [
  { value: '30D', label: '30D' }, { value: '90D', label: '90D' }, { value: '6M', label: '6M' },
  { value: '1Y', label: '1Y' }, { value: 'ALL', label: 'All' }, { value: 'CUSTOM', label: 'Custom' },
];
export const DEFAULT_FILTERS = { preset: '90D', from: '', to: '', zone: '', connector: '', tier: '', operatorId: '' };
const ymd = (d) => format(d, 'yyyy-MM-dd');

/** Filters -> API query params (dates resolved against the app clock, never the browser clock). */
export function buildParams(f, today, forcedOperatorId) {
  const t = parseLocal(today);
  let from, to = today;
  switch (f.preset) {
    case '30D': from = ymd(subDays(t, 29)); break;
    case '6M': from = ymd(addDays(subMonths(t, 6), 1)); break;
    case '1Y': from = ymd(addDays(subYears(t, 1), 1)); break;
    case 'ALL': from = ALL_FROM; break;
    case 'CUSTOM': from = f.from || ymd(subDays(t, 89)); to = f.to || today; if (from > to) [from, to] = [to, from]; break;
    default: from = ymd(subDays(t, 89));
  }
  const p = { from, to };
  if (f.zone) p.zone = f.zone;
  if (f.connector) p.connector = f.connector;
  if (f.tier) p.tier = f.tier;
  const op = forcedOperatorId || f.operatorId;
  if (op) p.operatorId = op;
  return p;
}

export const rangeLabel = (p) => {
  const a = parseLocal(p.from), b = parseLocal(p.to);
  return `${format(a, a.getFullYear() === b.getFullYear() ? 'd MMM' : 'd MMM yyyy')} – ${format(b, 'd MMM yyyy')}`;
};
export const activeCount = (f) => ['zone', 'connector', 'tier', 'operatorId'].filter((k) => f[k]).length + (f.preset !== '90D' ? 1 : 0);

export function FilterBar({ f, setF, today, zones, connectors, operators, isAdmin, scopeLabel, exporting, onExport, onPrint }) {
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const dirty = activeCount(f) > 0;
  const sel = (key, icon, label, options) => (
    <label className={`ins-sel ${f[key] ? 'on' : ''}`} title={label}>
      {icon}
      <select className="select sm" value={f[key]} onChange={(e) => set({ [key]: e.target.value })} aria-label={label}>
        <option value="">{label}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );

  return (
    <div className="ins-filterbar">
      <div className="ins-filters">
        <div className="ins-range">
          <CalendarRange size={16} className="ins-range-ico" />
          <Segmented size="sm" options={PRESET_OPTIONS} value={f.preset} onChange={(preset) => set({ preset })} />
          {f.preset === 'CUSTOM' && (
            <div className="ins-dates pop-in">
              <input type="date" className="input sm" aria-label="From date" value={f.from || ''} max={f.to || today} onChange={(e) => set({ from: e.target.value })} />
              <span className="muted">to</span>
              <input type="date" className="input sm" aria-label="To date" value={f.to || today} min={f.from || undefined} max={today} onChange={(e) => set({ to: e.target.value })} />
            </div>
          )}
        </div>
        <div className="ins-selects">
          {sel('zone', <MapPin size={14} />, 'All zones', zones.map((z) => ({ value: z, label: z })))}
          {sel('connector', <PlugZap size={14} />, 'All connectors', connectors.map((c) => ({ value: c.code, label: c.displayName || c.code })))}
          {sel('tier', <Layers size={14} />, 'All tiers', [{ value: 'HUB', label: 'Hub' }, { value: 'STANDARD', label: 'Standard' }])}
          {isAdmin
            ? sel('operatorId', <Building2 size={14} />, 'All operators', operators.map((o) => ({ value: String(o.id), label: o.name })))
            : scopeLabel && <span className="ins-scope"><Building2 size={13} />{scopeLabel}</span>}
        </div>
        <div className="ins-actions">
          {dirty && <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={() => setF(DEFAULT_FILTERS)}>Reset</Button>}
          <Button size="sm" variant="ghost" icon={<FileText size={14} />} onClick={onPrint} title="Print or save as PDF"><span className="hide-sm">Print</span></Button>
          <Button size="sm" icon={<Download size={14} />} loading={exporting} onClick={onExport}><span className="hide-sm">Export </span>CSV</Button>
        </div>
      </div>
    </div>
  );
}
