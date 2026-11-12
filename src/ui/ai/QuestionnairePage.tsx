import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../app/AppContext';
import { LODGINGS, PACES, TRAVELER_TYPES, TRIP_TYPES, WISHES, type Option } from '../../ai/options';
import type { Brief, Pace } from '../../ai/types';
import { useOnline } from '../../offline/useOnline';
import { SaveError } from '../common/SaveError';
import { useSave } from '../common/useSave';
import { OPTIONAL_STEPS, STEPS, emptyBrief, parseAmount, validateStep, withTravelerCount, type StepId } from './questionnaireSteps';

const TITLES: Record<StepId, string> = {
  destination: 'Où veux-tu aller ?',
  dates: 'Quand pars-tu ?',
  departure: 'D’où pars-tu ?',
  travelers: 'Qui voyage ?',
  budget: 'Quel budget par personne ?',
  profile: 'Quel voyageur es-tu ?',
  lodging: 'Où dormir ?',
  pace: 'Quel rythme ?',
  constraints: 'Des contraintes particulières ?',
};

function Checks({ options, value, onChange }: { options: Option[]; value: string[]; onChange(v: string[]): void }) {
  return (
    <div className="chips">
      {options.map((o) => (
        <label key={o.id} className="chip">
          <input
            type="checkbox"
            checked={value.includes(o.id)}
            onChange={(e) => onChange(e.target.checked ? [...value, o.id] : value.filter((x) => x !== o.id))}
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

export function QuestionnairePage({ today }: { today?: string }) {
  const { ai } = useApp();
  const online = useOnline();
  const navigate = useNavigate();
  const now = today ?? new Date().toISOString().slice(0, 10);
  const [brief, setBrief] = useState<Brief>(emptyBrief);
  const [step, setStep] = useState(0);
  const [budgetText, setBudgetText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const id = STEPS[step];
  const set = (patch: Partial<Brief>) => setBrief((b) => ({ ...b, ...patch }));

  const finish = useSave(
    useCallback(async (b: Brief) => {
      const draft = await ai.startDraft(b);
      navigate(`/ia/${draft.id}`);
    }, [ai, navigate]),
  );

  function next(skip = false) {
    let b = brief;
    if (id === 'budget' && !skip) {
      const n = parseAmount(budgetText);
      if (n === undefined) return setError('Montant invalide.');
      b = { ...brief, budgetPerPersonEur: n };
      setBrief(b);
    }
    if (!skip) {
      const msg = validateStep(id, b, now);
      if (msg) return setError(msg);
    }
    setError(null);
    if (step < STEPS.length - 1) return setStep(step + 1);
    void finish.run({ ...b, destination: b.destination?.trim() || null, departureCity: b.departureCity?.trim() || null });
  }

  const last = step === STEPS.length - 1;
  return (
    <main className="page">
      <p className="muted">Question {step + 1} sur {STEPS.length}</p>
      <h1>{TITLES[id]}</h1>
      <form className="form" onSubmit={(e) => { e.preventDefault(); next(); }}>
        {id === 'destination' && (
          <label>Destination
            <input value={brief.destination ?? ''} onChange={(e) => set({ destination: e.target.value })} placeholder="Laisse vide pour « Surprends-moi »" />
          </label>
        )}
        {id === 'dates' && (
          <div className="row">
            <label>Date de départ<input type="date" value={brief.startDate} onChange={(e) => set({ startDate: e.target.value })} /></label>
            <label>Date de retour<input type="date" value={brief.endDate} onChange={(e) => set({ endDate: e.target.value })} /></label>
          </div>
        )}
        {id === 'departure' && (
          <label>Ville de départ
            <input value={brief.departureCity ?? ''} onChange={(e) => set({ departureCity: e.target.value })} />
          </label>
        )}
        {id === 'travelers' && (
          <>
            <div className="row">
              <label>Adultes
                <input type="number" min={0} max={20} value={brief.adults} onChange={(e) => setBrief(withTravelerCount(brief, Number(e.target.value) || 0, brief.children))} />
              </label>
              <label>Enfants
                <input type="number" min={0} max={20} value={brief.children} onChange={(e) => setBrief(withTravelerCount(brief, brief.adults, Number(e.target.value) || 0))} />
              </label>
            </div>
            {brief.travelers.map((t, i) => (
              <div className="row" key={i}>
                <label>Prénom du voyageur {i + 1} (facultatif)
                  <input value={t.name} onChange={(e) => set({ travelers: brief.travelers.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} />
                </label>
                <label>Nationalité du voyageur {i + 1}
                  <input value={t.nationality} maxLength={2} onChange={(e) => set({ travelers: brief.travelers.map((x, k) => (k === i ? { ...x, nationality: e.target.value.toUpperCase() } : x)) })} />
                </label>
              </div>
            ))}
          </>
        )}
        {id === 'budget' && (
          <label>Budget par personne, tout compris (en €)
            <input inputMode="decimal" value={budgetText} onChange={(e) => setBudgetText(e.target.value)} />
          </label>
        )}
        {id === 'profile' && (
          <>
            <h2>Voyageur</h2>
            <Checks options={TRAVELER_TYPES} value={brief.travelerTypes} onChange={(v) => set({ travelerTypes: v })} />
            <h2>Type de voyage</h2>
            <Checks options={TRIP_TYPES} value={brief.tripTypes} onChange={(v) => set({ tripTypes: v })} />
            <h2>Envies</h2>
            <Checks options={WISHES} value={brief.wishes} onChange={(v) => set({ wishes: v })} />
          </>
        )}
        {id === 'lodging' && <Checks options={LODGINGS} value={brief.lodging} onChange={(v) => set({ lodging: v })} />}
        {id === 'pace' && (
          <div className="chips">
            {PACES.map((p) => (
              <label key={p.id} className="chip">
                <input type="radio" name="pace" checked={brief.pace === p.id} onChange={() => set({ pace: p.id as Pace })} />
                {p.label}
              </label>
            ))}
          </div>
        )}
        {id === 'constraints' && (
          <label>Contraintes
            <textarea rows={4} value={brief.constraints} onChange={(e) => set({ constraints: e.target.value })} />
          </label>
        )}

        {error && <p role="alert" className="field-error">{error}</p>}
        <div className="form-actions">
          {step > 0 && <button type="button" className="btn" onClick={() => { setError(null); setStep(step - 1); }}>Retour</button>}
          {OPTIONAL_STEPS.includes(id) && <button type="button" className="btn" onClick={() => next(true)} disabled={finish.saving || (last && !online)}>Passer</button>}
          <button type="submit" className="btn btn-primary" disabled={finish.saving || (last && !online)}>{last ? 'Terminer' : 'Suivant'}</button>
        </div>
        <SaveError error={finish.error} onRetry={finish.retry} />
      </form>
    </main>
  );
}
