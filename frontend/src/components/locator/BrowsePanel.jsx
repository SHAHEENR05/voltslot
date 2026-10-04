import { useEffect, useRef, useState } from 'react';
import { Search, Zap, SearchX } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useDebounced } from '../../lib/hooks.js';
import { useReference } from '../../lib/reference.jsx';
import { CONNECTOR_LABEL } from '../../lib/constants.js';
import Chip from '../ui/Chip.jsx';
import Toggle from '../ui/Toggle.jsx';
import Pagination from '../ui/Pagination.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import ErrorState from '../ui/ErrorState.jsx';
import StationCard from './StationCard.jsx';

const SIZE = 12;

/** "Browse all" tab: filters + paginated GET /api/stations. */
export default function BrowsePanel({ me, selectedId, onStations, onLocate, onOpen }) {
  const { connectors: refConn, amenities, zones } = useReference();
  const [f, setF] = useState({ q: '', connector: '', minKw: '', amenity: '', zone: '', openNow: false, sort: 'distance' });
  const [page, setPage] = useState(0);
  const [st, setSt] = useState({ loading: true, error: null, data: null });
  const dq = useDebounced(f.q, 300);
  const seq = useRef(0);
  const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); setPage(0); };

  const load = () => {
    const id = ++seq.current;
    setSt((s) => ({ ...s, loading: true, error: null }));
    api.get('/stations', { lat: me.lat, lon: me.lon, q: dq, connector: f.connector, minKw: f.minKw, amenity: f.amenity, zone: f.zone, openNow: f.openNow || undefined, sort: f.sort, page, size: SIZE }, { auth: false })
      .then((data) => { if (id === seq.current) { setSt({ loading: false, error: null, data }); onStations(data.content); } },
        (error) => { if (id === seq.current) setSt((s) => ({ ...s, loading: false, error })); });
  };
  useEffect(load, [me.lat, me.lon, dq, f.connector, f.minKw, f.amenity, f.zone, f.openNow, f.sort, page]); // eslint-disable-line

  const { data, loading, error } = st;
  const codes = refConn.length ? refConn.map((c) => c.code) : Object.keys(CONNECTOR_LABEL);
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="card flat col" style={{ gap: 12 }}>
        <div className="input-wrap"><Search size={16} /><input className="input" placeholder="Search by name, zone or address" value={f.q} onChange={(e) => set('q', e.target.value)} aria-label="Search stations" /></div>
        <div className="row wrap gap-6">
          <Chip size="sm" active={!f.connector} onClick={() => set('connector', '')}>All connectors</Chip>
          {codes.map((c) => <Chip key={c} size="sm" active={f.connector === c} onClick={() => set('connector', f.connector === c ? '' : c)} icon={<Zap size={11} />}>{CONNECTOR_LABEL[c] || c}</Chip>)}
        </div>
        <div className="form-row" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
          <select className="select sm" value={f.minKw} onChange={(e) => set('minKw', e.target.value)} aria-label="Minimum power"><option value="">Any power</option><option value="7">≥ 7 kW</option><option value="22">≥ 22 kW</option><option value="50">≥ 50 kW (fast)</option><option value="100">≥ 100 kW (ultra)</option></select>
          <select className="select sm" value={f.amenity} onChange={(e) => set('amenity', e.target.value)} aria-label="Amenity"><option value="">Any amenity</option>{amenities.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}</select>
          <select className="select sm" value={f.zone} onChange={(e) => set('zone', e.target.value)} aria-label="Zone"><option value="">All zones</option>{zones.map((z) => <option key={z.zone} value={z.zone}>{z.zone} ({z.stations})</option>)}</select>
          <select className="select sm" value={f.sort} onChange={(e) => set('sort', e.target.value)} aria-label="Sort"><option value="distance">Nearest first</option><option value="rating">Top rated</option><option value="price">Lowest price</option><option value="reliability">Most reliable</option></select>
        </div>
        <label className="check"><Toggle checked={f.openNow} onChange={(v) => set('openNow', v)} label="Open now" /> Open now only</label>
      </div>
      <div className="row between small muted"><span>{data ? `${data.totalElements} station${data.totalElements === 1 ? '' : 's'}` : ' '}</span></div>
      {loading && !data && [0, 1, 2, 3].map((i) => <Skeleton.Card key={i} h={90} />)}
      {error && <ErrorState error={error} onRetry={load} />}
      <div className="col" style={{ gap: 12, opacity: loading && data ? 0.55 : 1 }}>
        {data?.content.map((s) => <StationCard key={s.id} s={s} active={selectedId === s.id} onClick={() => onOpen(s.id)} onLocate={onLocate} />)}
      </div>
      {data && data.content.length === 0 && !loading && <EmptyState icon={<SearchX size={26} />} title="No stations match" text="Loosen a filter or clear the search to see more chargers." />}
      {data && <Pagination page={data.page} totalPages={data.totalPages} totalElements={data.totalElements} size={SIZE} onChange={setPage} />}
    </div>
  );
}
