import { useCallback, useState, type FormEvent } from 'react';
import { useApp } from '../../app/AppContext';
import type { Contact, ContactKind } from '../../domain/types';
import { useOnline } from '../../offline/useOnline';
import { SaveError } from '../common/SaveError';
import { useSave } from '../common/useSave';
import { CONTACT_LABELS } from './labels';
import type { TripTabProps } from './types';

type Draft = Omit<Contact, 'id' | 'tripId'>;
const empty: Draft = { name: '', kind: 'embassy', phone: '', address: '', note: '' };

function ContactForm({ initial, disabled, onSave, onCancel }: { initial: Draft; disabled: boolean; onSave(d: Draft): void; onCancel(): void }) {
  const [v, setV] = useState(initial);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (v.name.trim()) onSave({ ...v, name: v.name.trim() });
  }
  return (
    <form className="card form" onSubmit={submit}>
      <div className="row">
        <label>Nom<input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Ex. Ambassade de France" /></label>
        <label>
          Catégorie
          <select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as ContactKind })}>
            {Object.entries(CONTACT_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
      </div>
      <div className="row">
        <label>Téléphone<input type="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></label>
        <label>Adresse<input value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} /></label>
      </div>
      <label>Note<textarea rows={2} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} /></label>
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>Annuler</button>
        <button className="btn btn-primary" disabled={disabled || !v.name.trim()}>Enregistrer</button>
      </div>
    </form>
  );
}

export function ContactsTab({ bundle, setBundle }: TripTabProps) {
  const { repo } = useApp();
  const online = useOnline();
  const [editing, setEditing] = useState<Contact | 'new' | null>(null);
  const action = useSave(useCallback(async (p: Promise<unknown>) => {
    await p;
    setBundle(await repo.getBundle(bundle.trip.id));
  }, [repo, bundle.trip.id, setBundle]));
  const disabled = !online || action.saving;
  return (
    <div>
      <SaveError error={action.error} onRetry={action.retry} />
      {editing === 'new' ? (
        <ContactForm initial={empty} disabled={disabled} onCancel={() => setEditing(null)}
          onSave={(d) => { setEditing(null); void action.run(repo.saveContact({ ...d, tripId: bundle.trip.id })); }} />
      ) : (
        <button className="btn btn-primary" onClick={() => setEditing('new')} disabled={disabled} style={{ marginBottom: 12 }}>Ajouter un contact</button>
      )}
      {bundle.contacts.length === 0 && editing !== 'new' && (
        <p className="empty">Ajoute les contacts utiles : ambassade, numéros d’urgence, hébergements…</p>
      )}
      <ul className="list">
        {bundle.contacts.map((c) =>
          editing !== 'new' && editing?.id === c.id ? (
            <li key={c.id}>
              <ContactForm initial={c} disabled={disabled} onCancel={() => setEditing(null)}
                onSave={(d) => { setEditing(null); void action.run(repo.saveContact({ ...c, ...d })); }} />
            </li>
          ) : (
            <li key={c.id} className="card">
              <div className="day-head"><strong>{c.name}</strong><span className="badge">{CONTACT_LABELS[c.kind]}</span></div>
              {c.phone && <p><a href={`tel:${c.phone}`}>{c.phone}</a></p>}
              {c.address && <p className="muted">{c.address}</p>}
              {c.note && <p>{c.note}</p>}
              <div className="trip-actions" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-small" onClick={() => setEditing(c)} disabled={disabled}>Modifier</button>
                <button className="btn btn-small btn-danger-text" onClick={() => action.run(repo.deleteContact(c.id))} disabled={disabled}>Supprimer</button>
              </div>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
