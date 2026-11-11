import { useEffect, useState, type FormEvent } from 'react';
import { useApp } from '../../app/AppContext';
import { parseAmount } from '../../domain/budget/money';
import { settingsOf, type BudgetData, type CapMode, type Traveler } from '../../domain/budget/types';
import type { Trip } from '../../domain/types';
import { BudgetError } from '../../data/TripRepository';

const TRAVELER_ERRORS = {
  TRAVELER_IN_USE: 'Ce voyageur a des dépenses : réaffecte-les d’abord.',
  LAST_TRAVELER: 'Il faut au moins un voyageur.',
  NO_PARTICIPANT: 'Enregistrement impossible.',
  BOTH_LINKS: 'Enregistrement impossible.',
} as const;

export function SettingsPanel({ trip, data, disabled, onChanged }: { trip: Trip; data: BudgetData; disabled: boolean; onChanged(): Promise<void> }) {
  const { repo } = useApp();
  const settings = settingsOf(trip);
  const [cap, setCap] = useState(settings.cap === null ? '' : String(settings.cap).replace('.', ','));
  const [mode, setMode] = useState<CapMode>(settings.capMode);
  const [margin, setMargin] = useState(String(settings.fxMarginPct));
  const [capError, setCapError] = useState<string | null>(null);
  const [travelerError, setTravelerError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    setCap(settings.cap === null ? '' : String(settings.cap).replace('.', ','));
    setMode(settings.capMode);
    setMargin(String(settings.fxMarginPct));
  }, [settings.cap, settings.capMode, settings.fxMarginPct]);

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    const m = Number(margin.replace(',', '.'));
    if (margin.trim() === '' || Number.isNaN(m) || m < 0 || m > 20) return setCapError('La marge doit être entre 0 et 20 %.');
    let value: number | null = null;
    if (cap.trim() !== '') {
      value = parseAmount(cap);
      if (value === null) return setCapError('Montant invalide (2 décimales au plus).');
    }
    setCapError(null);
    try {
      await repo.updateBudgetSettings(trip.id, { cap: value, capMode: mode, fxMarginPct: m });
      await onChanged();
    } catch {
      setCapError('Enregistrement impossible.');
    }
  }

  async function travelerAction(run: () => Promise<unknown>) {
    setTravelerError(null);
    try {
      await run();
      await onChanged();
    } catch (e) {
      setTravelerError(e instanceof BudgetError ? TRAVELER_ERRORS[e.code] : 'Enregistrement impossible.');
    }
  }

  const rename = (t: Traveler, name: string) => {
    const n = name.trim();
    if (n && n !== t.name) void travelerAction(() => repo.saveTraveler({ ...t, name: n }));
  };

  return (
    <section className="card form">
      <h2>Enveloppe maximale</h2>
      <form className="form" onSubmit={saveSettings}>
        <div className="row">
          <label>
            Enveloppe maximale (€)
            <input inputMode="decimal" value={cap} placeholder="Aucune" onChange={(e) => setCap(e.target.value)} disabled={disabled} />
          </label>
          <label>
            Mode de l’enveloppe
            <select value={mode} onChange={(e) => setMode(e.target.value as CapMode)} disabled={disabled}>
              <option value="total">Au total</option>
              <option value="per_person">Par personne</option>
            </select>
          </label>
          <label>
            Marge de sécurité sur les devises (%)
            <input inputMode="decimal" value={margin} onChange={(e) => setMargin(e.target.value)} disabled={disabled} />
          </label>
        </div>
        <p className="muted">Sans enveloppe, l’appli affiche les totaux et les écarts, sans alerte.</p>
        {capError && <p role="alert" className="field-error">{capError}</p>}
        <div><button className="btn btn-primary" disabled={disabled}>Enregistrer l’enveloppe</button></div>
      </form>

      <h2>Voyageurs</h2>
      <ul className="list">
        {data.travelers.map((t) => (
          <li key={t.id} className="check-item">
            <input aria-label={`Prénom de ${t.name}`} defaultValue={t.name} maxLength={60} disabled={disabled} onBlur={(e) => rename(t, e.target.value)} />
            <button type="button" className="btn btn-small btn-danger-text" disabled={disabled} onClick={() => travelerAction(() => repo.deleteTraveler(t.id))}>Supprimer</button>
          </li>
        ))}
      </ul>
      <div className="row">
        <label>
          Nouveau voyageur
          <input value={newName} maxLength={60} onChange={(e) => setNewName(e.target.value)} disabled={disabled} />
        </label>
        <div style={{ alignSelf: 'end', flex: '0 0 auto' }}>
          <button type="button" className="btn" disabled={disabled || !newName.trim()}
            onClick={() => travelerAction(async () => { await repo.saveTraveler({ tripId: trip.id, name: newName.trim(), position: data.travelers.length }); setNewName(''); })}>
            Ajouter
          </button>
        </div>
      </div>
      {travelerError && <p role="alert" className="field-error">{travelerError}</p>}
    </section>
  );
}
