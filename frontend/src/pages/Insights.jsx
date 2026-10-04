// Insights (PS-IV BI / analytics) - ADMIN + OPERATOR. Tabbed (?tab=), shared filter row, only the active tab fetches its endpoints
// (and sections inside a tab lazy-load when scrolled near the viewport).
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { useClock } from '../lib/clock.jsx';
import { useReference } from '../lib/reference.jsx';
import { useToast } from '../lib/toast.jsx';
import { useAsync } from '../lib/hooks.js';
import { api, download } from '../lib/api.js';
import { Tabs } from '../components/ui';
import { FilterBar, DEFAULT_FILTERS, buildParams, rangeLabel } from '../components/insights/FilterBar.jsx';
import KpiStrip from '../components/insights/KpiStrip.jsx';
import InsightCards from '../components/insights/InsightCards.jsx';
import TrendChart from '../components/insights/TrendChart.jsx';
import Heatmap from '../components/insights/Heatmap.jsx';
import ZonePerformance from '../components/insights/ZonePerformance.jsx';
import { FunnelPanel, LeadTimePanel } from '../components/insights/Funnel.jsx';
import MixDonuts from '../components/insights/MixDonuts.jsx';
import Segments from '../components/insights/Segments.jsx';
import Cohorts from '../components/insights/Cohorts.jsx';
import Leaderboard from '../components/insights/Leaderboard.jsx';
import Sentiment from '../components/insights/Sentiment.jsx';
import Weather from '../components/insights/Weather.jsx';
import SmartFeatures from '../components/insights/SmartFeatures.jsx';
import { VolumePanel, ForecastPanel } from '../components/insights/Extra.jsx';
import { ForceVisible } from '../components/insights/shared.jsx';

const HERO = ['sessions', 'energyKwh', 'revenue', 'utilizationPct'];
const SECOND = ['uniqueUsers', 'cancellationRatePct', 'noShowRatePct', 'co2AvoidedKg'];

const TABS = [
  { value: 'overview', label: 'Overview', title: 'Executive Overview', text: 'Headline numbers for the charging network, the demand curve with its forecast, and what the rules engine noticed.',
    body: (p) => (<>
      <KpiStrip params={p} keys={HERO} hero />
      <KpiStrip params={p} keys={SECOND} hero={false} />
      <TrendChart params={p} />
      <VolumePanel params={p} />
      <InsightCards params={p} />
    </>) },
  { value: 'demand', label: 'Demand & Forecast', title: 'Demand & Forecast', text: 'When drivers charge, what the next two weeks look like, and which days broke the pattern.',
    body: (p) => (<><Heatmap params={p} /><ForecastPanel params={p} /><LeadTimePanel params={p} span="s-12" /></>) },
  { value: 'stations', label: 'Stations & Zones', title: 'Stations & Zones', text: 'Where the network earns, which zones are growing and how each station performs.',
    body: (p) => (<><ZonePerformance params={p} /><Leaderboard params={p} /></>) },
  { value: 'customers', label: 'Customers', title: 'Customers', text: 'Behavioural segments, whether new drivers keep coming back, and what they drive and plug in.',
    body: (p) => (<><Segments params={p} /><Cohorts params={p} />
      <MixDonuts params={p} id="mix" dims={['connector', 'vehicleCategory']} glance={false} title="Connectors & vehicles" subtitle="Hover a slice or a legend row for its exact share" /></>) },
  { value: 'bookings', label: 'Bookings & Funnel', title: 'Bookings & Funnel', text: 'From first search to a completed charge, how far ahead drivers plan, and how they pay.',
    body: (p) => (<>
      <KpiStrip params={p} keys={['cancellationRatePct', 'noShowRatePct']} hero={false} />
      <FunnelPanel params={p} /><LeadTimePanel params={p} />
      <MixDonuts params={p} id="paymix" dims={['payment', 'source']} extra={false} glance={false} title="Payment & booking source" subtitle="How drivers pay and where bookings come from" />
    </>) },
  { value: 'reviews', label: 'Reviews & Sentiment', title: 'Reviews & Sentiment', text: 'What drivers say: sentiment split, keywords, best and worst stations, and the monthly mood.', body: (p) => <Sentiment params={p} /> },
  { value: 'weather', label: 'Weather & Events', title: 'Weather & Events', text: 'How rain, public holidays and weekends move daily sessions.', body: (p) => <Weather params={p} /> },
  { value: 'smart', label: 'Smart Features', title: 'Smart Features', text: 'The capabilities that set VoltSlot apart, each with a live view of the data behind it.', body: (p) => <SmartFeatures params={p} /> },
];

export default function Insights() {
  const { user, isAdmin } = useAuth();
  const { today } = useClock();
  const { zones, connectors } = useReference();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const tab = TABS.find((t) => t.value === sp.get('tab')) || TABS[0];
  const [f, setF] = useState(DEFAULT_FILTERS);
  const [exporting, setExporting] = useState(false);
  const [force, setForce] = useState(false);

  const forcedOp = user?.role === 'OPERATOR' ? user.operatorId : undefined;
  const params = useMemo(() => buildParams(f, today, forcedOp), [f, today, forcedOp]);

  useEffect(() => { document.title = `${tab.title} | VoltSlot`; }, [tab]);

  const ops = useAsync(async () => {
    const res = await api.get('/stations', { size: 200 }, { auth: false });
    const list = Array.isArray(res) ? res : res.content || [];
    const m = new Map();
    list.forEach((s) => { const x = s.summary || s; if (x.operatorId) m.set(x.operatorId, x.operatorName); });
    return [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [], { enabled: !!isAdmin });
  const zoneNames = useMemo(() => [...new Set((zones || []).map((z) => z.zone || z.name || z))].sort(), [zones]);

  const exportCsv = async () => {
    setExporting(true);
    try { await download('/analytics/export/sessions.csv', params, 'chargeiq-sessions.csv'); toast.success('Sessions CSV downloaded'); } catch (e) { toast.error(e); } finally { setExporting(false); }
  };
  const printPdf = () => {
    setForce(true); // mount + load every lazy section of this tab, then open the print dialog
    const done = () => { setForce(false); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 2400);
  };

  return (
    <ForceVisible.Provider value={force}>
      <div className="page ins-page">
        <div className="ins-head">
          <h1>{tab.title}</h1>
          <p>{tab.text}</p>
        </div>
        <div className="ins-sticky">
          <Tabs tabs={TABS.map((t) => ({ value: t.value, label: t.label }))} value={tab.value} onChange={(v) => setSp({ tab: v }, { replace: true })} />
          <FilterBar f={f} setF={setF} today={today} zones={zoneNames} connectors={connectors || []} operators={ops.data || []} isAdmin={!!isAdmin}
            scopeLabel={forcedOp ? `${user.operatorName || 'Your operator'} only` : null} exporting={exporting} onExport={exportCsv} onPrint={printPdf} />
        </div>
        <p className="ins-print-title">VoltSlot · {tab.title} · {rangeLabel(params)}</p>
        {forcedOp && <div className="ins-note"><Building2 size={13} /> Showing {user.operatorName || 'your operator'} only.</div>}

        <div className="ins-grid" key={tab.value}>{tab.body(params)}</div>

        <p className="ins-footnote">Dataset is synthetic (≈7,800 sessions, Oct 2025 – Oct 2026). Dates are IST; amounts in ₹.</p>
      </div>
    </ForceVisible.Provider>
  );
}
