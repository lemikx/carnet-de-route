import { formatEur } from '../../domain/budget/money';
import type { BudgetAlert, BudgetSummary } from '../../domain/budget/projection';

function AlertLine({ alert, labelOf }: { alert: BudgetAlert; labelOf?: (key: string) => string }) {
  if (alert.type === 'projection_over_cap') {
    return <p role="alert" className="alert alert-warning">Tu dépasses l’enveloppe de {formatEur(alert.overCents)}</p>;
  }
  if (alert.type === 'actual_over_cap') {
    return <p role="alert" className="alert alert-danger">Le réel dépasse déjà l’enveloppe de {formatEur(alert.overCents)}</p>;
  }
  return <p role="alert" className="alert alert-warning">« {labelOf?.(alert.key) ?? alert.key} » dépasse son prévu de {formatEur(alert.overCents)}</p>;
}

export function SummaryPanel({ summary, travelers, labelOf }: { summary: BudgetSummary; travelers: number; labelOf?: (key: string) => string }) {
  const { capCents, projectionCents } = summary;
  const ratio = capCents && capCents > 0 ? projectionCents / capCents : null;
  return (
    <section className="card">
      <h2>Résumé</h2>
      <div className="budget-figures">
        <div><span className="muted">Prévu</span><strong data-testid="planned-total">{formatEur(summary.plannedCents)}</strong></div>
        <div><span className="muted">Projection</span><strong data-testid="projection-total">{formatEur(projectionCents)}</strong></div>
        <div><span className="muted">Réel</span><strong data-testid="actual-total">{formatEur(summary.actualCents)}</strong></div>
      </div>
      <p>Par personne : <strong>{summary.perPersonProjectionCents === null || travelers === 0 ? '—' : formatEur(summary.perPersonProjectionCents)}</strong></p>
      {ratio !== null && capCents !== null && (
        <>
          <div className="gauge" role="progressbar" aria-label="Projection par rapport à l’enveloppe" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(ratio * 100))}>
            <span className={ratio > 1 ? 'over' : ratio > 0.9 ? 'near' : ''} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
          </div>
          <p className="muted">Enveloppe : {formatEur(capCents)}</p>
        </>
      )}
      {summary.missingRateCount > 0 && (
        <p role="status" className="alert alert-warning">
          Projection incomplète : {summary.missingRateCount} {summary.missingRateCount > 1 ? 'réservations sans taux de change' : 'réservation sans taux de change'} (non comptée{summary.missingRateCount > 1 ? 's' : ''}).
        </p>
      )}
      {summary.alerts.map((a, i) => <AlertLine key={i} alert={a} labelOf={labelOf} />)}
    </section>
  );
}
