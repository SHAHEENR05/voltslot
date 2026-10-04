import Modal from './Modal.jsx';
import Button from './Button.jsx';

/** <ConfirmDialog open title message confirmLabel danger loading onConfirm onCancel /> */
export default function ConfirmDialog({ open, title = 'Are you sure?', message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger, loading, onConfirm, onCancel, children }) {
  return (
    <Modal open={open} title={title} size="sm" onClose={onCancel}
      footer={<><Button variant="ghost" onClick={onCancel} disabled={loading}>{cancelLabel}</Button><Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>{confirmLabel}</Button></>}>
      {message && <p className="muted">{message}</p>}{children}
    </Modal>
  );
}
