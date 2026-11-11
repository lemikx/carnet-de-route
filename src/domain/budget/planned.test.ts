import { plannedItems, reservationCategory, tripDays } from './planned';
import type { BudgetLine } from './types';
import { makeReservation } from '../../test/factories';

const line = (over: Partial<BudgetLine>): BudgetLine => ({
  id: 'L', tripId: 't', category: 'food', label: 'Repas', amount: 0, currency: 'EUR', mode: 'fixed', position: 0,
  rateToEur: 1, rateManual: false, rateDate: '2026-11-11', ...over,
});
const base = { travelers: 4, days: 5, marginPct: 3, reservationRates: {} as Record<string, number>, reservations: [] };

describe('tripDays', () => {
  it('compte les dates incluses', () => expect(tripDays({ startDate: '2026-12-01', endDate: '2026-12-05' })).toBe(5));
});

describe('plannedItems', () => {
  it('calcule les quatre modes', () => {
    const items = plannedItems({
      ...base,
      lines: [
        line({ id: 'a', mode: 'fixed', amount: 120 }),
        line({ id: 'b', mode: 'per_person', amount: 50 }),
        line({ id: 'c', mode: 'per_day', amount: 30 }),
      ],
    });
    expect(items.map((i) => i.plannedCents)).toEqual([12000, 20000, 15000]);
  });
  it('applique la marge aux devises étrangères', () => {
    const [item] = plannedItems({ ...base, lines: [line({ mode: 'per_person_per_day', amount: 5000, currency: 'JPY', rateToEur: 0.0061 })] });
    expect(item.plannedCents).toBe(62830);
    expect(item.baseCents).toBe(61000);
    expect(item.currency).toBe('JPY');
  });
  it('reprend le prix des réservations', () => {
    const items = plannedItems({
      ...base,
      lines: [],
      reservationRates: { USD: 0.92 },
      reservations: [
        makeReservation({ id: 'R1', type: 'flight', price: 800, currency: 'EUR', title: 'Vol' }),
        makeReservation({ id: 'R2', type: 'lodging', price: 100, currency: 'USD', title: 'Hôtel' }),
        makeReservation({ id: 'R3', type: 'activity', price: 50, currency: 'CAD', title: 'Visite' }),
        makeReservation({ id: 'R4', type: 'activity', price: null, title: 'Gratuit' }),
      ],
    });
    expect(items.map((i) => i.key)).toEqual(['res:R1', 'res:R2', 'res:R3']);
    expect(items[0]).toMatchObject({ source: 'reservation', category: 'flight', plannedCents: 80000, missingRate: false });
    expect(items[1].plannedCents).toBe(9476);
    expect(items[2]).toMatchObject({ plannedCents: 0, missingRate: true });
  });
  it('ne plante pas sans voyageur', () => {
    const [item] = plannedItems({ ...base, travelers: 0, lines: [line({ mode: 'per_person', amount: 50 })] });
    expect(item.plannedCents).toBe(0);
  });
});

describe('reservationCategory', () => {
  it.each([
    ['flight', 'flight'], ['lodging', 'lodging'], ['train', 'local_transport'], ['car_rental', 'local_transport'],
    ['activity', 'activity'], ['other', 'other'],
  ] as const)('%s → %s', (type, cat) => expect(reservationCategory(type)).toBe(cat));
});
