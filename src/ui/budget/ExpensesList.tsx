import { useState } from 'react';
import { useApp } from '../../app/AppContext';
import { formatEur } from '../../domain/budget/money';
import { expenseCents } from '../../domain/budget/projection';
import type { BudgetData, Expense } from '../../domain/budget/types';
import type { Reservation } from '../../domain/types';
import { formatDate } from '../../domain/format';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { SaveError } from '../common/SaveError';
import { useSave } from '../common/useSave';
import { ExpenseForm } from './ExpenseForm';
import { CATEGORY_LABELS } from './labels';

export function ExpensesList({
  tripId, data, reservations, localCurrency, disabled, onChange,
}: {
  tripId: string;
  data: BudgetData;
  reservations: Reservation[];
  localCurrency: string;
  disabled: boolean;
  onChange(): void | Promise<void>;
}) {
  const { repo } = useApp();
  const [editing, setEditing] = useState<Expense | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);
  // La fermeture du formulaire fait partie de l'action : « Réessayer » la refait aussi, et la saisie reste en cas d'échec.
  const action = useSave(async (make: () => Promise<unknown>) => {
    await make();
    await onChange();
    return true;
  });
  const busy = disabled || action.saving;
  const nameOf = new Map(data.travelers.map((t) => [t.id, t.name]));
  const sorted = [...data.expenses].sort((a, b) => b.date.localeCompare(a.date));

  const form = (initial?: Expense) => (
    <ExpenseForm
      tripId={tripId} data={data} reservations={reservations} localCurrency={localCurrency} initial={initial} disabled={busy}
      onCancel={() => setEditing(null)}
      onSave={(e) => void action.run(async () => { await repo.saveExpense(e); setEditing(null); })}
    />
  );

  return (
    <section className="card">
      <h2>Dépenses</h2>
      <SaveError error={action.error} onRetry={action.retry} />
      {editing === 'new' ? form() : (
        <button className="btn btn-small btn-primary" disabled={busy} onClick={() => setEditing('new')}>Ajouter une dépense</button>
      )}
      {sorted.length === 0 && editing !== 'new' && <p className="empty">Aucune dépense pour l’instant</p>}
      <ul className="list" style={{ marginTop: 10 }}>
        {sorted.map((e) =>
          editing !== 'new' && editing?.id === e.id ? (
            <li key={e.id}>{form(e)}</li>
          ) : (
            <li key={e.id} className="check-item">
              <span className="label">
                <strong>{e.label}</strong>
                <span className="muted"> · {formatDate(e.date)} · {CATEGORY_LABELS[e.category]} · payé par {nameOf.get(e.paidBy) ?? '?'}
                  {e.participantIds.length < data.travelers.length && ` · ${e.participantIds.length} concerné(s)`}
                  {e.currency !== 'EUR' && ` · ${e.amount.toLocaleString('fr-FR')} ${e.currency}`}</span>
              </span>
              <strong>{formatEur(expenseCents(e))}</strong>
              <button className="btn btn-small" disabled={busy} onClick={() => setEditing(e)}>Modifier</button>
              <button className="btn btn-small btn-danger-text" disabled={busy} onClick={() => setDeleting(e)}>Supprimer</button>
            </li>
          ),
        )}
      </ul>
      {deleting && (
        <ConfirmDialog title={`Supprimer « ${deleting.label} » ?`} confirmLabel="Supprimer" danger
          onConfirm={() => { const id = deleting.id; setDeleting(null); void action.run(() => repo.deleteExpense(id)); }}
          onCancel={() => setDeleting(null)} />
      )}
    </section>
  );
}
