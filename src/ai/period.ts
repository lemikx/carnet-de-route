import { DateTime } from 'luxon';
import type { BestPeriod } from './types';

export type PeriodFit = 'good' | 'average' | 'avoid';

export interface PeriodAssessment {
  fit: PeriodFit;
  /** Mois (1 à 12) couverts par le voyage, du départ au retour. */
  months: number[];
  label: string;
}

const LABELS: Record<PeriodFit, string> = {
  good: 'Tes dates tombent en bonne période.',
  average: 'Période intermédiaire pour tes dates.',
  avoid: 'Tes dates tombent dans une période à éviter.',
};

/** Compare les mois du voyage à la période conseillée ; « à éviter » l'emporte sur tout. */
export function assessPeriod(period: BestPeriod, input: { startDate: string; endDate: string }): PeriodAssessment | null {
  if (period.goodMonths.length === 0 && period.avoidMonths.length === 0) return null;
  const start = DateTime.fromISO(input.startDate, { zone: 'utc' });
  const end = DateTime.fromISO(input.endDate, { zone: 'utc' });
  if (!start.isValid || !end.isValid || end < start) return null;

  const months: number[] = [];
  let cursor = start.startOf('month');
  const last = end.startOf('month');
  // Plafonné à 13 pas : au-delà d'un an, tous les mois sont de toute façon couverts.
  for (let i = 0; i < 13 && cursor <= last; i++) {
    if (!months.includes(cursor.month)) months.push(cursor.month);
    cursor = cursor.plus({ months: 1 });
  }
  const fit: PeriodFit = months.some((m) => period.avoidMonths.includes(m))
    ? 'avoid'
    : months.every((m) => period.goodMonths.includes(m))
      ? 'good'
      : 'average';
  return { fit, months, label: LABELS[fit] };
}
