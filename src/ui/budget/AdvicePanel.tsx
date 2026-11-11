import type { Advice } from '../../domain/budget/advice';
import { formatEur } from '../../domain/budget/money';
import type { BudgetLine } from '../../domain/budget/types';

const fr = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function AdvicePanel({ advice, lines, onApply, disabled }: { advice: Advice[]; lines: BudgetLine[]; onApply(a: Advice): void; disabled: boolean }) {
  if (advice.length === 0) return null;
  const byId = new Map(lines.map((l) => [l.id, l]));
  return (
    <section className="card">
      <h2>Pour revenir dans l’enveloppe</h2>
      <ul className="list">
        {advice.map((a, i) => (
          <li key={i} className="advice">
            <div>
              {a.kind === 'proportional' && (
                <>
                  <strong>Baisser proportionnellement ce qui n’est pas encore dépensé</strong>
                  <ul>
                    {a.changes.map((c) => {
                      const l = byId.get(c.lineId);
                      return l ? <li key={c.lineId}>{l.label} : {fr(c.newAmount)} au lieu de {fr(l.amount)} {l.currency}</li> : null;
                    })}
                  </ul>
                </>
              )}
              {a.kind === 'drop_largest' && <strong>Retirer « {byId.get(a.lineId)?.label ?? 'ce poste'} »</strong>}
              {a.kind === 'reduce_margin' && <strong>Réduire la marge de sécurité à {a.newMarginPct} %</strong>}
              <p className="muted">
                Économie : {formatEur(a.savingCents)} — {a.suffices ? 'suffit à revenir dans l’enveloppe' : 'ne suffit pas à elle seule'}
              </p>
            </div>
            <button className="btn btn-small" disabled={disabled} onClick={() => onApply(a)}>Appliquer</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
