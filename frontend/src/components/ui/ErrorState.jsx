import { AlertTriangle } from 'lucide-react';
import Button from './Button.jsx';

/** <ErrorState error={apiError} onRetry={reload} title? /> */
export default function ErrorState({ error, onRetry, title = 'Something went wrong' }) {
  return (
    <div className="empty">
      <div className="e-icon err"><AlertTriangle size={26} /></div>
      <h3>{title}</h3>
      <p>{error?.message || 'Please try again.'}</p>
      {onRetry && <Button size="sm" onClick={onRetry}>Retry</Button>}
    </div>
  );
}
