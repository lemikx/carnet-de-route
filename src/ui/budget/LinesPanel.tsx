import { useState } from 'react';
import { useApp } from '../../app/AppContext';
import { formatEur } from '../../domain/budget/money';
import type { PlannedItem } from '../../domain/budget/planned';
import { BUDGET_CATEGORIES, type BudgetData, type BudgetLine } from '../../domain/budget/types';
import type { Reservation } from '../../domain/types';
import { createBudgetService } from '../../services/budgetService';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { SaveError } from '../common/SaveError';
import { useSave } from '../common/useSave';
import { LineForm } from './LineForm';
import { CATEGORY_LABELS, MODE_LABELS } from './labels';

export function LinesPanel({
  tripId, data, items, reservations, disabled, onChange,
}: {
  tripId: string;
  data: BudgetData;
  items: PlannedItem[];
  reservations: Reservation[];
  disabled: boolean;
  onChange(): void | Promise<void>;
}) {
  const { repo, fx } = useApp();
  const [editing, setEditing] = useState<BudgetLine | 'new' | null>(null);
  const [deleting, setDeleting] = useState<BudgetLine | null>(null);
  const action = useSave(async (make: () => Promise<unknown>) => {
    await make();
    await onChange();
    return true;
  });
  const busy = disabled || action.saving;
  const lineById = new Map(data.lines.map((l) => [l.id, l]));
  const resById = new Map(reservations.map((r) => [`res:${r.id}`, r]));

  return (
    <section className="card">
      <h2>Prévu</h2>
      <SaveError error={action.error} onRetry={action.retry} />
      <div className="trip-actions" style={{ marginBottom: 8 }}>
        {editing !== 'new' && <button className="btn btn-small btn-primary" disabled={busy} onClick={() => setEditing('new')}>Ajouter une ligne</button>}
        <button className="btn btn-small" disabled={busy} onClick={() => action.run(() => createBudgetService(repo, fx).addUsualLines(tripId))}>Ajouter les postes habituels</button>
      </div>
      {editing === 'new' && (
        <LineForm tripId={tripId} position={data.lines.length} disabled={busy} onCancel={() => setEditing(null)}
          onSave={(l) => action.run(async () => { await repo.saveBudgetLine(l); setEditing(null); })} />
      )}
      {items.length === 0 && editing !== 'new' && <p className="empty">Aucune ligne prévue pour l’instant</p>}
      {BUDGET_CATEGORIES.map((category) => {
        const inCategory = items.filter((i) => i.category === category);
        if (inCategory.length === 0) return null;
        return (
          <div key={category}>
            <h3>{CATEGORY_LABELS[category]}</h3>
            <ul className="list">
              {inCategory.map((item) => {
                const line = lineById.get(item.key);
                const reservation = resById.get(item.key);
                if (line && editing && editing !== 'new' && editing.id === line.id) {
                  return (
                    <li key={item.key}>
                      <LineForm tripId={tripId} initial={line} position={line.position} disabled={busy} onCancel={() => setEditing(null)}
                        onSave={(l) => action.run(async () => { await repo.saveBudgetLine(l); setEditing(null); })} />
                    </li>
                  );
                }
                return (
                  <li key={item.key} className="check-item">
                    <span className="label">
                      {item.label}
                      {line && <span className="muted"> · {line.amount.toLocaleString('fr-FR')} {line.currency} · {MODE_LABELS[line.mode]}</span>}
                      {reservation && <> <span className="badge">réservation</span></>}
                      {item.missingRate && <> <span className="badge overdue">taux manquant</span></>}
                    </span>
                    <strong>{formatEur(item.plannedCents)}</strong>
                    {line && (
                      <>
                        <button className="btn btn-small" disabled={busy} onClick={() => setEditing(line)}>Modifier</button>
                        <button className="btn btn-small btn-danger-text" disabled={busy} onClick={() => setDeleting(line)}>Supprimer</button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {items.some((i) => i.missingRate) && (
        <p className="muted">Le taux de change d’une réservation n’a pas pu être obtenu : le montant n’est pas compté. Il sera repris à la prochaine ouverture de l’onglet, une fois le service de taux joignable.</p>
      )}
      {deleting && (
        <ConfirmDialog title={`Supprimer « ${deleting.label} » ?`} confirmLabel="Supprimer" danger
          onConfirm={() => { const id = deleting.id; setDeleting(null); void action.run(() => repo.deleteBudgetLine(id)); }}
          onCancel={() => setDeleting(null)}>
          <p>Les dépenses rattachées à cette ligne sont conservées, comme « hors prévu ».</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
