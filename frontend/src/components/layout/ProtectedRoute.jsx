import { Navigate, useLocation } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { useAuth } from '../../lib/auth.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import { Link } from 'react-router-dom';
import Button from '../ui/Button.jsx';

/** <ProtectedRoute roles={['ADMIN']}>page</ProtectedRoute> - roles optional (any signed-in user). */
export default function ProtectedRoute({ roles, children }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <div className="page"><Skeleton h={28} w={240} /><div style={{ height: 16 }} /><Skeleton h={220} r={16} /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: loc }} />;
  if (roles && !roles.includes(user.role)) {
    return <div className="page"><EmptyState icon={<ShieldOff size={26} />} title="Not authorised" text={`Your role (${user.role}) cannot open this page.`} action={<Link to="/"><Button variant="primary">Back to chargers</Button></Link>} /></div>;
  }
  return children;
}
