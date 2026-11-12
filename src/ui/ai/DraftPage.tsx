import { Link, useParams } from 'react-router-dom';
import { useApp } from '../../app/AppContext';
import { useOnline } from '../../offline/useOnline';
import type { AiDraft } from '../../ai/types';
import { useAsync } from '../common/useAsync';
import { IdeasPanel } from './IdeasPanel';
import { RequestPanel } from './RequestPanel';

const today = () => new Date().toISOString().slice(0, 10);

function Request({ draft, reload }: { draft: AiDraft; reload(): Promise<void> }) {
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
        if (r.ok) await reload();
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
      {['brief', 'ideas_requested', 'idea_chosen', 'itinerary_requested'].includes(d.stage) && <Request key={d.stage} draft={d} reload={reload} />}
      {d.stage === 'ideas_received' && (
        <IdeasPanel draft={d} today={today()} disabled={!online} onChoose={(id) => void ai.chooseIdea(d.id, id).then(reload)} />
      )}
    </main>
  );
}
