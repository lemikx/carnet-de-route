import { useState, type FormEvent } from 'react';

export interface TripFormValues {
  name: string;
  startDate: string;
  endDate: string;
  countries: string;
  localCurrency: string;
}

export function TripForm({
  initial, submitLabel, disabled, onSubmit, onCancel,
}: {
  initial?: Partial<TripFormValues>;
  submitLabel: string;
  disabled?: boolean;
  onSubmit(v: TripFormValues): void;
  onCancel(): void;
}) {
  const [v, setV] = useState<TripFormValues>({ name: '', startDate: '', endDate: '', countries: '', localCurrency: '', ...initial });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof TripFormValues) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!v.name.trim() || !v.startDate || !v.endDate) return setError('Indique un nom et les deux dates.');
    if (v.endDate < v.startDate) return setError('La date de retour doit être après la date de départ.');
    setError(null);
    onSubmit({ ...v, name: v.name.trim() });
  }
  return (
    <form className="card form" onSubmit={submit}>
      <label>
        Nom du voyage
        <input value={v.name} onChange={set('name')} placeholder="Ex. Japon en famille" required />
      </label>
      <div className="row">
        <label>
          Date de départ
          <input type="date" value={v.startDate} onChange={set('startDate')} required />
        </label>
        <label>
          Date de retour
          <input type="date" value={v.endDate} onChange={set('endDate')} required />
        </label>
      </div>
      <div className="row">
        <label>
          Pays (facultatif)
          <input value={v.countries} onChange={set('countries')} placeholder="Ex. Japon" />
        </label>
        <label>
          Devise locale
          <input value={v.localCurrency} onChange={set('localCurrency')} placeholder="Ex. JPY" maxLength={3} />
        </label>
      </div>
      {error && <p role="alert" className="field-error">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary" disabled={disabled}>{submitLabel}</button>
      </div>
    </form>
  );
}
