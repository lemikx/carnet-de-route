import { computeAdvice } from './advice';
import { plannedItems } from './planned';
import { computeBudget } from './projection';
import type { BudgetLine, BudgetSettings, Expense } from './types';
import { makeReservation } from '../../test/factories';

const line = (over: Partial<BudgetLine>): BudgetLine => ({
  id: 'L', tripId: 't', category: 'food', label: 'x', amount: 0, currency: 'EUR', mode: 'fixed', position: 0,
  rateToEur: 1, rateManual: false, rateDate: '2026-11-11', ...over,
});
const exp = (cents: number, lineId: string): Expense => ({
  id: 'e', tripId: 't', date: '2026-12-01', category: 'activity', label: 'x', amount: cents / 100, currency: 'EUR',
  rateToEur: 1, rateManual: false, paidBy: 'a', participantIds: ['a'], lineId, reservationId: null,
});
const L1 = line({ id: 'L1', category: 'food', mode: 'per_person_per_day', amount: 20 });
const L2 = line({ id: 'L2', category: 'activity', mode: 'fixed', amount: 60 });
const hotel = makeReservation({ id: 'H', type: 'lodging', price: 100, currency: 'EUR', title: 'Hôtel' });

function advise(opts: { cap: number | null; lines?: BudgetLine[]; expenses?: Expense[]; reservations?: typeof hotel[]; rates?: Record<string, number>; margin?: number }) {
  const lines = opts.lines ?? [L1, L2];
  const settings: BudgetSettings = { cap: opts.cap, capMode: 'total', fxMarginPct: opts.margin ?? 3 };
  const items = plannedItems({
    lines, reservations: opts.reservations ?? [hotel], travelers: 2, days: 2, marginPct: settings.fxMarginPct, reservationRates: opts.rates ?? {},
  });
  const summary = computeBudget({ items, expenses: opts.expenses ?? [], settings, travelers: 2 });
  return computeAdvice({ summary, items, lines, settings, travelers: 2, days: 2 });
}

describe('computeAdvice', () => {
  it('propose une baisse proportionnelle, le retrait du plus gros poste, pas de piste marge', () => {
    const advice = advise({ cap: 200 });
    const prop = advice.find((a) => a.kind === 'proportional')!;
    expect(prop).toMatchObject({ savingCents: 4003, suffices: true });
    expect(prop.kind === 'proportional' && prop.changes).toEqual([{ lineId: 'L1', newAmount: 14.28 }, { lineId: 'L2', newAmount: 42.85 }]);
    expect(advice.find((a) => a.kind === 'drop_largest')).toMatchObject({ lineId: 'L1', savingCents: 8000, suffices: true });
    expect(advice.some((a) => a.kind === 'reduce_margin')).toBe(false);
  });
  it('ne réduit que la part non dépensée', () => {
    const advice = advise({ cap: 200, expenses: [exp(5000, 'L2')] });
    const prop = advice.find((a) => a.kind === 'proportional')!;
    expect(prop).toMatchObject({ savingCents: 4001, suffices: true });
    expect(prop.kind === 'proportional' && prop.changes).toEqual([{ lineId: 'L1', newAmount: 11.11 }, { lineId: 'L2', newAmount: 55.55 }]);
    expect(advice.find((a) => a.kind === 'drop_largest')).toMatchObject({ lineId: 'L1' });
  });
  it('n’a pas de baisse proportionnelle quand il n’y a pas assez à réduire', () => {
    const advice = advise({ cap: 80 });
    expect(advice.some((a) => a.kind === 'proportional')).toBe(false);
    expect(advice.find((a) => a.kind === 'drop_largest')).toMatchObject({ savingCents: 8000, suffices: false });
  });
  it('propose de réduire la marge de change', () => {
    // prévu = 94,76 € (100 USD avec marge) + 100 € d'hôtel = 194,76 € ; enveloppe 189,76 € → dépassement de 5 €
    const over = advise({ cap: 189.76, lines: [], reservations: [makeReservation({ id: 'U', type: 'flight', price: 100, currency: 'USD', title: 'Vol' }), hotel], rates: { USD: 0.92 } });
    expect(over.find((a) => a.kind === 'reduce_margin')).toMatchObject({ savingCents: 184, newMarginPct: 1, suffices: false });
  });
  it('ne propose rien sans enveloppe ni dépassement', () => {
    expect(advise({ cap: null })).toEqual([]);
    expect(advise({ cap: 1000 })).toEqual([]);
  });
});
