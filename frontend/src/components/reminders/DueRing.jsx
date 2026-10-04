import { clamp, parseLocal } from '../../lib/format.js';
import { STATE_META, humanHours } from './reminderUtil.js';

/** Progress ring of the charging cycle: fills from the last charge to the predicted due time. Centre shows "due in 14 h" / "overdue 5 h". */
export default function DueRing({ prediction: p, now, size = 104, stroke = 9 }) {
  const meta = STATE_META[p.state] || STATE_META.NO_DATA;
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const due = p.nextDueAt ? parseLocal(p.nextDueAt) : null, last = p.lastChargeAt ? parseLocal(p.lastChargeAt) : null;
  const noData = p.state === 'NO_DATA' || !due;
  const hours = noData ? 0 : (due - now) / 3600000;
  const frac = noData || !last ? 0 : clamp((now - last) / Math.max(1, due - last), 0, 1);
  return (
    <span className="ring due-ring" style={{ width: size, height: size }} title={noData ? 'Not enough charging history yet' : `Due ${p.nextDueAt}`}>
      <svg width={size} height={size}>
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle className="ring-arc" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" stroke={meta.color}
          strokeDasharray={c} strokeDashoffset={c * (1 - (noData ? 0 : Math.max(0.04, frac)))} style={{ filter: `drop-shadow(0 0 6px ${meta.color}77)` }} />
      </svg>
      <span className="ring-label">
        {noData ? <b style={{ fontSize: size * 0.2 }}>–</b> : <b style={{ fontSize: size * 0.22 }}>{Math.abs(hours) < 0.25 ? 'now' : humanHours(hours, true)}</b>}
        <span className="faint" style={{ fontSize: 10.5 }}>{noData ? 'no data' : Math.abs(hours) < 0.25 ? 'due' : hours < 0 ? 'overdue' : 'due in'}</span>
      </span>
    </span>
  );
}
