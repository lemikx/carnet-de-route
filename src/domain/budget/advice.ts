import { convertToEurCents, effectiveRate } from './money';
import type { PlannedItem } from './planned';
import type { BudgetSummary } from './projection';
import type { BudgetLine, BudgetSettings } from './types';

export type Advice =
  | { kind: 'proportional'; savingCents: number; suffices: boolean; changes: { lineId: string; newAmount: number }[] }
  | { kind: 'drop_largest'; savingCents: number; suffices: boolean; lineId: string }
  | { kind: 'reduce_margin'; savingCents: number; suffices: boolean; newMarginPct: 1 };

const floorCents = (x: number) => Math.floor(x * 100 + 1e-9) / 100;

/** Pistes pour revenir dans l'enveloppe ; ne touche que la part non engagée des lignes stockées (pas les réservations). */
export function computeAdvice(input: {
  summary: BudgetSummary;
  items: PlannedItem[];
  lines: BudgetLine[];
  settings: BudgetSettings;
  travelers: number;
  days: number;
}): Advice[] {
  const { summary, items, lines, settings, travelers: n, days: j } = input;
  if (summary.capCents === null || summary.projectionCents <= summary.capCents) return [];
  const over = summary.projectionCents - summary.capCents;

  const actualOf = new Map(summary.items.map((s) => [s.key, s.actualCents]));
  const flexible = lines
    .map((line) => {
      const item = items.find((i) => i.key === line.id)!;
      const actual = actualOf.get(line.id) ?? 0;
      return { line, planned: item.plannedCents, actual, rest: Math.max(0, item.plannedCents - actual) };
    })
    .filter((f) => f.planned > 0);
  const totalRest = flexible.reduce((s, f) => s + f.rest, 0);

  const factor = { fixed: 1, per_person: n, per_day: j, per_person_per_day: n * j } as const;
  const plannedWith = (line: BudgetLine, amount: number) =>
    convertToEurCents(amount * factor[line.mode], effectiveRate(line.currency, line.rateToEur, settings.fxMarginPct));

  const out: Advice[] = [];

  if (totalRest >= over && totalRest > 0) {
    const f = 1 - over / totalRest;
    const changes: { lineId: string; newAmount: number }[] = [];
    let saving = 0;
    for (const x of flexible) {
      if (x.rest === 0) continue;
      const newPlanned = x.actual + x.rest * f;
      const newAmount = floorCents(x.line.amount * (newPlanned / x.planned));
      if (newAmount >= x.line.amount) continue;
      changes.push({ lineId: x.line.id, newAmount });
      saving += x.planned - plannedWith(x.line, newAmount);
    }
    if (changes.length) out.push({ kind: 'proportional', savingCents: saving, suffices: saving >= over, changes });
  }

  const largest = flexible.filter((f) => f.rest > 0).reduce<(typeof flexible)[number] | null>((best, f) => (best === null || f.rest > best.rest ? f : best), null);
  if (largest) out.push({ kind: 'drop_largest', lineId: largest.line.id, savingCents: largest.rest, suffices: largest.rest >= over });

  if (settings.fxMarginPct > 1) {
    const foreign = items.filter((i) => i.currency !== 'EUR').reduce((s, i) => s + i.baseCents, 0);
    if (foreign > 0) {
      const saving = Math.round((foreign * (settings.fxMarginPct - 1)) / 100);
      out.push({ kind: 'reduce_margin', savingCents: saving, suffices: saving >= over, newMarginPct: 1 });
    }
  }
  return out;
}
