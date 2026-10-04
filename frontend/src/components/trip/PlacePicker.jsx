import { Field } from '../ui';

export const placeKey = { custom: 'custom', home: 'home', zone: (z) => `zone:${z}` };

/** Resolve {key, lat, lon} -> {lat, lon, label} using zones / home. */
export function resolvePlace(p, zones, home) {
  if (p.key === 'custom') { const lat = parseFloat(p.lat), lon = parseFloat(p.lon); return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon, label: `${lat.toFixed(3)}, ${lon.toFixed(3)}` } : null; }
  if (p.key === 'home') return home ? { lat: home.lat, lon: home.lon, label: 'Home' } : null;
  const z = zones.find((x) => `zone:${x.zone}` === p.key);
  return z ? { lat: z.latitude, lon: z.longitude, label: z.zone } : null;
}

/** Zone dropdown + "Home" + free lat/lon entry. value = {key, lat, lon} (lat/lon as strings for the custom option). */
export default function PlacePicker({ label, value, onChange, zones, home, error, id }) {
  return (
    <Field label={label} error={error} htmlFor={id}>
      <select id={id} className="select" value={value.key} onChange={(e) => onChange({ ...value, key: e.target.value })}>
        {home && <option value="home">My home</option>}
        <optgroup label="Zones">{zones.map((z) => <option key={z.zone} value={`zone:${z.zone}`}>{z.zone}</option>)}</optgroup>
        <option value="custom">Custom coordinates…</option>
      </select>
      {value.key === 'custom' && (
        <div className="row gap-8 mt-8">
          <input className="input" inputMode="decimal" placeholder="Latitude e.g. 19.07" aria-label={`${label} latitude`} value={value.lat} onChange={(e) => onChange({ ...value, lat: e.target.value })} />
          <input className="input" inputMode="decimal" placeholder="Longitude e.g. 72.87" aria-label={`${label} longitude`} value={value.lon} onChange={(e) => onChange({ ...value, lon: e.target.value })} />
        </div>
      )}
    </Field>
  );
}
