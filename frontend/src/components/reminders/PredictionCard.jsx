import { Clock, Zap, MapPin, History, FlaskConical, Info } from 'lucide-react';
import Sparkline from '../ui/Sparkline.jsx';
import Button from '../ui/Button.jsx';
import DueRing from './DueRing.jsx';
import { STATE_META, confidenceCls, confidenceLabel, agoText, splitLabel } from './reminderUtil.js';
import { dateTimeShort, kwh, parseLocal } from '../../lib/format.js';

const pad = (h) => `${String(h).padStart(2, '0')}:00`;

/** One vehicle's prediction (PredictionDto): state chip, due ring, cadence sparkline, preferences, confidence meter. */
export default function PredictionCard({ p, now, onDemo, demoBusy, demoDisabled }) {
  const meta = STATE_META[p.state] || STATE_META.NO_DATA;
  const noData = p.state === 'NO_DATA';
  const gaps = (p.cadenceHistory || []).map((c) => c.intervalDays);
  const conf = Math.round((p.confidence || 0) * 100);
  return (
    <div className={`card pred-card ${p.state.toLowerCase().replace('_', '-')}`}>
      <div className="row between start gap-12">
        <div className="grow">
          <div className="pred-name truncate" title={p.vehicleLabel}>{splitLabel(p.vehicleLabel).name}</div>
          <div className="muted small mt-4"><span className="veh-plate sm">{splitLabel(p.vehicleLabel).reg}</span> {noData ? 'Learning your pattern' : `· last charge ${agoText(parseLocal(p.lastChargeAt), now)}`}</div>
        </div>
        <span className={`pill ${meta.cls}`}><span className="dot" />{meta.label}</span>
      </div>

      <div className="pred-mid">
        <DueRing prediction={p} now={now} />
        <div className="grow pred-cadence">
          {noData ? (
            <div className="pred-empty">
              <Info size={15} />
              <span>Needs <b>3+ completed charges</b> to predict ({p.sessionsUsed || 0} so far). Rule of thumb meanwhile: about every <b>{Math.max(1, Math.round(p.medianIntervalDays || 0))} days</b>.</span>
            </div>
          ) : (
            <>
              <div className="row between small"><span className="muted">Charging cadence</span><b>every {p.medianIntervalDays.toFixed(1)} d</b></div>
              <div className="pred-spark"><Sparkline data={gaps} color={meta.color} width={200} height={44} /></div>
              <div className="row between xs faint"><span>{gaps.length ? `last ${gaps.length} gaps` : ''}</span><span>{gaps.length ? `${Math.min(...gaps).toFixed(1)}–${Math.max(...gaps).toFixed(1)} d` : ''}</span></div>
            </>
          )}
        </div>
      </div>

      {!noData && (
        <>
          <div className="pred-facts">
            <div title="Hour you most often start charging"><span className="f-label"><Clock size={11} /> Usual time</span><b>{pad(p.preferredHour)}</b></div>
            <div title="Average energy per session"><span className="f-label"><Zap size={11} /> Avg energy</span><b>{kwh(p.avgEnergyKwh)}</b></div>
            <div title="Completed sessions used"><span className="f-label"><History size={11} /> Sessions</span><b>{p.sessionsUsed}</b></div>
          </div>
          {p.preferredStationName && <div className="muted small row gap-6 mt-8"><MapPin size={13} className="text-primary" /><span className="truncate">Usual station: <b className="pred-station">{p.preferredStationName}</b></span></div>}
          <div className="mt-12">
            <div className="row between small"><span className="muted">Confidence</span><b>{conf}% · {confidenceLabel(p.confidence)}</b></div>
            <div className={`progress mt-4 ${confidenceCls(p.confidence)}`}><span style={{ width: `${conf}%` }} /></div>
          </div>
          <div className="faint xs mt-8">Next due: {dateTimeShort(p.nextDueAt)}</div>
        </>
      )}
      {onDemo && (
        <div className="pred-foot">
          <Button size="sm" variant="ghost" icon={<FlaskConical size={14} />} loading={demoBusy} disabled={demoDisabled || noData} onClick={() => onDemo(p)} title={noData ? 'Needs 3+ sessions' : 'Demo: pretend this vehicle is due right now'}>Demo trigger</Button>
        </div>
      )}
    </div>
  );
}

/** Compact prediction line used on Garage vehicle cards. */
export function PredictionMini({ p, now }) {
  if (!p) return null;
  const meta = STATE_META[p.state] || STATE_META.NO_DATA;
  const noData = p.state === 'NO_DATA';
  const gaps = (p.cadenceHistory || []).map((c) => c.intervalDays);
  return (
    <div className="pred-mini">
      <div className="row between">
        <span className="small bold row gap-6"><Zap size={13} className="text-primary" />Next charge</span>
        <span className={`pill ${meta.cls}`}><span className="dot" />{meta.label}</span>
      </div>
      {noData ? <div className="muted small mt-4">Not enough history yet (needs 3+ sessions).</div> : (
        <div className="row between mt-4 gap-8">
          <div className="small"><b>{dateTimeShort(p.nextDueAt)}</b><div className="muted xs">every ~{p.medianIntervalDays.toFixed(1)} days · {Math.round(p.confidence * 100)}% confident</div></div>
          <Sparkline data={gaps} color={meta.color} width={70} height={26} />
        </div>
      )}
    </div>
  );
}
