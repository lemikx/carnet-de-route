import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../../app/AppContext';
import { useOnline } from '../../offline/useOnline';
import type { AiDraft } from '../../ai/types';
import { SaveError } from '../common/SaveError';
import { useAsync } from '../common/useAsync';
import { useSave } from '../common/useSave';
import { ControlPanel } from './ControlPanel';
import { IdeasPanel } from './IdeasPanel';
import { RequestPanel } from './RequestPanel';

const today = () => new Date().toISOString().slice(0, 10);

function Request({ draft, reload, onWarnings }: { draft: AiDraft; reload(): Promise<void>; onWarnings(w: string[]): void }) {
  const { ai } = useApp();
  const req = useAsync(() => ai.buildRequest(draft.id), [ai, draft.id, draft.stage === 'idea_chosen']);
  if (req.loading && !req.data) return <p className="muted">Préparation de la demande…</p>;
  if (!req.data) return <p role="alert" className="save-error">Impossible de préparer la demande.</p>;
  const { kind, prompt, openUrl } = req.data;
  return (
    <RequestPanel
      kind={kind}
      prompt={prompt}
      openUrl={openUrl}
      onPaste={async (text) => {
        const r = kind === 'ideas' ? await ai.receiveIdeas(draft.id, text) : await ai.receiveItinerary(draft.id, text);
        if (r.ok) {
          onWarnings(r.warnings);
          await reload();
        }
        return r;
      }}
    />
  );
}

export function DraftPage() {
  const { draftId = '' } = useParams();
  const { ai, repo } = useApp();
  const online = useOnline();
  const draft = useAsync(() => repo.getDraft(draftId), [repo, draftId]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const act = useSave(async (fn: () => Promise<unknown>) => {
    await fn();
    await draft.reload();
  });
  if (draft.loading && !draft.data) return <main className="page"><p className="muted">Chargement…</p></main>;
  if (!draft.data) return <main className="page"><p className="empty">Ce brouillon n’existe plus.</p><Link to="/">Mes voyages</Link></main>;
  const d = draft.data;
  const reload = () => draft.reload();

  return (
    <main className="page">
      <div className="page-head">
        <h1>{d.brief.destination || 'Surprends-moi'}</h1>
        <Link to="/">Mes voyages</Link>
      </div>
      {warnings.length > 0 && (
        <ul className="muted" aria-label="Avertissements">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
      )}
      <SaveError error={act.error} onRetry={act.retry} />
      {['brief', 'ideas_requested', 'idea_chosen', 'itinerary_requested'].includes(d.stage) && <Request key={d.stage} draft={d} reload={reload} onWarnings={setWarnings} />}
      {d.stage === 'ideas_received' && (
        <IdeasPanel
          draft={d}
          today={today()}
          disabled={!online || act.saving}
          onChoose={(id) => void act.run(() => ai.chooseIdea(d.id, id))}
          onRepaste={() => void act.run(() => ai.buildRequest(d.id))}
        />
      )}
      {d.stage === 'itinerary_received' && <ControlPanel draft={d} today={today()} onCreate={(p) => ai.create(d.id, p)} onRepaste={() => void act.run(() => ai.buildRequest(d.id))} />}
      {d.stage === 'created' && d.tripId && <p><Link className="btn btn-primary" to={`/voyage/${d.tripId}/itineraire`}>Ouvrir le voyage</Link></p>}
    </main>
  );
}
