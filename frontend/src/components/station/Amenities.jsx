import { Coffee, Bath, Wifi, Car, ShoppingBag, Sofa, ShieldCheck, Utensils, Wrench, Sparkles } from 'lucide-react';
import Chip from '../ui/Chip.jsx';

const ICONS = { coffee: Coffee, bath: Bath, wifi: Wifi, car: Car, 'shopping-bag': ShoppingBag, sofa: Sofa, 'shield-check': ShieldCheck, utensils: Utensils, wrench: Wrench };

export default function Amenities({ items = [] }) {
  if (!items.length) return <div className="muted small">No amenities listed for this station.</div>;
  return (
    <div className="row wrap gap-8">
      {items.map((a) => { const I = ICONS[a.icon] || Sparkles; return <Chip key={a.id} icon={<I size={13} />}>{a.name}</Chip>; })}
    </div>
  );
}
