import { Users, Building, Truck, MapPin, PlugZap, Car, CalendarCheck, Activity, Star, CalendarClock, Radio } from 'lucide-react';
import { KpiCard, Skeleton } from '../ui';
import { num } from '../../lib/format.js';

const META = [
  { keys: ['users'], label: 'Users', icon: Users },
  { keys: ['operators'], label: 'Operators', icon: Building },
  { keys: ['fleets'], label: 'Fleets', icon: Truck },
  { keys: ['stations'], label: 'Stations', icon: MapPin },
  { keys: ['chargingPoints', 'charging_points'], label: 'Charging points', icon: PlugZap },
  { keys: ['vehicles'], label: 'Vehicles', icon: Car },
  { keys: ['bookings'], label: 'Bookings (all time)', icon: CalendarCheck },
  { keys: ['sessions', 'charging_sessions'], label: 'Charging sessions', icon: Activity },
  { keys: ['reviews'], label: 'Reviews', icon: Star },
];

export default function StatTiles({ stats, loading }) {
  if (loading && !stats) return <div className="grid auto-sm">{Array.from({ length: 10 }, (_, i) => <Skeleton.Card key={i} h={30} />)}</div>;
  if (!stats) return null;
  const c = stats.counts || {};
  const tiles = META.map((m) => { const k = m.keys.find((x) => c[x] !== undefined); return k ? { ...m, value: c[k] } : null; }).filter(Boolean);
  return (
    <div className="grid auto-sm stat-tiles">
      <KpiCard label="Bookings today" value={num(stats.bookingsToday)} icon={<CalendarClock size={16} />} hint="excl. cancelled" className="hot" />
      <KpiCard label="Live bookings" value={num(stats.bookingsLive)} icon={<Radio size={16} />} hint="hold · confirmed · charging" className="hot" />
      {tiles.map((t) => <KpiCard key={t.label} label={t.label} value={num(t.value)} icon={<t.icon size={16} />} />)}
    </div>
  );
}
