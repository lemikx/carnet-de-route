import { useCallback, useState, type FormEvent } from 'react';
import { useApp } from '../../app/AppContext';
import { CHECKLIST_CATEGORIES, checklistProgress, isOverdue } from '../../domain/checklist';
import { formatDate } from '../../domain/format';
import type { ChecklistCategory, ChecklistItem, TripBundle } from '../../domain/types';
import { useOnline } from '../../offline/useOnline';
import { SaveError } from '../common/SaveError';
import { useSave } from '../common/useSave';
import type { TripTabProps } from './types';

const today = () => new Date().toLocaleDateString('sv-SE');

function AddItem({ category, disabled, onAdd }: { category: ChecklistCategory; disabled: boolean; onAdd(label: string, due: string | null): void }) {
  const [label, setLabel] = useState('');
  const [due, setDue] = useState('');
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    onAdd(label.trim(), due || null);
    setLabel('');
    setDue('');
  }
  return (
    <form className="row" onSubmit={submit} style={{ marginTop: 8 }}>
      <input aria-label={`Nouvel élément (${category})`} placeholder="Ajouter un élément" value={label} onChange={(e) => setLabel(e.target.value)} disabled={disabled} />
      <input aria-label="Échéance" type="date" value={due} onChange={(e) => setDue(e.target.value)} disabled={disabled} style={{ flex: '0 1 170px' }} />
      <button className="btn btn-small" disabled={disabled || !label.trim()} style={{ flex: '0 0 auto' }}>Ajouter</button>
    </form>
  );
}

export function ChecklistTab({ bundle, setBundle }: TripTabProps) {
  const { repo } = useApp();
  const online = useOnline();
  const action = useSave(useCallback(async (make: () => Promise<unknown>) => {
    try {
      await make();
    } finally {
      // Relit l'état réel (annule l'affichage immédiat si l'enregistrement a échoué).
      setBundle(await repo.getBundle(bundle.trip.id) as TripBundle);
    }
  }, [repo, bundle.trip.id, setBundle]));
  const disabled = !online;
  const { done, total } = checklistProgress(bundle.checklist);
  const now = today();

  const save = (i: ChecklistItem) => {
    setBundle({ ...bundle, checklist: bundle.checklist.map((x) => (x.id === i.id ? i : x)) });
    return action.run(() => repo.saveChecklistItem(i));
  };
  return (
    <div>
      <p><strong>{done}/{total} faits</strong></p>
      <div className="progress" aria-hidden><span style={{ width: total ? `${(done / total) * 100}%` : 0 }} /></div>
      <SaveError error={action.error} onRetry={action.retry} />
      {CHECKLIST_CATEGORIES.map((cat) => {
        const items = bundle.checklist.filter((i) => i.category === cat.id).sort((a, b) => a.position - b.position);
        return (
          <section key={cat.id} className="card" style={{ marginBottom: 12 }}>
            <h2>{cat.label}</h2>
            <ul className="list" style={{ gap: 0 }}>
              {items.map((i) => (
                <li key={i.id} className={`check-item${i.done ? ' done' : ''}${isOverdue(i, now) ? ' overdue-item' : ''}`}>
                  <input type="checkbox" aria-label={i.label} checked={i.done} disabled={disabled} onChange={() => save({ ...i, done: !i.done })} />
                  <span className="label">{i.label}</span>
                  {i.dueDate && <span className={isOverdue(i, now) ? 'overdue' : 'muted'}>avant le {formatDate(i.dueDate)}</span>}
                  <button type="button" className="btn-link btn-danger-text" aria-label={`Supprimer ${i.label}`} disabled={disabled}
                    onClick={() => action.run(() => repo.deleteChecklistItem(i.id))}>✕</button>
                </li>
              ))}
            </ul>
            <AddItem category={cat.id} disabled={disabled}
              onAdd={(label, dueDate) => action.run(() => repo.saveChecklistItem({ tripId: bundle.trip.id, category: cat.id, label, done: false, dueDate, position: items.length }))} />
          </section>
        );
      })}
    </div>
  );
}
