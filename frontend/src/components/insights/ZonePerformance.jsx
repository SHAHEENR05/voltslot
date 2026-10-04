import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Marker, Tooltip as LTip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPinned, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Segmented, Button } from '../ui';
import { num } from '../../lib/format.js';
import { TILE_URL, TILE_ATTR } from '../map/StationMap.jsx';
import { C, Panel, Async, TipBox, useData, useInView, money, growthColor, signed } from './shared.jsx';

function Fit({ zones }) {
  const map = useMap();
  const key = zones.map((z) => z.zone).join('|');
  useEffect(() => {
    map.invalidateSize();
    if (!zones.length) return;
    const pts = zones.map((z) => [z.latitude, z.longitude]);
    if (pts.length === 1) map.setView(pts[0], 12);
    else map.fitBounds(L.latLngBounds(pts), { padding: [34, 34], maxZoom: 12 });
  }, [key]); // eslint-disable-line
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);
  return null;
}
const labelIcon = (name, on) => L.divIcon({ className: 'ins-zlabel-wrap', html: `<span class="ins-zlabel ${on ? 'on' : ''}">${name}</span>`, iconSize: [0, 0], iconAnchor: [-12, 8] });

const SORTS = [
  { value: 'revenue', label: 'Revenue', get: (z) => z.revenue, fmt: (z) => money(z.revenue) },
  { value: 'sessions', label: 'Sessions', get: (z) => z.sessions, fmt: (z) => num(z.sessions) },
  { value: 'utilizationPct', label: 'Utilisation', get: (z) => z.utilizationPct, fmt: (z) => `${z.utilizationPct.toFixed(2)}%` },
  { value: 'growthPct', label: 'Growth', get: (z) => Math.abs(z.growthPct ?? 0), fmt: (z) => signed(z.growthPct), sortVal: (z) => z.growthPct ?? -999 },
];

export default function ZonePerformance({ params }) {
  const [ref, seen] = useInView();
  const st = useData('zones', params, seen);
  const [sort, setSort] = useState('revenue');
  const [sel, setSel] = useState(null);
  const [all, setAll] = useState(false);
  const def = SORTS.find((s) => s.value === sort);

  const view = useMemo(() => {
    const z = st.data || [];
    const sorted = [...z].sort((a, b) => (def.sortVal ? def.sortVal(b) - def.sortVal(a) : def.get(b) - def.get(a)));
    return { sorted, maxS: Math.max(...z.map((x) => x.sessions), 1), maxBar: Math.max(...z.map(def.get), 0.0001), top: [...z].sort((a, b) => b.sessions - a.sessions).slice(0, 6).map((x) => x.zone), totalRev: z.reduce((a, x) => a + x.revenue, 0) };
  }, [st.data, def]);
  const rows = all ? view.sorted : view.sorted.slice(0, 10);
  const selected = st.data?.find((z) => z.zone === sel);

  return (
    <Panel ref={ref} id="zones" icon={<MapPinned size={17} />} color={C.green} span="s-12" title="Zone performance"
      subtitle="Circle size = sessions · colour = 30-day growth · hover a zone, or a row, to cross-highlight"
      info="Growth compares sessions in the last 30 days with the 30 days before. Utilisation is the share of available charger-hours in use. Zones come from the station registry."
      actions={<Segmented size="sm" options={SORTS.map((s) => ({ value: s.value, label: s.label }))} value={sort} onChange={setSort} />}>
      <Async state={st} h={460} isEmpty={(d) => !d.length}>
        {(zones) => (
          <div className="ins-zones">
            <div className="ins-map">
              <MapContainer center={[19.12, 72.9]} zoom={10} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }} attributionControl={false}>
                <TileLayer url={TILE_URL} attribution={TILE_ATTR} subdomains="abcd" maxZoom={19} />
                <Fit zones={zones} />
                {[...zones].sort((a, b) => b.sessions - a.sessions).map((z) => {
                  const r = 9 + 25 * Math.sqrt(z.sessions / view.maxS), col = growthColor(z.growthPct), on = sel === z.zone;
                  return (
                    <CircleMarker key={z.zone} center={[z.latitude, z.longitude]} radius={on ? r + 4 : r}
                      pathOptions={{ color: on ? '#fff' : col, fillColor: col, fillOpacity: on ? 0.8 : 0.42, weight: on ? 3 : 2, className: 'ins-zcircle' }}
                      eventHandlers={{ mouseover: () => setSel(z.zone), mouseout: () => setSel(null), click: () => setSel(z.zone) }}>
                      <LTip direction="top" offset={[0, -r]} opacity={1} className="ins-ltip">
                        <TipBox title={z.zone} rows={[
                          { label: 'Sessions', value: num(z.sessions), color: C.cyan }, { label: 'Revenue', value: money(z.revenue), color: C.green },
                          { label: 'Utilisation', value: `${z.utilizationPct.toFixed(2)}%`, color: C.violet }, { label: 'Share', value: `${z.sharePct}%` },
                          { label: 'Stations · points', value: `${z.stations} · ${z.points}` }, { label: '30-day growth', value: signed(z.growthPct), color: growthColor(z.growthPct) }]} />
                      </LTip>
                    </CircleMarker>
                  );
                })}
                {zones.filter((z) => view.top.includes(z.zone) || z.zone === sel).map((z) => (
                  <Marker key={`l-${z.zone}`} position={[z.latitude, z.longitude]} icon={labelIcon(z.zone, z.zone === sel)} interactive={false} />
                ))}
              </MapContainer>
              <div className="ins-map-legend">
                <span>Growth</span>
                {[['< −8%', C.red], ['−8 – 0', C.amber], ['0 – 15%', '#86efac'], ['> 15%', C.green]].map(([l, c]) => <em key={l}><i style={{ background: c }} />{l}</em>)}
              </div>
              {selected && (
                <div className="ins-map-card pop-in">
                  <b>{selected.zone}</b><span>{num(selected.sessions)} sessions · {money(selected.revenue)}</span>
                </div>
              )}
            </div>
            <div className="ins-zlist">
              {rows.map((z, i) => {
                const g = z.growthPct, up = g !== null && g >= 0, col = growthColor(g);
                const w = Math.max(3, (def.get(z) / view.maxBar) * 100);
                return (
                  <div key={z.zone} className={`ins-zrow ${sel === z.zone ? 'on' : ''}`} onMouseEnter={() => setSel(z.zone)} onMouseLeave={() => setSel(null)} style={{ animationDelay: `${i * 35}ms` }}>
                    <span className="ins-rank">{i + 1}</span>
                    <div className="ins-zmain">
                      <div className="row between"><b className="truncate">{z.zone}</b><span className="ins-zval">{def.fmt(z)}</span></div>
                      <div className="ins-bar"><i style={{ width: `${w}%`, background: sort === 'growthPct' ? col : `linear-gradient(90deg, ${C.cyan}, ${C.violet})`, animationDelay: `${i * 35 + 120}ms` }} /></div>
                      <div className="ins-zsub">{num(z.sessions)} sessions · {z.sharePct}% share · {z.utilizationPct.toFixed(2)}% util · {money(z.avgRevenuePerSession)}/session</div>
                    </div>
                    <span className="ins-chipg" style={{ '--c': col }} title="30-day session growth">{g === null ? '–' : <>{up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{Math.abs(g).toFixed(1)}%</>}</span>
                  </div>
                );
              })}
              {view.sorted.length > 10 && <Button size="sm" variant="ghost" onClick={() => setAll((a) => !a)}>{all ? 'Show top 10' : `Show all ${view.sorted.length} zones`}</Button>}
            </div>
          </div>
        )}
      </Async>
    </Panel>
  );
}
