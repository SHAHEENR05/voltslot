import { Truck, CalendarCheck, Zap, IndianRupee, Activity, RefreshCw } from 'lucide-react';
import { Button, KpiCard, Skeleton, ErrorState } from '../components/ui';
import VehicleTable from '../components/fleet/VehicleTable.jsx';
import SchedulerWizard from '../components/fleet/SchedulerWizard.jsx';
import { useFetch } from '../lib/hooks.js';
import { inr0, kwh, num } from '../lib/format.js';

/** Fleet console (FLEET_MANAGER / ADMIN): KPI cards, vehicle table with recharge predictions, smart scheduler. */
export default function Fleet() {
  const { data, loading, error, reload } = useFetch('/fleet/overview');
  if (error) return <div className="page"><div className="page-head"><div><h1>Fleet console</h1></div></div><ErrorState error={error} onRetry={reload} title="Could not load your fleet" /></div>;
  const rows = data?.vehicles || [];
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Fleet console</h1>
          <p>{data ? `${data.fleetName} · ` : ''}Keep every vehicle charged, on schedule and on budget.</p>
        </div>
        <Button variant="ghost" icon={<RefreshCw size={15} />} onClick={() => reload()}>Refresh</Button>
      </div>

      <div className="grid cols-4 keep2 fade-up">
        {loading && !data ? Array.from({ length: 4 }, (_, i) => <Skeleton.Card key={i} h={50} />) : (<>
          <KpiCard label="Vehicles" value={num(data.vehicleCount)} icon={<Truck size={16} />} hint={`${rows.filter((r) => r.predictionState === 'OVERDUE' || r.predictionState === 'DUE_SOON').length} need charging soon`} />
          <KpiCard label="Upcoming bookings" value={num(data.upcomingBookings)} icon={<CalendarCheck size={16} />} hint="confirmed slots" />
          <KpiCard label="Sessions (30 d)" value={num(data.sessions30d)} icon={<Activity size={16} />} hint={`${kwh(data.energy30dKwh)} delivered`} />
          <KpiCard label="Spend (30 d)" value={inr0(data.spend30d)} icon={<IndianRupee size={16} />} hint={data.energy30dKwh ? `≈ ${inr0(data.spend30d / data.energy30dKwh)} per kWh` : undefined} />
        </>)}
      </div>

      <div className="mt-24"><VehicleTable rows={rows} loading={loading && !data} /></div>
      <div className="mt-24">{data && <SchedulerWizard vehicles={rows} onApplied={() => reload(true)} />}</div>
    </div>
  );
}
