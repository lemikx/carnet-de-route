import { actualPerTraveler, balances, shares, transfers } from './settlement';
import type { Expense } from './types';

const exp = (paidBy: string, cents: number, participantIds: string[]): Expense => ({
  id: 'e' + Math.random(), tripId: 't', date: '2026-12-01', category: 'food', label: 'x', amount: cents / 100, currency: 'EUR',
  rateToEur: 1, rateManual: false, paidBy, participantIds, lineId: null, reservationId: null,
});
const order = ['A', 'B', 'C'];
const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

describe('shares', () => {
  it('répartit le reste centime par centime dans l’ordre', () => {
    expect([...shares(1000, ['a', 'b', 'c'])]).toEqual([['a', 334], ['b', 333], ['c', 333]]);
    expect([...shares(1, ['a', 'b', 'c'])]).toEqual([['a', 1], ['b', 0], ['c', 0]]);
  });
  it('garde toujours la somme exacte', () => {
    for (let total = 1; total <= 50; total++) {
      for (let k = 1; k <= 7; k++) {
        const ids = Array.from({ length: k }, (_, i) => 'p' + i);
        expect(sum(shares(total, ids))).toBe(total);
      }
    }
  });
});

describe('balances', () => {
  it('crédite le payeur et débite les personnes concernées', () => {
    const b = balances([exp('A', 3000, ['A', 'B', 'C'])], order);
    expect([...b]).toEqual([['A', 2000], ['B', -1000], ['C', -1000]]);
    expect(sum(b)).toBe(0);
  });
  it('reste équilibré avec des parts partielles', () => {
    const b = balances([exp('A', 3000, ['A', 'B', 'C']), exp('B', 900, ['A', 'B'])], order);
    expect(sum(b)).toBe(0);
    expect(b.get('B')).toBe(-1000 + 900 - 450);
  });
});

describe('transfers', () => {
  it('rapproche créanciers et débiteurs dans l’ordre', () => {
    expect(transfers(new Map([['A', 2000], ['B', -1000], ['C', -1000]]), order)).toEqual([
      { from: 'B', to: 'A', cents: 1000 }, { from: 'C', to: 'A', cents: 1000 },
    ]);
    expect(transfers(new Map([['A', 500], ['B', 300], ['C', -800]]), order)).toEqual([
      { from: 'C', to: 'A', cents: 500 }, { from: 'C', to: 'B', cents: 300 },
    ]);
  });
  it('ne renvoie rien si tout est équilibré', () => {
    expect(transfers(new Map([['A', 0], ['B', 0]]), ['A', 'B'])).toEqual([]);
  });
});

describe('actualPerTraveler', () => {
  it('additionne les parts de chacun', () => {
    expect([...actualPerTraveler([exp('A', 1000, ['A', 'B', 'C'])], order)]).toEqual([['A', 334], ['B', 333], ['C', 333]]);
  });
});
