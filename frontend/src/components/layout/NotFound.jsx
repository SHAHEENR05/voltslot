import { Link } from 'react-router-dom';
import { Unplug } from 'lucide-react';
import EmptyState from '../ui/EmptyState.jsx';
import Button from '../ui/Button.jsx';

export default function NotFound() {
  return <div className="page"><EmptyState icon={<Unplug size={28} />} title="404 – Page not found" text="This charger seems to be unplugged. The page you are looking for does not exist." action={<Link to="/"><Button variant="primary">Find chargers</Button></Link>} /></div>;
}
