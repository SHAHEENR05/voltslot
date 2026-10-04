import { useMemo } from 'react';
import { format } from 'date-fns';

/**
 * Generic horizontal time-line (gantt-like).
 * <Gantt rows=[{key,label,sub,bars:[{key,start:Date,end:Date,tone,label,title,onClick}]}] start={Date} end={Date} nowAt={Date?} labelWidth={170} />
 * tone: primary | green | amber | red | violet | pink | blue | grey
 */
export default function Gantt({ rows, start, end, nowAt, labelWidth = 170, minWidth = 640, emptyText = 'Nothing scheduled', rowHeight = 44 }) {
  const t0 = start.getTime(), t1 = end.getTime(), span = Math.max(1, t1 - t0);
  const pos = (d) => ((d.getTime() - t0) / span) * 100;
  const ticks = useMemo(() => {
    const hours = span / 3600000;
    const step = hours <= 14 ? 1 : hours <= 26 ? 2 : Math.ceil(hours / 12);
    const first = new Date(start); first.setMinutes(0, 0, 0);
    if (first < start) first.setHours(first.getHours() + 1);
    const out = [];
    for (let t = new Date(first); t <= end; t = new Date(t.getTime() + step * 3600000)) out.push(new Date(t));
    return out;
  }, [start, end, span]); // eslint-disable-line
  const showNow = nowAt && nowAt >= start && nowAt <= end;
  const gridStyle = { gridTemplateColumns: `${labelWidth}px minmax(0, 1fr)` };
  return (
    <div className="gantt-scroll">
      <div className="gantt" style={{ minWidth: minWidth + labelWidth }}>
        <div className="gantt-head" style={gridStyle}>
          <div className="gantt-corner" />
          <div className="gantt-axis">
            {ticks.map((t) => <span key={t.getTime()} style={{ left: `${pos(t)}%` }}>{format(t, 'HH:mm')}</span>)}
          </div>
        </div>
        {rows.length === 0 && <div className="gantt-empty">{emptyText}</div>}
        {rows.map((r) => (
          <div className="gantt-row" key={r.key} style={{ ...gridStyle, minHeight: rowHeight }}>
            <div className="gantt-label" title={`${r.label} ${r.sub || ''}`}>
              <div className="gl-main truncate">{r.label}</div>
              {r.sub && <div className="gl-sub truncate">{r.sub}</div>}
            </div>
            <div className="gantt-track">
              {ticks.map((t) => <i key={t.getTime()} className="gantt-grid" style={{ left: `${pos(t)}%` }} />)}
              {showNow && <i className="gantt-now" style={{ left: `${pos(nowAt)}%` }} />}
              {r.bars.map((b) => {
                const l = Math.max(0, pos(b.start)), rgt = Math.min(100, pos(b.end));
                if (rgt <= 0 || l >= 100) return null;
                const Tag = b.onClick ? 'button' : 'div';
                return (
                  <Tag key={b.key} type={b.onClick ? 'button' : undefined} className={`gantt-bar ${b.tone || 'primary'} ${b.onClick ? 'clickable' : ''}`} style={{ left: `${l}%`, width: `${Math.max(0.8, rgt - l)}%` }} title={b.title} onClick={b.onClick}>
                    <span className="truncate">{b.label}</span>
                  </Tag>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
