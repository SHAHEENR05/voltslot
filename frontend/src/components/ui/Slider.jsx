import { useRef } from 'react';

/**
 * Slider: dual-thumb when `value` is [lo,hi], single native range when a number.
 * <Slider min={0} max={100} value={[20,80]} onChange={([a,b])=>..} step={1} minGap={5} format={(v)=>v+'%'} />
 */
export default function Slider({ min = 0, max = 100, step = 1, value, onChange, minGap = 1, format, showValues = false, ticks, ariaLabel }) {
  const ref = useRef(null);
  if (!Array.isArray(value)) {
    const pct = ((value - min) / (max - min)) * 100;
    return <input type="range" className="range" min={min} max={max} step={step} value={value} aria-label={ariaLabel} style={{ '--pct': `${pct}%` }} onChange={(e) => onChange(Number(e.target.value))} />;
  }
  const [lo, hi] = value;
  const p = (v) => ((v - min) / (max - min)) * 100;
  const snap = (v) => Math.round(v / step) * step;
  const drag = (which) => (e) => {
    e.preventDefault();
    const rect = ref.current.getBoundingClientRect();
    const move = (ev) => {
      const x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left;
      let v = snap(min + Math.min(1, Math.max(0, x / rect.width)) * (max - min));
      if (which === 0) v = Math.min(v, hi - minGap); else v = Math.max(v, lo + minGap);
      v = Math.min(max, Math.max(min, v));
      const next = which === 0 ? [v, hi] : [lo, v];
      if (next[0] !== lo || next[1] !== hi) onChange(next);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    move(e);
  };
  const key = (which) => (e) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step : 0;
    if (!d) return; e.preventDefault();
    if (which === 0) onChange([Math.max(min, Math.min(hi - minGap, lo + d)), hi]); else onChange([lo, Math.min(max, Math.max(lo + minGap, hi + d))]);
  };
  const f = format || ((v) => v);
  return (
    <div>
      <div className="dslider" ref={ref}>
        <div className="track" />
        <div className="fill" style={{ left: `${p(lo)}%`, width: `${p(hi) - p(lo)}%` }} />
        {ticks?.map((t) => <span key={t} className="tick" style={{ left: `${p(t)}%` }} />)}
        <div className="thumb" tabIndex={0} role="slider" aria-valuemin={min} aria-valuemax={max} aria-valuenow={lo} aria-label="minimum" style={{ left: `${p(lo)}%` }} onPointerDown={drag(0)} onKeyDown={key(0)} />
        <div className="thumb hi" tabIndex={0} role="slider" aria-valuemin={min} aria-valuemax={max} aria-valuenow={hi} aria-label="maximum" style={{ left: `${p(hi)}%` }} onPointerDown={drag(1)} onKeyDown={key(1)} />
      </div>
      {showValues && <div className="row between small muted mt-4"><span>{f(lo)}</span><span>{f(hi)}</span></div>}
    </div>
  );
}
