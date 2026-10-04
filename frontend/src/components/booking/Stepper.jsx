import { Check, SlidersHorizontal, Timer, CreditCard, PartyPopper } from 'lucide-react';

const STEPS = [
  { key: 'plan', label: 'Plan', icon: SlidersHorizontal },
  { key: 'hold', label: 'Hold', icon: Timer },
  { key: 'pay', label: 'Pay', icon: CreditCard },
  { key: 'done', label: 'Done', icon: PartyPopper },
];
export const STEP_ORDER = STEPS.map((s) => s.key);

/** 4-step progress: Plan -> Hold -> Pay -> Done. */
export default function Stepper({ step }) {
  const cur = STEP_ORDER.indexOf(step);
  return (
    <ol className="bk-stepper" aria-label="Booking progress">
      {STEPS.map((s, i) => {
        const state = i < cur || step === 'done' ? 'done' : i === cur ? 'active' : 'todo';
        const Icon = s.icon;
        return (
          <li key={s.key} className={`bk-step ${state}`} aria-current={i === cur ? 'step' : undefined}>
            <span className="bk-step-dot">{state === 'done' ? <Check size={14} strokeWidth={3} /> : <Icon size={14} />}</span>
            <span className="bk-step-label">{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
