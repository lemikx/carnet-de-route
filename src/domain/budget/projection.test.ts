import { computeBudget, expenseCents } from './projection';
import type { PlannedItem } from './planned';
import type { BudgetSettings, Expense } from './types';

const item = (key: string, plannedCents: number, over: Partial<PlannedItem> = {}): PlannedItem => ({
  key, source: 'line', category: 'food', label: key, currency: 'EUR', plannedCents, baseCents: plannedCents, missingRate: false, ...over,
});
const expense = (cents: number, over: Partial<Expense> = {}): Expense => ({
  id: 'e' + Math.random(), tripId: 't', date: '2026-12-01', category: 'food', label: 'x', amount: cents / 100, currency: 'EUR',
  rateToEur: 1, rateManual: false, paidBy: 'a', participantIds: ['a'], lineId: null, reservationId: null, ...over,
});
const settings = (over: Partial<BudgetSettings> = {}): BudgetSettings => ({ cap: null, capMode: 'total', fxMarginPct: 3, ...over });
const items = [item('L1', 10000), item('L2', 5000)];
const expenses = [expense(7000, { lineId: 'L1' }), expense(5000, { lineId: 'L1' }), expense(3000)];

describe('computeBudget', () => {
  it('retient le plus grand du prévu et du réel par ligne', () => {
    const s = computeBudget({ items, expenses, settings: settings(), travelers: 4 });
    expect(s).toMatchObject({ plannedCents: 15000, projectionCents: 20000, actualCents: 15000, unattachedCents: 3000, capCents: null });
    expect(s.perPersonProjectionCents).toBe(5000);
  });
  it('alerte quand la projection dépasse l’enveloppe', () => {
    const s = computeBudget({ items, expenses, settings: settings({ cap: 180 }), travelers: 4 });
    expect(s.alerts).toContainEqual({ type: 'projection_over_cap', overCents: 2000 });
    expect(s.alerts.some((a) => a.type === 'actual_over_cap')).toBe(false);
    expect(s.alerts).toContainEqual({ type: 'item_over', key: 'L1', overCents: 2000 });
  });
  it('ne signale rien à égalité (enveloppe par personne)', () => {
    const s = computeBudget({ items, expenses, settings: settings({ cap: 50, capMode: 'per_person' }), travelers: 4 });
    expect(s.capCents).toBe(20000);
    expect(s.alerts.filter((a) => a.type !== 'item_over')).toEqual([]);
  });
  it('aucune alerte sans enveloppe', () => {
    expect(computeBudget({ items, expenses, settings: settings(), travelers: 4 }).alerts).toEqual([]);
  });
  it('alerte rouge quand le réel dépasse l’enveloppe', () => {
    const big = [expense(20000, { lineId: 'L1' }), expense(5000)];
    const s = computeBudget({ items, expenses: big, settings: settings({ cap: 180 }), travelers: 4 });
    expect(s.actualCents).toBe(25000);
    expect(s.alerts).toContainEqual({ type: 'actual_over_cap', overCents: 7000 });
  });
  it('gère zéro voyageur sans diviser par zéro', () => {
    const s = computeBudget({ items, expenses: [], settings: settings({ cap: 50, capMode: 'per_person' }), travelers: 0 });
    expect(s.perPersonProjectionCents).toBeNull();
    expect(s.capCents).toBe(0);
  });
  it('additionne par catégorie', () => {
    const s = computeBudget({ items: [item('A', 1000, { category: 'lodging' }), item('B', 500)], expenses: [expense(300, { lineId: 'B' })], settings: settings(), travelers: 1 });
    expect(s.byCategory.lodging).toEqual({ plannedCents: 1000, actualCents: 0 });
    expect(s.byCategory.food).toEqual({ plannedCents: 500, actualCents: 300 });
  });
  it('rattache une dépense à une réservation et garde le drapeau de taux manquant', () => {
    const s = computeBudget({
      items: [item('res:R1', 0, { source: 'reservation', missingRate: true })],
      expenses: [expense(4000, { reservationId: 'R1' })], settings: settings(), travelers: 1,
    });
    expect(s.items[0]).toMatchObject({ key: 'res:R1', actualCents: 4000, missingRate: true });
    expect(s.projectionCents).toBe(4000);
  });
});

describe('expenseCents', () => {
  it('convertit au taux figé', () => expect(expenseCents(expense(0, { amount: 10000, currency: 'JPY', rateToEur: 0.0061 }))).toBe(6100));
});

describe('taux manquants', () => {
  it('compte les éléments sans taux pour prévenir que la projection est incomplète', () => {
    const s = computeBudget({ items: [item('res:R1', 0, { source: 'reservation', missingRate: true }), item('L1', 100)], expenses: [], settings: settings(), travelers: 1 });
    expect(s.missingRateCount).toBe(1);
    expect(computeBudget({ items: [item('L1', 100)], expenses: [], settings: settings(), travelers: 1 }).missingRateCount).toBe(0);
  });
});
