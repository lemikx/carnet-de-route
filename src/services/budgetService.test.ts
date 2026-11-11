import { createMemoryRepository } from '../data/memoryRepository';
import { createFakeFx } from '../fx/fakeFx';
import { FxError, type FxService } from '../fx/FxService';
import { createBudgetService } from './budgetService';
import { computeAdvice } from '../domain/budget/advice';
import { plannedItems } from '../domain/budget/planned';
import { computeBudget } from '../domain/budget/projection';
import type { Trip } from '../domain/types';
import type { New } from '../data/TripRepository';
import { makeReservation } from '../test/factories';

const tripInput = (): New<Trip> => ({
  name: 'Japon', countries: ['JP'], startDate: '2026-12-01', endDate: '2026-12-05', localCurrency: 'JPY', homeTimezone: 'Europe/Paris', updatedAt: '',
});
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

async function setup(fx: FxService = createFakeFx()) {
  const repo = createMemoryRepository();
  const trip = await repo.createTrip(tripInput());
  return { repo, trip, service: createBudgetService(repo, fx) };
}
const downFx: FxService = { getRate: async () => { throw new FxError('UNAVAILABLE'); }, listCurrencies: async () => [] };

describe('BudgetService', () => {
  it('crée un voyageur', async () => {
    const { service, repo, trip } = await setup();
    const t = await service.ensureTraveler(trip.id, 'Alice');
    expect(t).toMatchObject({ name: 'Alice', position: 0 });
    const b = await service.ensureTraveler(trip.id, 'Bob');
    expect(b.position).toBe(1);
    expect((await repo.getBudget(trip.id)).travelers).toHaveLength(2);
  });

  it('ajoute les postes habituels à 0 €', async () => {
    const { service, trip } = await setup();
    const lines = await service.addUsualLines(trip.id);
    expect(lines.map((l) => [l.category, l.mode, l.amount, l.currency])).toEqual([
      ['food', 'per_person_per_day', 0, 'EUR'],
      ['local_transport', 'per_person_per_day', 0, 'EUR'],
      ['activity', 'per_person', 0, 'EUR'],
      ['contingency', 'fixed', 0, 'EUR'],
    ]);
  });

  describe('refreshRates', () => {
    const jpyLine = (tripId: string, over: Record<string, unknown> = {}) => ({
      tripId, category: 'food' as const, label: 'Repas', amount: 5000, currency: 'JPY', mode: 'fixed' as const, position: 0,
      rateToEur: 0.005, rateManual: false, rateDate: daysAgo(2), ...over,
    });
    it('met à jour une ligne de plus de 24 h', async () => {
      const { service, repo, trip } = await setup();
      await repo.saveBudgetLine(jpyLine(trip.id));
      const [updated] = await service.refreshRates(trip.id);
      expect(updated).toMatchObject({ rateToEur: 0.0061, rateDate: new Date().toISOString().slice(0, 10) });
      expect((await repo.getBudget(trip.id)).lines[0].rateToEur).toBe(0.0061);
    });
    it('laisse intactes les lignes manuelles, récentes ou en euros', async () => {
      const { service, repo, trip } = await setup();
      await repo.saveBudgetLine(jpyLine(trip.id, { rateManual: true }));
      await repo.saveBudgetLine(jpyLine(trip.id, { rateDate: daysAgo(0), position: 1 }));
      await repo.saveBudgetLine(jpyLine(trip.id, { currency: 'EUR', rateToEur: 1, position: 2 }));
      expect(await service.refreshRates(trip.id)).toEqual([]);
      expect((await repo.getBudget(trip.id)).lines.map((l) => l.rateToEur)).toEqual([0.005, 0.005, 1]);
    });
    it('ne change rien si le service est en panne', async () => {
      const { service, repo, trip } = await setup(downFx);
      await repo.saveBudgetLine(jpyLine(trip.id));
      expect(await service.refreshRates(trip.id)).toEqual([]);
      expect((await repo.getBudget(trip.id)).lines[0].rateToEur).toBe(0.005);
    });
  });

  it('trouve les taux des réservations et signale les devises manquantes', async () => {
    const { service } = await setup();
    const r = await service.reservationRates([
      makeReservation({ price: 100, currency: 'USD' }), makeReservation({ price: 50, currency: 'CAD' }),
      makeReservation({ price: 10, currency: 'EUR' }), makeReservation({ price: null, currency: 'GBP' }),
    ]);
    expect(r).toEqual({ rates: { USD: 0.92 }, missing: ['CAD'] });
  });

  it('donne le taux d’une dépense ou la raison de l’échec', async () => {
    const { service } = await setup();
    expect(await service.newExpenseRate('JPY', '2026-12-01')).toEqual({ rateToEur: 0.0061, manual: false });
    expect(await service.newExpenseRate('XXX', '2026-12-01')).toEqual({ error: 'UNSUPPORTED' });
    expect(await (await setup(downFx)).service.newExpenseRate('JPY', '2026-12-01')).toEqual({ error: 'UNAVAILABLE' });
  });

  describe('applyAdvice', () => {
    async function overBudget() {
      const { service, repo, trip } = await setup();
      const alice = await service.ensureTraveler(trip.id, 'Alice');
      await service.ensureTraveler(trip.id, 'Bob');
      const food = await repo.saveBudgetLine({ tripId: trip.id, category: 'food', label: 'Repas', amount: 40, currency: 'EUR', mode: 'per_person_per_day', position: 0, rateToEur: 1, rateManual: false, rateDate: daysAgo(0) });
      const act = await repo.saveBudgetLine({ tripId: trip.id, category: 'activity', label: 'Excursion', amount: 120, currency: 'EUR', mode: 'fixed', position: 1, rateToEur: 1, rateManual: false, rateDate: daysAgo(0) });
      await repo.updateBudgetSettings(trip.id, { cap: 450, capMode: 'total', fxMarginPct: 3 });
      return { service, repo, trip, alice, food, act };
    }
    const advise = async (repo: ReturnType<typeof createMemoryRepository>, tripId: string) => {
      const bundle = await repo.getBundle(tripId);
      const data = await repo.getBudget(tripId);
      const settings = { cap: bundle.trip.budgetCap ?? null, capMode: bundle.trip.budgetCapMode ?? 'total', fxMarginPct: bundle.trip.fxMarginPct ?? 3 } as const;
      const items = plannedItems({ lines: data.lines, reservations: [], travelers: data.travelers.length, days: 5, marginPct: settings.fxMarginPct, reservationRates: {} });
      const summary = computeBudget({ items, expenses: data.expenses, settings, travelers: data.travelers.length });
      return { summary, advice: computeAdvice({ summary, items, lines: data.lines, settings, travelers: data.travelers.length, days: 5 }) };
    };

    it('la baisse proportionnelle fait rentrer dans l’enveloppe', async () => {
      const { service, repo, trip } = await overBudget();
      const before = await advise(repo, trip.id);
      expect(before.summary.projectionCents).toBe(52000); // 40×2×5 + 120 = 520 €
      const prop = before.advice.find((a) => a.kind === 'proportional')!;
      await service.applyAdvice(trip.id, prop);
      expect((await advise(repo, trip.id)).summary.projectionCents).toBeLessThanOrEqual(45000);
    });
    it('retirer le plus gros poste met la ligne à 0', async () => {
      const { service, repo, trip, food } = await overBudget();
      const drop = (await advise(repo, trip.id)).advice.find((a) => a.kind === 'drop_largest')!;
      await service.applyAdvice(trip.id, drop);
      expect((await repo.getBudget(trip.id)).lines.find((l) => l.id === food.id)!.amount).toBe(0);
    });
    it('réduire la marge la fixe à 1 %', async () => {
      const { service, repo, trip } = await overBudget();
      await service.applyAdvice(trip.id, { kind: 'reduce_margin', savingCents: 1, suffices: false, newMarginPct: 1 });
      expect((await repo.getBundle(trip.id)).trip.fxMarginPct).toBe(1);
    });
  });
});

describe('BudgetService — voyageurs', () => {
  it('attribue des positions uniques même après la suppression d’un voyageur du milieu', async () => {
    const { service, repo, trip } = await setup();
    const [a, b, c] = [await service.ensureTraveler(trip.id, 'A'), await service.ensureTraveler(trip.id, 'B'), await service.ensureTraveler(trip.id, 'C')];
    void a; void c;
    await repo.deleteTraveler(b.id);
    await service.ensureTraveler(trip.id, 'D');
    const positions = (await repo.getBudget(trip.id)).travelers.map((t) => t.position);
    expect(new Set(positions).size).toBe(positions.length);
    expect((await repo.getBudget(trip.id)).travelers.map((t) => t.name)).toEqual(['A', 'C', 'D']);
  });

  it('crée seulement les voyageurs manquants quand on réessaie', async () => {
    const { service, repo, trip } = await setup();
    await service.ensureTravelers(trip.id, ['Alice', 'Bob']);
    await service.ensureTravelers(trip.id, ['Alice', 'Bob', 'Chloé']);
    expect((await repo.getBudget(trip.id)).travelers.map((t) => t.name)).toEqual(['Alice', 'Bob', 'Chloé']);
  });

  it('ne rafraîchit pas deux fois de suite quand le service publie la date de la veille', async () => {
    const yesterday = daysAgo(1);
    const fx: FxService = { getRate: async (c) => ({ currency: c, rate: 0.0061, date: yesterday, stale: false }), listCurrencies: async () => ['EUR', 'JPY'] };
    const { service, repo, trip } = await setup(fx);
    await repo.saveBudgetLine({ tripId: trip.id, category: 'food', label: 'Repas', amount: 5000, currency: 'JPY', mode: 'fixed', position: 0, rateToEur: 0.005, rateManual: false, rateDate: daysAgo(3) });
    expect(await service.refreshRates(trip.id)).toHaveLength(1);
    expect(await service.refreshRates(trip.id)).toEqual([]);
  });
});
