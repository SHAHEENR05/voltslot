import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import { useEffect } from 'react';
import { pinIcon, TILE_URL, TILE_ATTR } from './StationMap.jsx';
import { DEFAULT_LOCATION } from '../../lib/constants.js';

function Clicker({ onChange }) { useMapEvents({ click: (e) => onChange({ lat: +e.latlng.lat.toFixed(6), lon: +e.latlng.lng.toFixed(6) }) }); return null; }
function Recenter({ value }) { const map = useMap(); useEffect(() => { if (value) map.panTo([value.lat, value.lon]); }, [value?.lat, value?.lon]); return null; } // eslint-disable-line
function Sizer() { const map = useMap(); useEffect(() => { setTimeout(() => map.invalidateSize(), 250); }, [map]); return null; }

/** Click to choose a lat/lon. <MapPicker value={{lat,lon}} onChange={({lat,lon})=>..} height={260} /> */
export default function MapPicker({ value, onChange, height = 260, zoom = 12 }) {
  const c = value ? [value.lat, value.lon] : [DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon];
  return (
    <div className="map-box" style={{ height }}>
      <MapContainer center={c} zoom={zoom} style={{ height: '100%', width: '100%' }}>
        <TileLayer url={TILE_URL} attribution={TILE_ATTR} subdomains="abcd" />
        <Sizer /><Clicker onChange={onChange} /><Recenter value={value} />
        {value && <Marker position={[value.lat, value.lon]} icon={pinIcon({ level: 'LOW', color: '#22d3ee' })} />}
      </MapContainer>
      <div className="small muted" style={{ position: 'absolute', left: 10, bottom: 10, zIndex: 500, background: 'rgba(7,11,18,.8)', padding: '3px 8px', borderRadius: 8 }}>
        {value ? `${value.lat.toFixed(5)}, ${value.lon.toFixed(5)}` : 'Click the map to drop a pin'}
      </div>
    </div>
  );
}
