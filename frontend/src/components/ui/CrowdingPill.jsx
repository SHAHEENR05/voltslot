import { CROWD } from '../../lib/constants.js';

/** <CrowdingPill level="LOW|MEDIUM|HIGH" index={34} short /> */
export default function CrowdingPill({ level, index, short, live }) {
  const c = CROWD[level] || { cls: 'grey', label: '–' };
  return <span className={`pill ${c.cls} ${live ? 'live' : ''}`}><span className="dot" />{short ? c.label : `${c.label} crowd`}{index !== undefined && index !== null ? ` · ${Math.round(index)}` : ''}</span>;
}
