import { convertToEurCents } from './money';
import type { PlannedItem } from './planned';
import { BUDGET_CATEGORIES, type BudgetCategory, type BudgetSettings, type Expense } from './types';

export type BudgetAlert =
  | { type: 'projection_over_cap'; overCents: number }
  | { type: 'actual_over_cap'; overCents: number }
  | { type: 'item_over'; key: string; overCents: number };

export interface ItemStatus {
  key: string;
  plannedCents: number;
  actualCents: number;
  missingRate: boolean;
}

export interface BudgetSummary {
  plannedCents: number;
  projectionCents: number;
  actualCents: number;
  capCents: number | null;
  perPersonProjectionCents: number | null;
  alerts: BudgetAlert[];
  items: ItemStatus[];
  unattachedCents: number;
  byCategory: Record<BudgetCategory, { plannedCents: number; actualCents: number }>;
}

export function expenseCents(e: Expense): number {
  return convertToEurCents(e.amount, e.rateToEur);
}

/** Clé de l'élément prévu auquel une dépense est rattachée (ou `null`). */
export function attachmentKey(e: Pick<Expense, 'lineId' | 'reservationId'>): string | null {
  return e.lineId ?? (e.reservationId ? `res:${e.reservationId}` : null);
}

export function computeBudget(input: { items: PlannedItem[]; expenses: Expense[]; settings: BudgetSettings; travelers: number }): BudgetSummary {
  const { items, expenses, settings, travelers } = input;
  const keys = new Set(items.map((i) => i.key));

  const actualByKey = new Map<string, number>();
  let unattachedCents = 0;
  let actualCents = 0;
  const byCategory = Object.fromEntries(BUDGET_CATEGORIES.map((c) => [c, { plannedCents: 0, actualCents: 0 }])) as BudgetSummary['byCategory'];

  for (const e of expenses) {
    const cents = expenseCents(e);
    actualCents += cents;
    byCategory[e.category].actualCents += cents;
    const key = attachmentKey(e);
    if (key && keys.has(key)) actualByKey.set(key, (actualByKey.get(key) ?? 0) + cents);
    else unattachedCents += cents;
  }

  let plannedCents = 0;
  let projectionCents = unattachedCents;
  const statuses: ItemStatus[] = items.map((i) => {
    const actual = actualByKey.get(i.key) ?? 0;
    plannedCents += i.plannedCents;
    projectionCents += Math.max(i.plannedCents, actual);
    byCategory[i.category].plannedCents += i.plannedCents;
    return { key: i.key, plannedCents: i.plannedCents, actualCents: actual, missingRate: i.missingRate };
  });

  const capCents =
    settings.cap === null ? null : Math.round(settings.cap * 100) * (settings.capMode === 'per_person' ? travelers : 1);

  const alerts: BudgetAlert[] = [];
  if (capCents !== null) {
    if (projectionCents > capCents) alerts.push({ type: 'projection_over_cap', overCents: projectionCents - capCents });
    if (actualCents > capCents) alerts.push({ type: 'actual_over_cap', overCents: actualCents - capCents });
    for (const s of statuses) if (s.actualCents > s.plannedCents) alerts.push({ type: 'item_over', key: s.key, overCents: s.actualCents - s.plannedCents });
  }

  return {
    plannedCents, projectionCents, actualCents, capCents,
    perPersonProjectionCents: travelers > 0 ? Math.round(projectionCents / travelers) : null,
    alerts, items: statuses, unattachedCents, byCategory,
  };
}
