import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Car, Zap, TrendingDown, SearchX, Plus } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useClock } from '../../lib/clock.jsx';
import { useFetch, useDebounced } from '../../lib/hooks.js';
import { PRESETS, PRESET_WEIGHTS, CONNECTOR_LABEL } from '../../lib/constants.js';
import { addMinutes, format } from 'date-fns';
import { parseLocal, toIso } from '../../lib/format.js';
import Segmented from '../ui/Segmented.jsx';
import Slider from '../ui/Slider.jsx';
import Chip from '../ui/Chip.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import ErrorState from '../ui/ErrorState.jsx';
import Field from '../ui/Field.jsx';
import AdvancedWeights from './AdvancedWeights.jsx';
import ResultCard from './ResultCard.jsx';

const CONNECTORS = ['CCS2', 'TYPE2', 'CHADEMO', 'LECCS', 'BHARAT_DC'];

/** "Smart pick" tab: inputs -> POST /api/recommendations (debounced, automatic) -> savings banner + ranked ResultCards. */
export default function SmartPanel({ me, selectedId, onSelect, onItems, onBook, onOpen }) {
  const { user } = useAuth();
  const clock = useClock();
  const { data: vehicles } = useFetch('/vehicles', { enabled: !!user });
  const [vehicleId, setVehicleId] = useState('');
  const [connectors, setConnectors] = useState(['CCS2', 'TYPE2']);
  const [soc, setSoc] = useState([20, 80]);
  const [arrival, setArrival] = useState('now');
  const [arrivalAt, setArrivalAt] = useState('');
  const [preset, setPreset] = useState('BALANCED');
  const [weights, setWeights] = useState(PRESET_WEIGHTS.BALANCED);
  const [custom, setCustom] = useState(false);
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const seq = useRef(0);

  useEffect(() => { if (vehicles?.length && vehicleId === '') setVehicleId(String(vehicles[0].id)); }, [vehicles]); // eslint-disable-line
  const vehicle = vehicles?.find((v) => String(v.id) === String(vehicleId));
  const useVehicle = !!user && !!vehicle;

  const pickPreset = (p) => { setPreset(p); setWeights(PRESET_WEIGHTS[p]); setCustom(false); };
  const minPick = useMemo(() => format(addMinutes(clock.now, 30), "yyyy-MM-dd'T'HH:mm"), [clock.now]);

  const req = useMemo(() => ({
    latitude: me.lat, longitude: me.lon,
    ...(useVehicle ? { vehicleId: vehicle.id } : { connectorCodes: connectors }),
    socStart: soc[0], socTarget: soc[1],
    ...(arrival === 'pick' && arrivalAt ? { arrivalTime: `${arrivalAt}:00` } : {}),
    preset, ...(custom ? { weights } : {}), limit: 6,
  }), [me.lat, me.lon, useVehicle, vehicle?.id, connectors, soc, arrival, arrivalAt, preset, custom, weights]);
  const dreq = useDebounced(req, 350);
  const key = JSON.stringify(dreq);

  const run = () => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    api.post('/recommendations', dreq, { auth: false }).then(
      (data) => { if (id === seq.current) { setState({ loading: false, error: null, data }); onItems(data.items || [], data); } },
      (error) => { if (id === seq.current) setState((s) => ({ ...s, loading: false, error })); });
  };
  useEffect(() => { if (!user || vehicles || vehicleId !== '' || true) run(); }, [key]); // eslint-disable-line

  const { data, loading, error } = state;
  const sav = data?.savings;
  const toggleConn = (c) => setConnectors((cs) => (cs.includes(c) ? (cs.length > 1 ? cs.filter((x) => x !== c) : cs) : [...cs, c]));
  const book = (item) => onBook(item, { vehicleId: useVehicle ? vehicle.id : undefined, socStart: soc[0], socTarget: soc[1] });

  return (
    <div className="col gap-16" style={{ gap: 14 }}>
      <div className="card flat col" style={{ gap: 14 }}>
        {user ? (
          <Field label="Vehicle">
            {vehicles && vehicles.length === 0
              ? <div className="row between"><span className="muted small">No vehicles yet – pick connectors below or</span><Link to="/garage" className="small">add one</Link></div>
              : <div className="input-wrap"><Car size={16} /><select className="select" style={{ paddingLeft: 36 }} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                {vehicles?.map((v) => <option key={v.id} value={v.id}>{v.nickname ? `${v.nickname} · ` : ''}{v.make} {v.model} ({v.regNumber})</option>)}
              </select></div>}
          </Field>
        ) : null}
        {(!user || (vehicles && vehicles.length === 0)) && (
          <Field label="Connector type" hint={!user ? 'Guests: choose what your vehicle accepts. Sign in to use your garage.' : undefined}>
            <div className="row wrap gap-6">{CONNECTORS.map((c) => <Chip key={c} active={connectors.includes(c)} onClick={() => toggleConn(c)} size="sm" icon={<Zap size={11} />}>{CONNECTOR_LABEL[c]}</Chip>)}</div>
          </Field>
        )}
        {useVehicle && <div className="row wrap gap-6 small muted" style={{ marginTop: -4 }}>{vehicle.connectorCodes.map((c) => <Chip key={c} size="sm">{CONNECTOR_LABEL[c] || c}</Chip>)}<span>{vehicle.batteryKwh} kWh · {vehicle.rangeKm} km range</span></div>}

        <div>
          <div className="row between"><span className="label">State of charge</span><span className="small"><b className="text-primary">{soc[0]}%</b> <span className="muted">→</span> <b className="text-violet">{soc[1]}%</b></span></div>
          <div className="mt-8"><Slider min={0} max={100} step={5} minGap={10} value={soc} onChange={setSoc} ticks={[20, 50, 80]} /></div>
        </div>

        <div className="row wrap gap-12">
          <div className="grow" style={{ minWidth: 150 }}>
            <div className="label mb-8">Arrival</div>
            <Segmented size="sm" block options={[{ value: 'now', label: 'Now' }, { value: 'pick', label: 'Pick time' }]} value={arrival} onChange={(v) => { setArrival(v); if (v === 'pick' && !arrivalAt) setArrivalAt(minPick); }} />
          </div>
          {arrival === 'pick' && <div className="grow" style={{ minWidth: 190 }}><div className="label mb-8">Arrive at</div><input type="datetime-local" className="input sm" step={900} min={minPick} value={arrivalAt} onChange={(e) => setArrivalAt(e.target.value)} /></div>}
        </div>

        <div>
          <div className="row between mb-8"><span className="label">Optimise for</span><AdvancedWeights weights={weights} custom={custom} onChange={(w) => { setWeights(w); setCustom(true); }} onReset={() => pickPreset('BALANCED')} /></div>
          <Segmented size="sm" block options={PRESETS} value={custom ? '' : preset} onChange={pickPreset} />
        </div>
      </div>

      {sav?.summary && data?.items?.length > 0 && !loading && (
        <div className={`savings-banner fade-up ${sav.minutesSaved > 0 || Number(sav.rupeesSaved) > 0 ? '' : 'neutral'}`}><span className="s-ico"><TrendingDown size={19} /></span><span>{sav.summary}</span></div>
      )}

      {loading && !data && [0, 1, 2].map((i) => <Skeleton.Card key={i} h={150} />)}
      {error && <ErrorState error={error} onRetry={run} title="Could not fetch recommendations" />}
      <div className="col" style={{ gap: 12, opacity: loading && data ? 0.55 : 1, transition: 'opacity .2s' }}>
        {data?.items?.map((it) => <ResultCard key={`${it.station.id}-${it.point.pointId}`} item={it} selected={selectedId === it.station.id} onSelect={onSelect} onBook={book} onOpen={onOpen} />)}
      </div>
      {data && data.items?.length === 0 && !loading && (
        <EmptyState icon={<SearchX size={26} />} title="No compatible chargers nearby" text="Try a lower target charge, another connector type, or a different arrival time." />
      )}
    </div>
  );
}
