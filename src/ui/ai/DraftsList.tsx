import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDate } from '../../domain/format';
import { useOnline } from '../../offline/useOnline';
import type { AiDraft, DraftStage } from '../../ai/types';
import { ConfirmDialog } from '../common/ConfirmDialog';

export const STAGE_LABELS: Record<DraftStage, string> = {
  brief: 'Questionnaire terminé',
  ideas_requested: 'En attente des idées',
  ideas_received: 'Idées reçues : à choisir',
  idea_chosen: 'Idée choisie',
  itinerary_requested: 'En attente de l’itinéraire',
  itinerary_received: 'Itinéraire reçu : à créer',
  created: 'Voyage créé',
};

export function DraftsList({ drafts, onDelete }: { drafts: AiDraft[]; onDelete(id: string): void }) {
  const online = useOnline();
  const [asking, setAsking] = useState<AiDraft | null>(null);
  const open = drafts.filter((d) => d.stage !== 'created');
  if (open.length === 0) return null;
  return (
    <section>
      <h2>Brouillons IA</h2>
      <ul className="trip-list">
        {open.map((d) => (
          <li key={d.id} className="card trip-card">
            <div className="trip-link">
              <strong>{d.brief.destination || 'Surprends-moi'}</strong>
              <span className="muted">{formatDate(d.brief.startDate)} → {formatDate(d.brief.endDate)}</span>
              <span className="muted">{STAGE_LABELS[d.stage]}</span>
            </div>
            <div className="trip-actions">
              <Link className="btn btn-small" to={`/ia/${d.id}`}>Reprendre</Link>
              <button type="button" className="btn btn-small btn-danger-text" disabled={!online} onClick={() => setAsking(d)}>Supprimer</button>
            </div>
          </li>
        ))}
      </ul>
      {asking && (
        <ConfirmDialog
          title="Supprimer ce brouillon ?"
          confirmLabel="Supprimer"
          danger
          onConfirm={() => { onDelete(asking.id); setAsking(null); }}
          onCancel={() => setAsking(null)}
        >
          <p>Tes réponses au questionnaire seront perdues.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
