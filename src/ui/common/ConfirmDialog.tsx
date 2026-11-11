import { useEffect, useRef, type ReactNode } from 'react';

export function ConfirmDialog({
  title, children, confirmLabel = 'Confirmer', danger = false, onConfirm, onCancel,
}: {
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm(): void;
  onCancel(): void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-labelledby="dialog-title" className="dialog" onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
        <h2 id="dialog-title">{title}</h2>
        {children}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel}>Annuler</button>
          <button type="button" ref={ref} className={danger ? 'btn btn-danger' : 'btn btn-primary'} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
