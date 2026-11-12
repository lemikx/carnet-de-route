import type { Brief } from '../../ai/types';

export const STEPS = ['destination', 'dates', 'departure', 'travelers', 'budget', 'profile', 'lodging', 'pace', 'constraints'] as const;
export type StepId = (typeof STEPS)[number];

/** Étapes que l'on peut passer sans rien répondre (seules les dates et les voyageurs sont obligatoires). */
export const OPTIONAL_STEPS: StepId[] = ['destination', 'departure', 'budget', 'profile', 'lodging', 'pace', 'constraints'];

export function emptyBrief(): Brief {
  return {
    destination: null, startDate: '', endDate: '', departureCity: null, adults: 2, children: 0,
    travelers: [{ name: '', nationality: 'FR' }, { name: '', nationality: 'FR' }],
    budgetPerPersonEur: null, travelerTypes: [], tripTypes: [], wishes: [], lodging: [], pace: null, constraints: '',
  };
}

/** Message d'erreur de l'étape, ou null si tout est correct. */
export function validateStep(stepId: StepId, brief: Brief, today: string): string | null {
  if (stepId === 'dates') {
    if (!brief.startDate || !brief.endDate) return 'Indique les dates de départ et de retour.';
    if (brief.endDate < brief.startDate) return 'La date de retour doit être après le départ.';
    if (brief.startDate < today) return 'La date de départ est dans le passé.';
  }
  if (stepId === 'travelers' && brief.adults < 1) return 'Il faut au moins un adulte.';
  return null;
}

/** « 1 500,5 » → 1500.5 ; vide → null ; invalide → undefined. */
export function parseAmount(text: string): number | null | undefined {
  const t = text.replace(/[\s  ]/g, '').replace(',', '.');
  if (!t) return null;
  if (!/^\d+(\.\d+)?$/.test(t)) return undefined;
  const n = Number(t);
  return n <= 1_000_000 ? n : undefined;
}

/** Garde la liste des voyageurs alignée sur le nombre d'adultes et d'enfants. */
export function withTravelerCount(brief: Brief, adults: number, children: number): Brief {
  const total = Math.max(0, adults + children);
  const travelers = Array.from({ length: total }, (_, i) => brief.travelers[i] ?? { name: '', nationality: 'FR' });
  return { ...brief, adults, children, travelers };
}
