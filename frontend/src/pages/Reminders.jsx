import { useEffect, useMemo, useState } from 'react';
import { BellRing, RefreshCw, BatteryCharging, Settings2, Lightbulb, Car, Save } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { useClock } from '../lib/clock.jsx';
import { useToast } from '../lib/toast.jsx';
import { useFetch } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { Button, Card, EmptyState, ErrorState, Skeleton, Slider, Toggle } from '../components/ui';
import PredictionCard from '../components/reminders/PredictionCard.jsx';
import { REMINDERS_CHANGED, notifyRemindersChanged, showRemindersAgain } from '../components/reminders/reminderUtil.js';

/** Smart reminders: per-vehicle recharge predictions, reminder settings and the demo trigger. */
export default function Reminders() {
  const { user, refreshUser } = useAuth();
  const { now } = useClock();
  const toast = useToast();
  const preds = useFetch('/reminders/predictions');
  const active = useFetch('/reminders/active');
  const [busyVeh, setBusyVeh] = useState(null);
  const [checking, setChecking] = useState(false);
  const [enabled, setEnabled] = useState(user?.reminderEnabled ?? true);
  const [lead, setLead] = useState(user?.reminderLeadHours ?? 12);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (user) { setEnabled(user.reminderEnabled); setLead(user.reminderLeadHours); } }, [user?.reminderEnabled, user?.reminderLeadHours]); // eslint-disable-line

  useEffect(() => {
    const h = () => { preds.reload(true); active.reload(true); };
    window.addEventListener(REMINDERS_CHANGED, h);
    return () => window.removeEventListener(REMINDERS_CHANGED, h);
  }); // re-bind each render so the latest reload closures are used

  const dirty = user && (enabled !== user.reminderEnabled || lead !== user.reminderLeadHours);
  const list = preds.data || [];
  const counts = useMemo(() => list.reduce((m, p) => ({ ...m, [p.state]: (m[p.state] || 0) + 1 }), {}), [list]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/users/me', { fullName: user.fullName, phone: user.phone, city: user.city, homeLat: user.homeLat, homeLon: user.homeLon, reminderEnabled: enabled, reminderLeadHours: lead });
      await refreshUser();
      toast.success(enabled ? `Reminders on - we will nudge you ${lead} h before you are due.` : 'Reminders switched off.');
      preds.reload(true); notifyRemindersChanged();
    } catch (e) { toast.error(e); } finally { setSaving(false); }
  };

  const recheck = async () => {
    setChecking(true);
    try {
      const r = await api.post('/reminders/refresh');
      await Promise.all([preds.reload(true), active.reload(true)]);
      notifyRemindersChanged();
      toast.info(r.active ? `${r.active} reminder${r.active === 1 ? '' : 's'} active.` : 'All good - nothing is due yet.');
    } catch (e) { toast.error(e); } finally { setChecking(false); }
  };

  const demo = async (p) => {
    setBusyVeh(p.vehicleId);
    try {
      await api.post('/reminders/demo-trigger', { vehicleId: p.vehicleId });
      await api.post('/reminders/refresh');
      await Promise.all([preds.reload(true), active.reload(true)]);
      showRemindersAgain();
      toast.info(`Demo: ${p.vehicleLabel.split('·')[0].trim()} is now due.`);
    } catch (e) { toast.error(e); } finally { setBusyVeh(null); }
  };

  const activeList = active.data || [];

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Smart reminders</h1><p>VoltSlot learns how often you charge and nudges you just before you run low - like a re-order reminder for your battery.</p></div>
        <div className="row gap-8">
          <Button variant="ghost" icon={<RefreshCw size={15} />} loading={checking} onClick={recheck}>Re-check now</Button>
        </div>
      </div>

      {activeList.length > 0 && (
        <Card hero className="rem-active mb-16">
          <div className="row gap-16 wrap">
            <div className="rem-active-ico"><BellRing size={22} /></div>
            <div className="grow">
              <h3>{activeList.length} reminder{activeList.length === 1 ? ' is' : 's are'} waiting for you</h3>
              <div className="muted small mt-4">{activeList.map((a) => `${a.vehicle.make} ${a.vehicle.model}`).join(' · ')} - {activeList[0].suggestion ? `a slot is ready at ${activeList[0].suggestion.stationName}.` : 'open the finder to pick a slot.'}</div>
            </div>
            <Button icon={<BatteryCharging size={16} />} onClick={showRemindersAgain}>Open reminder</Button>
          </div>
        </Card>
      )}

      <div className="rem-layout">
        <div>
          {preds.loading && <div className="grid auto-lg"><Skeleton.Card h={340} /><Skeleton.Card h={340} /></div>}
          {preds.error && <ErrorState error={preds.error} onRetry={preds.reload} />}
          {!preds.loading && !preds.error && list.length === 0 && (
            <Card><EmptyState icon={<Car size={26} />} title="No vehicles yet" text="Add a vehicle in your Garage and VoltSlot will start learning its charging rhythm." /></Card>
          )}
          {!preds.loading && list.length > 0 && (
            <>
              <div className="row wrap gap-8 mb-16">
                {['OVERDUE', 'DUE_SOON', 'UPCOMING', 'NO_DATA'].filter((s) => counts[s]).map((s) => (
                  <span key={s} className={`pill ${{ OVERDUE: 'red', DUE_SOON: 'amber', UPCOMING: 'primary', NO_DATA: 'grey' }[s]}`}><span className="dot" />{counts[s]} {({ OVERDUE: 'overdue', DUE_SOON: 'due soon', UPCOMING: 'upcoming', NO_DATA: 'no data yet' })[s]}</span>
                ))}
              </div>
              <div className="grid auto-lg stagger">
                {list.map((p) => <PredictionCard key={p.vehicleId} p={p} now={now} onDemo={demo} demoBusy={busyVeh === p.vehicleId} demoDisabled={busyVeh !== null && busyVeh !== p.vehicleId} />)}
              </div>
            </>
          )}
        </div>

        <div className="col gap-16">
          <Card title="Reminder settings" icon={<Settings2 size={16} className="text-primary" />} subtitle="Saved to your profile">
            <div className="row between gap-12">
              <div><b>Enable recharge reminders</b><div className="muted small">Show the &quot;time to recharge&quot; popup.</div></div>
              <Toggle checked={enabled} onChange={setEnabled} label="Enable reminders" />
            </div>
            <div className={`mt-16 ${enabled ? '' : 'rem-disabled'}`}>
              <div className="row between small"><span className="muted">Remind me before due</span><b>{lead} h</b></div>
              <Slider min={1} max={72} step={1} value={lead} onChange={setLead} ariaLabel="Lead hours" />
              <div className="row between xs faint"><span>1 h</span><span>72 h</span></div>
            </div>
            <Button className="mt-16" block icon={<Save size={15} />} loading={saving} disabled={!dirty} onClick={save}>Save settings</Button>
          </Card>

          <Card title="How it works" icon={<Lightbulb size={16} className="text-amber" />}>
            <ol className="rem-steps">
              <li><b>Learn.</b> We take the gaps between your last 6 completed charges and use the median.</li>
              <li><b>Predict.</b> Last charge + median = when you will need power again, with a confidence score.</li>
              <li><b>Nudge.</b> Within your lead time we pop up a ready-made slot at a quiet nearby station.</li>
            </ol>
            <div className="muted xs mt-8">Demo trigger forces a vehicle to be due right now so you can see the popup.</div>
          </Card>
        </div>
      </div>
    </div>
  );
}
