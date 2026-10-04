import { useEffect, useMemo, useState } from 'react';
import { Building2, PlugZap, CalendarCheck, Activity, Clock4, IndianRupee, Zap, Plus, RefreshCw } from 'lucide-react';
import { Button, Card, KpiCard, Tabs, Skeleton, ErrorState, EmptyState, ConfirmDialog } from '../components/ui';
import LiveStations from '../components/operator/LiveStations.jsx';
import StationsTable from '../components/operator/StationsTable.jsx';
import StationModal from '../components/operator/StationModal.jsx';
import PointsPanel from '../components/operator/PointsPanel.jsx';
import DaySchedule from '../components/operator/DaySchedule.jsx';
import WalkInForm from '../components/operator/WalkInForm.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useFetch, usePolling } from '../lib/hooks.js';
import { useToast } from '../lib/toast.jsx';
import { inr0, num, kwh } from '../lib/format.js';

/** Operator console: live KPIs + station cards, stations/points management, day schedule, walk-in log. */
export default function Operator() {
  const { user } = useAuth();
  const toast = useToast();
  const dash = useFetch('/operator/dashboard');
  const list = useFetch('/operator/stations');
  const [tab, setTab] = useState('stations');
  const [stationId, setStationId] = useState(null);
  const [pointsFor, setPointsFor] = useState(null);
  const [modal, setModal] = useState({ open: false, station: null });
  const [del, setDel] = useState(null);
  const [delBusy, setDelBusy] = useState(false);
  const [tick, setTick] = useState(0);

  const stations = list.data || [];
  usePolling(() => dash.reload(true), 30000, { immediate: false });
  useEffect(() => { if (stations.length && !stations.some((s) => s.id === stationId)) setStationId(stations[0].id); }, [list.data]); // eslint-disable-line
  const operators = useMemo(() => { const m = new Map(); stations.forEach((s) => s.operatorId && m.set(s.operatorId, s.operatorName)); return [...m].map(([id, name]) => ({ id, name })); }, [stations]);
  const reloadAll = () => { dash.reload(true); list.reload(true); setTick((t) => t + 1); };

  const remove = async () => {
    setDelBusy(true);
    try { await api.del(`/operator/stations/${del.id}`); toast.success(`${del.name} removed`); if (pointsFor?.id === del.id) setPointsFor(null); setDel(null); reloadAll(); }
    catch (e) { toast.error(e); setDel(null); } finally { setDelBusy(false); }
  };
  const d = dash.data;
  const busyPct = d ? Math.round((d.stationsLive.reduce((a, s) => a + s.busyNow, 0) / Math.max(1, d.activePoints)) * 100) : 0;
  const selectStation = (id) => { setStationId(id); setTab('schedule'); };

  if (dash.error && list.error) return <div className="page"><div className="page-head"><h1>Operator console</h1></div><ErrorState error={dash.error} onRetry={reloadAll} /></div>;

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Operator console</h1><p>{d?.operatorName ? `${d.operatorName} · ` : ''}Live status, stations, charging points and today's schedule.</p></div>
        <div className="row gap-8"><Button variant="ghost" icon={<RefreshCw size={15} />} onClick={reloadAll}>Refresh</Button><Button icon={<Plus size={16} />} onClick={() => setModal({ open: true, station: null })}>New station</Button></div>
      </div>

      <div className="grid cols-4 keep2 fade-up">
        {dash.loading && !d ? Array.from({ length: 8 }, (_, i) => <Skeleton.Card key={i} h={40} />) : d && (<>
          <KpiCard label="Stations" value={num(d.stations)} icon={<Building2 size={16} />} hint={`${d.points} charging points`} />
          <KpiCard label="Active points" value={`${d.activePoints} / ${d.points}`} icon={<PlugZap size={16} />} hint={d.points - d.activePoints ? `${d.points - d.activePoints} out of service` : 'All in service'} />
          <KpiCard label="Bookings today" value={num(d.bookingsToday)} icon={<CalendarCheck size={16} />} hint={`${d.upcomingToday} still to come`} />
          <KpiCard label="Charging now" value={num(d.inProgress)} icon={<Activity size={16} />} hint="sessions in progress" />
          <KpiCard label="Upcoming today" value={num(d.upcomingToday)} icon={<Clock4 size={16} />} hint="confirmed, not started" />
          <KpiCard label="Revenue today" value={inr0(d.revenueToday)} icon={<IndianRupee size={16} />} hint="completed sessions" />
          <KpiCard label="Energy today" value={kwh(d.energyTodayKwh)} icon={<Zap size={16} />} hint="delivered so far" />
          <KpiCard label="Utilisation now" value={`${busyPct}%`} icon={<Activity size={16} />} hint="busy ÷ active points" />
        </>)}
      </div>

      <h2 className="section-title">Live stations</h2>
      <LiveStations stations={d?.stationsLive} loading={dash.loading && !d} selectedId={stationId} onSelect={selectStation} />

      <div className="mt-24">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'stations', label: 'Stations & points', count: stations.length }, { value: 'schedule', label: 'Day schedule' }, { value: 'walkin', label: 'Walk-in log' }]} />
      </div>
      <div className="mt-16">
        {tab === 'stations' && (
          <div className="col gap-16">
            <Card title="Stations" subtitle="Create, edit and manage your charging stations" icon={<Building2 size={16} />}>
              {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : (
                <StationsTable stations={stations} loading={list.loading && !list.data} selectedId={pointsFor?.id}
                  onPoints={(s) => setPointsFor((p) => (p?.id === s.id ? null : s))} onEdit={(s) => setModal({ open: true, station: s })} onDelete={setDel} />
              )}
            </Card>
            {pointsFor && <PointsPanel key={pointsFor.id} station={pointsFor} onClose={() => setPointsFor(null)} onChanged={reloadAll} />}
          </div>
        )}
        {tab === 'schedule' && (stations.length ? <DaySchedule stations={stations} stationId={stationId} onStationChange={setStationId} refreshKey={tick} /> : <EmptyState title="No stations yet" />)}
        {tab === 'walkin' && (stations.length ? <WalkInForm stations={stations} stationId={stationId} onStationChange={setStationId} onLogged={reloadAll} /> : <EmptyState title="No stations yet" />)}
      </div>

      <StationModal open={modal.open} station={modal.station} operators={operators} onClose={() => setModal({ open: false, station: null })} onSaved={reloadAll} />
      <ConfirmDialog open={!!del} danger title="Remove station?" message={del ? `${del.name} will be deactivated and disappear from the locator. This is blocked while upcoming bookings exist.` : ''} confirmLabel="Remove" loading={delBusy} onConfirm={remove} onCancel={() => setDel(null)} />
    </div>
  );
}
