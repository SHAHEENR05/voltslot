import { useMemo, useState } from 'react';
import { Plus, Car } from 'lucide-react';
import { useAsync } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { useClock } from '../lib/clock.jsx';
import { useToast } from '../lib/toast.jsx';
import { api } from '../lib/api.js';
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, Skeleton } from '../components/ui';
import VehicleCard from '../components/garage/VehicleCard.jsx';
import VehicleModal from '../components/garage/VehicleModal.jsx';

/** Garage: my vehicles (fleet manager: the fleet) with add / edit / delete and a prediction mini card per vehicle. */
export default function Garage() {
  const { isFleet } = useAuth();
  const { now } = useClock();
  const toast = useToast();
  const { data, loading, error, reload } = useAsync(async () => {
    const [vehicles, preds] = await Promise.all([api.get('/vehicles'), api.get('/reminders/predictions').catch(() => [])]);
    return { vehicles, preds };
  }, []);
  const [modal, setModal] = useState(null); // {vehicle|null}
  const [del, setDel] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const predBy = useMemo(() => new Map((data?.preds || []).map((p) => [p.vehicleId, p])), [data]);
  const vehicles = data?.vehicles || [];

  const remove = async () => {
    setDeleting(true);
    try { await api.del(`/vehicles/${del.id}`); toast.success(`${del.nickname || del.model} removed`); setDel(null); reload(true); }
    catch (e) { toast.error(e); setDel(null); }
    finally { setDeleting(false); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>{isFleet ? 'Fleet garage' : 'My garage'}</h1><p>Your vehicles drive every recommendation, cost estimate and recharge reminder.</p></div>
        <Button icon={<Plus size={16} />} onClick={() => setModal({ vehicle: null })}>Add vehicle</Button>
      </div>

      {loading && <div className="grid auto-lg"><Skeleton.Card h={300} /><Skeleton.Card h={300} /></div>}
      {error && <ErrorState error={error} onRetry={reload} />}
      {!loading && !error && vehicles.length === 0 && (
        <Card><EmptyState icon={<Car size={26} />} title="Your garage is empty" text="Add your EV to get personalised charger picks, accurate costs and smart recharge reminders." action={<Button icon={<Plus size={16} />} onClick={() => setModal({ vehicle: null })}>Add your first vehicle</Button>} /></Card>
      )}
      {!loading && vehicles.length > 0 && (
        <div className="grid auto-lg stagger">
          {vehicles.map((v) => <VehicleCard key={v.id} v={v} prediction={predBy.get(v.id)} now={now} onEdit={(x) => setModal({ vehicle: x })} onDelete={setDel} />)}
        </div>
      )}

      <VehicleModal open={!!modal} vehicle={modal?.vehicle} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(true); }} />
      <ConfirmDialog open={!!del} danger title="Remove vehicle?" confirmLabel="Remove" loading={deleting} onCancel={() => setDel(null)} onConfirm={remove}
        message={del ? `${del.make} ${del.model} (${del.regNumber}) and its charging history link will be removed from your garage. Vehicles with upcoming bookings cannot be removed.` : ''} />
    </div>
  );
}
