import { datesBetween } from '../days';
import type { Reservation, ReservationType, Trip } from '../types';
import { convertToEurCents, effectiveRate } from './money';
import type { BudgetCategory, BudgetLine } from './types';

export interface PlannedItem {
  key: string;
  source: 'line' | 'reservation';
  category: BudgetCategory;
  label: string;
  currency: string;
  plannedCents: number;
  /** Montant sans marge de sécurité (sert aux conseils). */
  baseCents: number;
  missingRate: boolean;
}

export function tripDays(trip: Pick<Trip, 'startDate' | 'endDate'>): number {
  return datesBetween(trip.startDate, trip.endDate).length;
}

export function reservationCategory(type: ReservationType): BudgetCategory {
  switch (type) {
    case 'flight': return 'flight';
    case 'lodging': return 'lodging';
    case 'train':
    case 'car_rental': return 'local_transport';
    case 'activity': return 'activity';
    default: return 'other';
  }
}

export function plannedItems(input: {
  lines: BudgetLine[];
  reservations: Reservation[];
  travelers: number;
  days: number;
  marginPct: number;
  reservationRates: Record<string, number>;
}): PlannedItem[] {
  const { travelers: n, days: j, marginPct } = input;
  const factor = { fixed: 1, per_person: n, per_day: j, per_person_per_day: n * j } as const;

  const fromLines = input.lines.map((l): PlannedItem => {
    const units = l.amount * factor[l.mode];
    return {
      key: l.id, source: 'line', category: l.category, label: l.label, currency: l.currency,
      plannedCents: convertToEurCents(units, effectiveRate(l.currency, l.rateToEur, marginPct)),
      baseCents: convertToEurCents(units, l.currency === 'EUR' ? 1 : l.rateToEur),
      missingRate: false,
    };
  });

  const fromReservations = input.reservations
    .filter((r) => r.price !== null)
    .map((r): PlannedItem => {
      const currency = r.currency || 'EUR';
      const rate = currency === 'EUR' ? 1 : input.reservationRates[currency];
      const missing = rate === undefined;
      return {
        key: `res:${r.id}`, source: 'reservation', category: reservationCategory(r.type), label: r.title, currency,
        plannedCents: missing ? 0 : convertToEurCents(r.price!, effectiveRate(currency, rate, marginPct)),
        baseCents: missing ? 0 : convertToEurCents(r.price!, rate),
        missingRate: missing,
      };
    });

  return [...fromLines, ...fromReservations];
}
