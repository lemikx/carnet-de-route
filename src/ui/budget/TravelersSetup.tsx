import { useState, type FormEvent } from 'react';

const MAX = 20;

export function TravelersSetup({ disabled, onCreate }: { disabled: boolean; onCreate(names: string[]): void }) {
  const [count, setCount] = useState(2);
  const [names, setNames] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const filled = Array.from({ length: count }, (_, i) => (names[i] ?? '').trim()).filter(Boolean);
    if (filled.length === 0) return setError('Indique au moins un voyageur.');
    setError(null);
    onCreate(filled);
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2>Combien êtes-vous ?</h2>
      <p className="muted">Les prénoms servent à partager les frais : qui a payé, qui est concerné.</p>
      <label>
        Nombre de voyageurs
        <input type="number" min={1} max={MAX} value={count} onChange={(e) => setCount(Math.min(MAX, Math.max(1, Number(e.target.value) || 1)))} />
      </label>
      {Array.from({ length: count }, (_, i) => (
        <label key={i}>
          Prénom {i + 1}
          <input value={names[i] ?? ''} maxLength={60} onChange={(e) => setNames((n) => Object.assign([...n], { [i]: e.target.value }))} />
        </label>
      ))}
      {error && <p role="alert" className="field-error">{error}</p>}
      <div className="form-actions">
        <button className="btn btn-primary" disabled={disabled}>Commencer</button>
      </div>
    </form>
  );
}
