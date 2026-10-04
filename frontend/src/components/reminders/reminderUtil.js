// Shared helpers for the smart-reminder feature (popup + /reminders + garage mini cards).
export const REMINDERS_CHANGED = 'chargeiq:reminders-changed'; // fired after any snooze/dismiss/book/demo-trigger so everything refetches
export const REMINDERS_SHOW = 'chargeiq:reminders-show';       // fired to re-open reminders that were closed this session
const KEY = 'chargeiq.reminders.handled';

export const notifyRemindersChanged = () => { try { window.dispatchEvent(new Event(REMINDERS_CHANGED)); } catch { /* */ } };
export const showRemindersAgain = () => { clearHandled(); try { window.dispatchEvent(new Event(REMINDERS_SHOW)); } catch { /* */ } };

/** Reminder ids the driver already closed in this browser session (sessionStorage) - we do not nag again. */
export function getHandled() { try { return new Set(JSON.parse(sessionStorage.getItem(KEY) || '[]')); } catch { return new Set(); } }
export function markHandled(id) { try { const s = getHandled(); s.add(id); sessionStorage.setItem(KEY, JSON.stringify([...s])); } catch { /* */ } }
export function clearHandled() { try { sessionStorage.removeItem(KEY); } catch { /* */ } }

export const STATE_META = {
  UPCOMING: { label: 'Upcoming', cls: 'primary', color: '#22d3ee' },
  DUE_SOON: { label: 'Due soon', cls: 'amber', color: '#fbbf24' },
  OVERDUE: { label: 'Overdue', cls: 'red', color: '#f87171' },
  NO_DATA: { label: 'No data yet', cls: 'grey', color: '#8b9bb8' },
};

/** 0.4 -> "24 min", 14.2 -> "14 h", 60 -> "2.5 days" */
export function humanHours(h, short = false) {
  const a = Math.abs(h);
  if (a < 1) return `${Math.max(1, Math.round(a * 60))} min`;
  if (a < 48) return `${Math.round(a)} h`;
  const d = a / 24;
  return `${d.toFixed(d < 10 ? 1 : 0)}${short ? ' d' : ' days'}`;
}

/** "5 days ago" / "9 h ago" / "earlier today" from whole elapsed time (not calendar days). */
export function agoText(last, now) {
  const h = (now - last) / 3600000;
  if (h < 1) return 'just now';
  if (h < 24) return `${Math.floor(h)} h ago`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? 'day' : 'days'} ago`;
}

/** "Tata Nexon EV "Nexon" · MH04 EV 2481" -> { name, reg } */
export function splitLabel(label = '') {
  const i = label.lastIndexOf('·');
  return i < 0 ? { name: label, reg: '' } : { name: label.slice(0, i).trim(), reg: label.slice(i + 1).trim() };
}

export const confidenceLabel = (c) => (c >= 0.7 ? 'High' : c >= 0.45 ? 'Medium' : 'Low');
export const confidenceCls = (c) => (c >= 0.7 ? 'green' : c >= 0.45 ? '' : 'amber');
