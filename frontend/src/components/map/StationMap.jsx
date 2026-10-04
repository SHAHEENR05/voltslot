import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CROWD, DEFAULT_LOCATION } from '../../lib/constants.js';

export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> ';

const iconCache = new Map();
/** divIcon pin coloured by crowding level. label = rank number (ranked pins get a halo). Never uses Leaflet's default PNG icons. */
export function pinIcon({ level = 'LOW', label, active, small, color }) {
  const key = `${level}|${label ?? ''}|${active ? 1 : 0}|${small ? 1 : 0}|${color || ''}`;
  if (!iconCache.has(key)) {
    const c = CROWD[level] || CROWD.LOW;
    const size = small ? 26 : 34;
    iconCache.set(key, L.divIcon({
      className: 'ciq-marker',
      html: `<div class="ciq-pin ${small ? 'small' : ''} ${active ? 'active' : ''} ${label ? 'ranked' : ''}" style="--pin:${color || c.color};--pin-glow:${c.glow}"><span class="pin-body"></span><span class="pin-label">${label ?? '⚡'}</span></div>`,
      iconSize: [size, size], iconAnchor: [size / 2, size], popupAnchor: [0, -size],
    }));
  }
  return iconCache.get(key);
}
const meIcon = L.divIcon({ className: 'ciq-marker', html: '<div class="ciq-me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });

function Resizer() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);
  return null;
}
function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => { if (target) map.flyTo([target.lat, target.lon], target.zoom || Math.max(map.getZoom(), 14), { duration: 0.9 }); }, [target?.key, target?.lat, target?.lon]); // eslint-disable-line
  return null;
}
function Fit({ points, fitKey, padding = 50, maxZoom = 15, paddingBottomRight }) {
  const map = useMap();
  useEffect(() => {
    if (!points || points.length === 0) return;
    map.invalidateSize(); // container may have just become visible (mobile toggle)
    if (points.length === 1) { map.setView(points[0], Math.max(map.getZoom(), 13)); return; }
    map.fitBounds(L.latLngBounds(points), { padding: [padding, padding], maxZoom, ...(paddingBottomRight ? { paddingBottomRight } : {}) });
  }, [fitKey]); // eslint-disable-line
  return null;
}
function ClickHandler({ onClick }) { useMapEvents({ click: (e) => onClick?.({ lat: e.latlng.lat, lon: e.latlng.lng }) }); return null; }

/**
 * StationMap - dark react-leaflet map.
 * props:
 *  markers   [{ id, lat, lon, level:'LOW|MEDIUM|HIGH', rank?:number, title?, subtitle?, popup?:ReactNode, small?, color? }]
 *  selectedId, onSelect(id)       highlight + click callback (marker click)
 *  onOpen(id)                     shown as "View station" button inside the default popup
 *  me {lat,lon}                   "my location" blue dot
 *  flyTo {lat,lon,zoom?,key?}     animate to a target (change `key` to re-trigger)
 *  fitKey                         change to re-run fitBounds over markers (+ me)
 *  polyline [[lat,lon],...], polylineColor
 *  circles [{lat,lon,radius,color,tooltip}]  (px radius CircleMarkers; used by analytics)
 *  center, zoom, onMapClick({lat,lon}), children (extra react-leaflet layers), className
 */
export default function StationMap({ markers = [], selectedId, onSelect, onOpen, me, flyTo, fitKey, polyline, polylineColor = '#22d3ee', circles, center, zoom = 11, onMapClick, children, className = '', padding, fitMe = true }) {
  const c = center || (me ? [me.lat, me.lon] : [DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon]);
  const fitPoints = useMemo(() => {
    const p = markers.map((m) => [m.lat, m.lon]);
    if (me && fitMe) p.push([me.lat, me.lon]);
    return p;
  }, [markers, me, fitMe]);
  const markerRefs = useRef({});
  useEffect(() => { if (selectedId != null) markerRefs.current[selectedId]?.openPopup?.(); }, [selectedId]);
  return (
    <div className={`map-box ${className}`}>
      <MapContainer center={c} zoom={zoom} zoomControl scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer url={TILE_URL} attribution={TILE_ATTR} subdomains="abcd" maxZoom={19} />
        <Resizer />
        {fitKey !== undefined && <Fit points={fitPoints} fitKey={fitKey} padding={padding} />}
        <FlyTo target={flyTo} />
        {onMapClick && <ClickHandler onClick={onMapClick} />}
        {polyline && polyline.length > 1 && <>
          <Polyline positions={polyline} pathOptions={{ color: polylineColor, weight: 9, opacity: 0.18 }} />
          <Polyline positions={polyline} pathOptions={{ color: polylineColor, weight: 3.5, opacity: 0.95, dashArray: '1 8', lineCap: 'round' }} />
        </>}
        {circles?.map((ci, i) => (
          <CircleMarker key={i} center={[ci.lat, ci.lon]} radius={ci.radius} pathOptions={{ color: ci.color, fillColor: ci.color, fillOpacity: 0.35, weight: 2 }}
            eventHandlers={ci.onClick ? { click: ci.onClick } : undefined}>
            {ci.tooltip && <PopupLike>{ci.tooltip}</PopupLike>}
          </CircleMarker>
        ))}
        {markers.map((m) => (
          <Marker key={m.id} position={[m.lat, m.lon]} icon={pinIcon({ level: m.level, label: m.rank, active: m.id === selectedId, small: m.small, color: m.color })}
            zIndexOffset={m.rank ? 500 - m.rank : m.id === selectedId ? 1000 : 0}
            ref={(r) => { if (r) markerRefs.current[m.id] = r; }}
            eventHandlers={{ click: () => onSelect?.(m.id) }}>
            {(m.popup || m.title) && (
              <Popup closeButton={false} minWidth={190}>
                {m.popup || (
                  <div className="map-popup">
                    <h4>{m.title}</h4>
                    {m.subtitle && <div className="muted small">{m.subtitle}</div>}
                    {onOpen && <button className="btn sm primary mt-8" onClick={() => onOpen(m.id)}>View station</button>}
                  </div>
                )}
              </Popup>
            )}
          </Marker>
        ))}
        {me && <Marker position={[me.lat, me.lon]} icon={meIcon} interactive={false} zIndexOffset={-100} />}
        {children}
      </MapContainer>
    </div>
  );
}
// Tooltip wrapper for circles (react-leaflet Tooltip import kept local to avoid circular confusion)
import { Tooltip as LTooltip } from 'react-leaflet';
function PopupLike({ children }) { return <LTooltip sticky>{children}</LTooltip>; }
