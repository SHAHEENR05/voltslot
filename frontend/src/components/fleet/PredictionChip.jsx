const MAP = {
  UPCOMING: { cls: 'primary', label: 'Upcoming' },
  DUE_SOON: { cls: 'amber', label: 'Due soon' },
  OVERDUE: { cls: 'red', label: 'Overdue' },
  NO_DATA: { cls: 'grey', label: 'No data' },
};
export const PRED_COLOR = { UPCOMING: 'var(--primary)', DUE_SOON: 'var(--amber)', OVERDUE: 'var(--red)', NO_DATA: 'var(--faint)' };
/** Recharge-prediction state chip: UPCOMING / DUE_SOON / OVERDUE / NO_DATA */
export default function PredictionChip({ state }) {
  const s = MAP[state] || MAP.NO_DATA;
  return <span className={`pill ${s.cls}`}><span className="dot" />{s.label}</span>;
}
