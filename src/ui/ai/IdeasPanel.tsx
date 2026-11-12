import { assessVisa, type VisaLevel } from '../../ai/visa';
import type { AiDraft } from '../../ai/types';
import { VisaBadge } from './VisaBadge';

const ORDER: Record<VisaLevel, number> = { green: 0, orange: 1, grey: 2, red: 3 };

export function IdeasPanel({ draft, today, onChoose, disabled }: { draft: AiDraft; today: string; onChoose(ideaId: string): void; disabled?: boolean }) {
  const ranked = (draft.ideas ?? [])
    .map((idea, i) => ({ idea, i, level: assessVisa(idea.visa, { departureDate: draft.brief.startDate, today }).level }))
    .sort((a, b) => ORDER[a.level] - ORDER[b.level] || a.i - b.i);
  return (
    <section>
      <h2>Trois idées pour toi</h2>
      <ul className="idea-list">
        {ranked.map(({ idea, level }) => (
          <li key={idea.id} className={`card idea-card${level === 'red' ? ' muted' : ''}`} data-level={level}>
            <h3>{idea.destination} <span className="muted">({idea.country})</span></h3>
            <p>{idea.summary}</p>
            {idea.budgetPerPersonEur !== null && <p>Budget estimé : environ {idea.budgetPerPersonEur} € par personne</p>}
            {idea.highlights.length > 0 && <ul>{idea.highlights.map((h, k) => <li key={k}>{h}</li>)}</ul>}
            {idea.whyItMatches && <p className="muted">{idea.whyItMatches}</p>}
            <VisaBadge visa={idea.visa} departureDate={draft.brief.startDate} today={today} />
            <button type="button" className="btn btn-primary" disabled={disabled} onClick={() => onChoose(idea.id)}>Choisir cette idée</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
