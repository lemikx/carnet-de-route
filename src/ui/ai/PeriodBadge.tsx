import { assessPeriod } from '../../ai/period';
import type { BestPeriod } from '../../ai/types';

export function PeriodBadge({ period, startDate, endDate }: { period: BestPeriod | null; startDate: string; endDate: string }) {
  if (!period) return null;
  const a = assessPeriod(period, { startDate, endDate });
  return (
    <div className={`period-badge period-${a?.fit ?? 'unknown'}`}>
      <strong>Meilleure période</strong>
      {period.text && <span>{period.text}</span>}
      {a && <span className="period-fit">{a.label}</span>}
      <small className="muted">Information donnée par l’IA : à vérifier</small>
    </div>
  );
}
