import { useMemo } from 'react';
import StationMap from '../map/StationMap.jsx';

/** Map for the trip planner: A / B pins, numbered charging stops and the planned polyline (straight preview before planning). */
export default function TripMap({ origin, dest, trip, fitKey }) {
  const markers = useMemo(() => {
    const m = [];
    if (origin) m.push({ id: 'origin', lat: origin.lat, lon: origin.lon, level: 'LOW', rank: 'A', color: '#38bdf8', title: origin.label, subtitle: 'Origin' });
    if (dest) m.push({ id: 'dest', lat: dest.lat, lon: dest.lon, level: 'LOW', rank: 'B', color: '#f472b6', title: dest.label, subtitle: 'Destination' });
    let n = 0;
    (trip?.legs || []).forEach((l, i) => {
      if (l.type !== 'CHARGE' || !l.station) return;
      n += 1;
      m.push({ id: `stop-${i}`, lat: l.station.latitude, lon: l.station.longitude, level: l.crowdingLevel || 'LOW', rank: n, title: `Stop ${n}: ${l.station.name}`, subtitle: `${l.station.zone} · charge ${l.socStart}→${l.socEnd}%` });
    });
    return m;
  }, [origin, dest, trip]);
  const line = trip?.polyline?.length > 1 ? trip.polyline : origin && dest ? [[origin.lat, origin.lon], [dest.lat, dest.lon]] : null;
  return <StationMap markers={markers} polyline={line} polylineColor={trip && !trip.feasible ? '#f87171' : '#22d3ee'} fitKey={fitKey} zoom={10} padding={60} />;
}
