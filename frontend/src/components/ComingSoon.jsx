import { Hammer } from 'lucide-react';
import EmptyState from './ui/EmptyState.jsx';

export default function ComingSoon({ title }) {
  return <div className="page"><div className="page-head"><h1>{title}</h1></div><EmptyState icon={<Hammer size={26} />} title="Coming soon" text="This page is being built." /></div>;
}
