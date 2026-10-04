import { SlidersHorizontal, RotateCcw } from 'lucide-react';
import Popover from '../ui/Popover.jsx';
import Button from '../ui/Button.jsx';
import Slider from '../ui/Slider.jsx';
import { WEIGHT_KEYS } from '../../lib/constants.js';

/** Popover with six importance sliders (0-100). weights = {distance,wait,...} (0..1). Server re-normalises to 100 %. */
export default function AdvancedWeights({ weights, onChange, onReset, custom }) {
  const sum = WEIGHT_KEYS.reduce((s, k) => s + (weights[k.key] || 0), 0) || 1;
  return (
    <Popover align="right" width={330} trigger={(open, toggle) => (
      <Button size="sm" variant={custom ? 'primary' : 'ghost'} icon={<SlidersHorizontal size={14} />} onClick={toggle} aria-expanded={open}>{custom ? 'Custom weights' : 'Advanced weights'}</Button>
    )}>
      {() => (
        <div style={{ padding: 16 }} className="col gap-12">
          <div className="row between"><b>How much does each factor matter?</b><button className="btn link small" onClick={onReset}><RotateCcw size={12} /> Reset</button></div>
          {WEIGHT_KEYS.map((k) => (
            <div key={k.key}>
              <div className="row between small"><span className="row gap-6"><span className="legend-dot" style={{ background: k.color }} />{k.label}</span><b style={{ color: k.color }}>{Math.round(((weights[k.key] || 0) / sum) * 100)}%</b></div>
              <Slider min={0} max={100} value={Math.round((weights[k.key] || 0) * 100)} onChange={(v) => onChange({ ...weights, [k.key]: v / 100 })} ariaLabel={k.label} />
            </div>
          ))}
          <div className="faint xs">Weights are re-normalised so they always add up to 100 %.</div>
        </div>
      )}
    </Popover>
  );
}
