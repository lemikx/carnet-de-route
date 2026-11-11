import type { Trip } from '../types';

export type BudgetCategory = 'flight' | 'lodging' | 'local_transport' | 'food' | 'activity' | 'shopping' | 'contingency' | 'other';
export const BUDGET_CATEGORIES: BudgetCategory[] = ['flight', 'lodging', 'local_transport', 'food', 'activity', 'shopping', 'contingency', 'other'];
export type LineMode = 'fixed' | 'per_person' | 'per_day' | 'per_person_per_day';
export type CapMode = 'total' | 'per_person';

export interface Traveler {
  id: string;
  tripId: string;
  name: string;
  position: number;
}

export interface BudgetLine {
  id: string;
  tripId: string;
  category: BudgetCategory;
  label: string;
  amount: number;
  currency: string;
  mode: LineMode;
  position: number;
  rateToEur: number;
  rateManual: boolean;
  rateDate: string;
}

export interface Expense {
  id: string;
  tripId: string;
  date: string;
  category: BudgetCategory;
  label: string;
  amount: number;
  currency: string;
  rateToEur: number;
  rateManual: boolean;
  paidBy: string;
  participantIds: string[];
  lineId: string | null;
  reservationId: string | null;
}

export interface BudgetData {
  travelers: Traveler[];
  lines: BudgetLine[];
  expenses: Expense[];
}

export interface BudgetSettings {
  cap: number | null;
  capMode: CapMode;
  fxMarginPct: number;
}

export const DEFAULT_FX_MARGIN_PCT = 3;

/** Retire du voyage les champs budget (partage, calendrier et roadbook ne doivent jamais les contenir). */
export function omitBudget<T extends Trip>(trip: T): T {
  const { budgetCap: _a, budgetCapMode: _b, fxMarginPct: _c, ...rest } = trip;
  void _a; void _b; void _c;
  return rest as T;
}

export function settingsOf(trip: Pick<Trip, 'budgetCap' | 'budgetCapMode' | 'fxMarginPct'>): BudgetSettings {
  return {
    cap: trip.budgetCap ?? null,
    capMode: trip.budgetCapMode ?? 'total',
    fxMarginPct: trip.fxMarginPct ?? DEFAULT_FX_MARGIN_PCT,
  };
}
