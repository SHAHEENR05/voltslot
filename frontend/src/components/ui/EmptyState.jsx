import { Inbox } from 'lucide-react';

/** <EmptyState icon={<Icon/>} title="Nothing here" text="..." action={<Button/>} /> */
export default function EmptyState({ icon, title = 'Nothing here yet', text, action }) {
  return (
    <div className="empty">
      <div className="e-icon">{icon || <Inbox size={26} />}</div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}
