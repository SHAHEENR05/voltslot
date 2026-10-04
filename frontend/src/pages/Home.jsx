import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, List, LocateFixed, Map as MapLucide } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { useBooking } from '../lib/booking.jsx';
import { useReference } from '../lib/reference.jsx';
import { DEFAULT_LOCATION } from '../lib/constants.js';
import { haversineKm } from '../lib/format.js';
import StationMap from '../components/map/StationMap.jsx';
import SmartPanel from '../components/locator/SmartPanel.jsx';
import BrowsePanel from '../components/locator/BrowsePanel.jsx';
import Segmented from '../components/ui/Segmented.jsx';
import Button from '../components/ui/Button.jsx';

/** Home = Locator (map + left panel with "Smart pick" and "Browse all"). Public - guests can use it fully. */
export default function Home() {
  const nav = useNavigate();
  const { user } = useAuth();
  const { openBooking } = useBooking();
  const { zones } = useReference();
  const [tab, setTab] = useState('smart');
  const [geo, setGeo] = useState(null);
  const [origin, setOrigin] = useState('auto');
  const [items, setItems] = useState([]);
  const [stations, setStations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [flyTo, setFlyTo] = useState(null);
  const [fitKey, setFitKey] = useState(0);
  const [mapOpen, setMapOpen] = useState(false);
  const scrollRef = useRef(null);
  useEffect(() => { scrollRef.current?.scrollTo?.(0, 0); }, [tab]);

  // browser geolocation (ignored when far from the Mumbai region so the demo always has chargers nearby)
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => { if (haversineKm(p.coords.latitude, p.coords.longitude, DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon) < 120) setGeo({ lat: p.coords.latitude, lon: p.coords.longitude }); },
      () => {}, { timeout: 4000, maximumAge: 600000 });
  }, []);

  const me = useMemo(() => {
    if (origin !== 'auto') { const z = zones.find((x) => x.zone === origin); if (z) return { lat: z.latitude, lon: z.longitude, label: z.zone }; }
    if (geo) return { ...geo, label: 'Your location' };
    if (user?.homeLat && user?.homeLon) return { lat: user.homeLat, lon: user.homeLon, label: 'Home' };
    return DEFAULT_LOCATION;
  }, [origin, geo, user, zones]);
  const meKey = `${me.lat.toFixed(4)},${me.lon.toFixed(4)}`;
  const stableMe = useMemo(() => ({ lat: me.lat, lon: me.lon, label: me.label }), [meKey]); // eslint-disable-line

  const onItems = useCallback((list) => { setItems(list); setFitKey((k) => k + 1); }, []);
  const onStations = useCallback((list) => { setStations(list); setFitKey((k) => k + 1); }, []);
  const open = useCallback((id) => nav(`/station/${id}`), [nav]);
  const locate = useCallback((s) => { setSelectedId(s.id); setFlyTo({ lat: s.latitude, lon: s.longitude, zoom: 15, key: Date.now() }); setMapOpen(true); }, []);
  const selectItem = useCallback((it) => {
    setSelectedId((cur) => (cur === it.station.id ? null : it.station.id));
    setFlyTo({ lat: it.station.latitude, lon: it.station.longitude, zoom: 15, key: Date.now() });
  }, []);
  const book = useCallback((it, extra) => openBooking({ stationId: it.station.id, pointId: it.point.pointId, slotStart: it.slotStart, ...extra }), [openBooking]);

  const markers = useMemo(() => (tab === 'smart'
    ? items.map((it) => ({ id: it.station.id, lat: it.station.latitude, lon: it.station.longitude, level: it.crowdingLevel, rank: it.rank, title: it.station.name, subtitle: `${it.station.zone} · score ${Math.round(it.score)}` }))
    : stations.map((s) => ({ id: s.id, lat: s.latitude, lon: s.longitude, level: s.crowdingLevelNow, title: s.name, subtitle: `${s.zone} · ${s.freeNowPoints}/${s.activePoints} free` }))), [tab, items, stations]);

  const onMarker = (id) => { setSelectedId(id); if (tab === 'smart') document.querySelector('.rec-card.selected, [data-testid=rec-card]')?.scrollIntoView?.({ block: 'nearest' }); };

  return (
    <div className="locator">
      <section className="loc-panel">
        <div className="loc-panel-head">
          <div className="row between mb-8">
            <div><h2>Find a charger</h2><div className="muted small row gap-4"><LocateFixed size={13} /> from {me.label}</div></div>
            <select className="select sm" style={{ width: 150 }} value={origin} onChange={(e) => setOrigin(e.target.value)} aria-label="Starting point">
              <option value="auto">My location</option>
              {zones.map((z) => <option key={z.zone} value={z.zone}>{z.zone}</option>)}
            </select>
          </div>
          <Segmented block value={tab} onChange={(t) => { setTab(t); setSelectedId(null); }} options={[{ value: 'smart', label: 'Smart pick', icon: <Sparkles size={14} /> }, { value: 'browse', label: 'Browse all', icon: <List size={14} /> }]} />
        </div>
        <div className="loc-scroll" ref={scrollRef}>
          <div style={{ display: tab === 'smart' ? 'block' : 'none' }}>
            <SmartPanel me={stableMe} selectedId={selectedId} onSelect={selectItem} onItems={onItems} onBook={book} onOpen={open} />
          </div>
          <div style={{ display: tab === 'browse' ? 'block' : 'none' }}>
            <BrowsePanel me={stableMe} selectedId={selectedId} onStations={onStations} onLocate={locate} onOpen={open} />
          </div>
        </div>
      </section>
      <section className={`loc-map ${mapOpen ? 'show' : ''}`}>
        <StationMap markers={markers} me={stableMe} selectedId={selectedId} onSelect={onMarker} onOpen={open} flyTo={flyTo} fitKey={`${tab}-${fitKey}-${mapOpen}`} zoom={11} />
      </section>
      <Button className="loc-mobile-toggle" variant="primary" icon={mapOpen ? <List size={16} /> : <MapLucide size={16} />} onClick={() => setMapOpen((m) => !m)}>{mapOpen ? 'List' : 'Map'}</Button>
    </div>
  );
}
