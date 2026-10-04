import { Zap } from 'lucide-react';
import { CONNECTOR_LABEL } from '../../lib/constants.js';
import { kw } from '../../lib/format.js';

const AC = new Set(['TYPE2']);
/** Connector badges for a StationSummaryDto.connectors list: <ConnectorBadges connectors={[{code,count,maxKw}]} /> */
export default function ConnectorBadges({ connectors = [], max = 5 }) {
  return (
    <span className="row wrap gap-6">
      {connectors.slice(0, max).map((c) => (
        <span key={c.code} className={`conn-badge ${AC.has(c.code) ? 'ac' : 'dc'}`} title={`${c.count} × ${CONNECTOR_LABEL[c.code] || c.code}, up to ${kw(c.maxKw)}`}>
          <Zap size={10} fill="currentColor" />{CONNECTOR_LABEL[c.code] || c.code}<small>×{c.count} · {kw(c.maxKw)}</small>
        </span>
      ))}
    </span>
  );
}
