import { DateTime } from 'luxon';
import type { VisaInfo } from './types';

export type VisaLevel = 'green' | 'orange' | 'red' | 'grey';

export interface VisaAssessment {
  level: VisaLevel;
  reason: string;
  remainingDays: number;
  deadline: string | null;
  overdue: boolean;
}

export function assessVisa(
  visa: VisaInfo,
  input: { departureDate: string; today: string; marginDays?: number; safetyDays?: number },
): VisaAssessment {
  const margin = input.marginDays ?? 14;
  const safety = input.safetyDays ?? 7;
  const dep = DateTime.fromISO(input.departureDate, { zone: 'utc' });
  const now = DateTime.fromISO(input.today, { zone: 'utc' });
  if (!dep.isValid || !now.isValid) {
    return { level: 'grey', reason: 'Dates invalides : impossible d’évaluer le visa.', remainingDays: 0, deadline: null, overdue: false };
  }
  const remaining = Math.max(0, Math.round(dep.diff(now, 'days').days));
  const base = { remainingDays: remaining };

  if (visa.required === false) return { ...base, level: 'green', reason: 'Visa non requis selon l’IA.', deadline: null, overdue: false };
  if (visa.required === 'unknown') return { ...base, level: 'grey', reason: 'Visa : l’IA n’est pas sûre, vérifie sur le site officiel.', deadline: null, overdue: false };
  const max = visa.processingDaysMax;
  if (max === null) return { ...base, level: 'grey', reason: 'Visa requis, délai de traitement inconnu.', deadline: null, overdue: false };

  const deadlineDt = dep.minus({ days: max + safety });
  const deadline = deadlineDt.toISODate();
  const overdue = deadlineDt < now;
  if (max > remaining) {
    return { ...base, level: 'red', deadline, overdue, reason: `Délai de traitement jusqu'à ${max} jours, mais il ne reste que ${remaining} jours avant le départ.` };
  }
  if (max > remaining - margin) {
    return { ...base, level: 'orange', deadline, overdue, reason: `Délai de traitement jusqu'à ${max} jours pour ${remaining} jours restants : marge serrée.` };
  }
  return { ...base, level: 'green', deadline, overdue, reason: `Délai de traitement jusqu'à ${max} jours, ${remaining} jours restants : confortable.` };
}
