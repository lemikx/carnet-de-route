import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CreationError } from '../../ai/tripFromItinerary';
import { assessVisa } from '../../ai/visa';
import type { AiDraft } from '../../ai/types';
import { datesBetween } from '../../domain/days';
import { formatEur } from '../../domain/budget/money';
import { formatDate } from '../../domain/format';
import { useOnline } from '../../offline/useOnline';

interface Created { tripId: string; toVerify: number; skippedBudgetLines: number }

const MULTIPLIER = { fixed: () => 1, per_person: (n: number) => n, per_day: (_n: number, d: number) => d, per_person_per_day: (n: number, d: number) => n * d };

export function ControlPanel({
  draft, today, onCreate, onRepaste,
}: {
  draft: AiDraft;
  today: string;
  onCreate(onProgress: (done: number, total: number) => void): Promise<Created>;
  onRepaste?(): void;
}) {
  const online = useOnline();
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [failed, setFailed] = useState(false);
  const [failMessage, setFailMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const it = draft.itinerary;
  if (!it) return null;

  const dates = datesBetween(draft.brief.startDate, draft.brief.endDate).length;
  const stops = it.days.reduce((n, d) => n + d.stops.length, 0);
  const travelers = draft.brief.travelers.length || draft.brief.adults + draft.brief.children || 1;
  const visa = assessVisa(it.trip.visa, { departureDate: draft.brief.startDate, today });
  const euros = it.budget.filter((b) => b.currency === 'EUR');
  const estimate = euros.reduce((s, b) => s + b.amount * MULTIPLIER[b.mode](travelers, dates), 0);

  async function create() {
    setBusy(true);
    setFailed(false);
    setProgress(null);
    try {
      setCreated(await onCreate((d, t) => setProgress([d, t])));
    } catch (e) {
      setFailed(true);
      setFailMessage(e instanceof CreationError ? e.message : null);
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <section>
        <h2>Voyage créé</h2>
        <p><Link className="btn btn-primary" to={`/voyage/${created.tripId}/itineraire`}>Ouvrir le voyage</Link></p>
        {created.toVerify > 0 && (
          <p>
            <Link to={`/voyage/${created.tripId}/itineraire`}>{created.toVerify} {created.toVerify > 1 ? 'lieux' : 'lieu'} à vérifier</Link>
          </p>
        )}
        {created.skippedBudgetLines > 0 && <p className="muted">{created.skippedBudgetLines} ligne(s) de budget ignorée(s) : taux de change introuvable.</p>}
      </section>
    );
  }

  return (
    <section>
      <h2>Vérifie avant de créer</h2>
      <ul>
        <li>{it.days.length} {it.days.length > 1 ? 'jours' : 'jour'}, {stops} {stops > 1 ? 'étapes' : 'étape'}</li>
        {it.days.length !== dates && <li className="field-error">{it.days.length} jours proposés pour {dates} dates</li>}
        {visa.deadline && <li>Faire le visa avant le {formatDate(visa.deadline)}{visa.overdue ? ' (en retard)' : ''}</li>}
        {estimate > 0 && <li>Budget estimé (lignes en euros) : {formatEur(Math.round(estimate * 100))}</li>}
      </ul>
      <button type="button" className="btn btn-primary" disabled={busy || !online} onClick={() => void create()}>Créer le voyage</button>
      {onRepaste && <button type="button" className="btn" disabled={busy || !online} onClick={onRepaste}>Recoller une autre réponse</button>}
      {busy && (
        <p aria-live="polite">
          Placement des lieux{progress ? ` : ${progress[0]} / ${progress[1]}` : '…'} <progress value={progress?.[0] ?? 0} max={progress?.[1] ?? 1} />
        </p>
      )}
      {failed && (
        <div role="alert" className="save-error">
          <span>{failMessage ?? 'La création a échoué : rien n’a été enregistré.'}</span>
          <button type="button" className="btn btn-small" disabled={!online} onClick={() => void create()}>Réessayer</button>
        </div>
      )}
    </section>
  );
}
