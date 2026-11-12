import { describe, expect, it } from 'vitest';
import { BudgetError, NotFoundError, type New, type TripRepository } from './TripRepository';
import type { BudgetLine, Expense, Traveler } from '../domain/budget/types';
import type { Reservation, Stop, Trip } from '../domain/types';
import type { AiDraft } from '../ai/types';

const newTrip = (): New<Trip> => ({
  name: 'Japon', countries: ['JP'], startDate: '2026-12-01', endDate: '2026-12-03',
  localCurrency: 'JPY', homeTimezone: 'Europe/Paris', updatedAt: '',
});
const newStop = (dayId: string, position: number, over: Partial<Stop> = {}): New<Stop> => ({
  dayId, position, kind: 'activity', title: `Lieu ${position}`, address: '', lat: 35, lon: 135, timezone: 'Asia/Tokyo',
  startTime: null, durationMin: null, note: '', phone: '', url: '', reservationId: null, ...over,
});
const newReservation = (tripId: string): New<Reservation> => ({
  tripId, type: 'lodging', title: 'Hôtel', startAt: { date: '2026-12-01', time: '15:00', timezone: 'Asia/Tokyo' },
  endAt: null, fromPlace: null, toPlace: null, confirmationNumber: 'SECRET-conf', price: 100, currency: 'EUR',
  url: '', phone: '', note: 'SECRET-note',
});

export function runRepositoryContract(name: string, make: () => Promise<TripRepository>) {
  describe(`contrat TripRepository — ${name}`, () => {
    async function setup() {
      const repo = await make();
      const trip = await repo.createTrip(newTrip());
      const days = await repo.createDays(trip.id, ['2026-12-01', '2026-12-02']);
      return { repo, trip, days };
    }

    it('crée et relit un voyage', async () => {
      const { repo, trip } = await setup();
      expect((await repo.listTrips()).map((t) => t.id)).toContain(trip.id);
      const b = await repo.getBundle(trip.id);
      expect(b.trip.name).toBe('Japon');
      expect(b.days.map((d) => d.date).sort()).toEqual(['2026-12-01', '2026-12-02']);
    });

    it('supprime un voyage et tout son contenu', async () => {
      const { repo, trip, days } = await setup();
      await repo.saveStop(newStop(days[0].id, 0));
      await repo.deleteTrip(trip.id);
      await expect(repo.getBundle(trip.id)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('supprime les lieux d’un jour supprimé', async () => {
      const { repo, trip, days } = await setup();
      await repo.saveStop(newStop(days[0].id, 0));
      await repo.saveStop(newStop(days[1].id, 0));
      await repo.deleteDays([days[0].id]);
      const b = await repo.getBundle(trip.id);
      expect(b.stops.map((s) => s.dayId)).toEqual([days[1].id]);
    });

    it('supprime les lieux liés à une réservation supprimée', async () => {
      const { repo, trip, days } = await setup();
      const r = await repo.saveReservation(newReservation(trip.id));
      await repo.saveStop(newStop(days[0].id, 0, { reservationId: r.id }));
      await repo.deleteReservation(r.id);
      const b = await repo.getBundle(trip.id);
      expect(b.reservations).toEqual([]);
      expect(b.stops).toEqual([]);
    });

    it('réordonne les lieux', async () => {
      const { repo, trip, days } = await setup();
      const a = await repo.saveStop(newStop(days[0].id, 0));
      const b = await repo.saveStop(newStop(days[0].id, 1));
      const c = await repo.saveStop(newStop(days[0].id, 2));
      await repo.reorderStops(days[0].id, [c.id, a.id, b.id]);
      const bundle = await repo.getBundle(trip.id);
      const pos = Object.fromEntries(bundle.stops.map((s) => [s.id, s.position]));
      expect([pos[c.id], pos[a.id], pos[b.id]]).toEqual([0, 1, 2]);
    });

    it('met à jour un lieu existant', async () => {
      const { repo, trip, days } = await setup();
      const s = await repo.saveStop(newStop(days[0].id, 0));
      await repo.saveStop({ ...s, title: 'Temple' });
      const b = await repo.getBundle(trip.id);
      expect(b.stops).toHaveLength(1);
      expect(b.stops[0].title).toBe('Temple');
    });

    it('gère les liens de partage', async () => {
      const { repo, trip } = await setup();
      await repo.saveReservation(newReservation(trip.id));
      expect(await repo.getShareLink(trip.id)).toBeNull();
      const first = await repo.createShareLink(trip.id, true);
      expect(first.token).toMatch(/^[0-9a-f]{32}$/);
      expect(first.hideSensitive).toBe(true);
      const shared = await repo.getSharedRoadbook(first.token);
      expect(shared?.bundle.trip.id).toBe(trip.id);
      expect(JSON.stringify(shared)).not.toContain('SECRET');

      const second = await repo.createShareLink(trip.id, false);
      expect(await repo.getSharedRoadbook(first.token)).toBeNull();
      expect(JSON.stringify(await repo.getSharedRoadbook(second.token))).toContain('SECRET-conf');
      expect((await repo.getShareLink(trip.id))?.token).toBe(second.token);

      await repo.revokeShareLink(trip.id);
      expect(await repo.getSharedRoadbook(second.token)).toBeNull();
      expect(await repo.getShareLink(trip.id)).toBeNull();
      expect(await repo.getSharedRoadbook('0'.repeat(32))).toBeNull();
    });

    it('affiche le nom choisi sur le roadbook partagé, jamais une adresse e-mail', async () => {
      const { repo, trip } = await setup();
      const link = await repo.createShareLink(trip.id, true);
      expect((await repo.getSharedRoadbook(link.token))?.ownerName).toBe('Voyageur');
      await repo.setDisplayName('lemikxfamily');
      expect(await repo.getDisplayName()).toBe('lemikxfamily');
      expect((await repo.getSharedRoadbook(link.token))?.ownerName).toBe('lemikxfamily');
    });

    it('n’affiche plus le roadbook partagé d’un voyage supprimé', async () => {
      const { repo, trip } = await setup();
      const link = await repo.createShareLink(trip.id, true);
      await repo.deleteTrip(trip.id);
      expect(await repo.getSharedRoadbook(link.token)).toBeNull();
    });

    it('gère les abonnements calendrier', async () => {
      const { repo, trip } = await setup();
      const share = await repo.createShareLink(trip.id, true);
      const first = await repo.createCalendarLink(trip.id, { includeLegs: true, includeChecklist: true });
      const second = await repo.createCalendarLink(trip.id, { includeLegs: true, includeChecklist: false });
      expect(second.token).toMatch(/^[0-9a-f]{32}$/);
      expect(second.token).not.toBe(first.token);
      expect(second.token).not.toBe(share.token);
      expect((await repo.getCalendarLink(trip.id))?.token).toBe(second.token);
      const updated = await repo.updateCalendarOptions(trip.id, { includeLegs: false, includeChecklist: true });
      expect(updated).toMatchObject({ token: second.token, includeLegs: false, includeChecklist: true });
      await repo.revokeCalendarLink(trip.id);
      expect(await repo.getCalendarLink(trip.id)).toBeNull();
    });

    describe('budget', () => {
      const traveler = (tripId: string, name: string, position: number): New<Traveler> => ({ tripId, name, position });
      const line = (tripId: string): New<BudgetLine> => ({
        tripId, category: 'food', label: 'Repas', amount: 40, currency: 'EUR', mode: 'per_person_per_day', position: 0,
        rateToEur: 1, rateManual: false, rateDate: '2026-11-11',
      });
      const expense = (tripId: string, paidBy: string, participantIds: string[], over: Partial<Expense> = {}): New<Expense> => ({
        tripId, date: '2026-12-01', category: 'food', label: 'Dîner', amount: 60, currency: 'EUR', rateToEur: 1, rateManual: false,
        paidBy, participantIds, lineId: null, reservationId: null, ...over,
      });
      async function budgetSetup() {
        const { repo, trip } = await setup();
        const alice = await repo.saveTraveler(traveler(trip.id, 'Alice', 0));
        const bob = await repo.saveTraveler(traveler(trip.id, 'Bob', 1));
        return { repo, trip, alice, bob };
      }

      it('enregistre voyageurs, lignes et dépenses puis les relit', async () => {
        const { repo, trip, alice, bob } = await budgetSetup();
        const l = await repo.saveBudgetLine(line(trip.id));
        const e = await repo.saveExpense(expense(trip.id, alice.id, [alice.id, bob.id], { lineId: l.id }));
        const data = await repo.getBudget(trip.id);
        expect(data.travelers.map((t) => t.name)).toEqual(['Alice', 'Bob']);
        expect(data.lines).toHaveLength(1);
        expect(data.expenses).toHaveLength(1);
        expect(data.expenses[0]).toMatchObject({ id: e.id, paidBy: alice.id, lineId: l.id });
        expect([...data.expenses[0].participantIds].sort()).toEqual([alice.id, bob.id].sort());
      });

      it('met à jour l’enveloppe et la marge du voyage', async () => {
        const { repo, trip } = await budgetSetup();
        await repo.updateBudgetSettings(trip.id, { cap: 3000, capMode: 'per_person', fxMarginPct: 5 });
        expect((await repo.getBundle(trip.id)).trip).toMatchObject({ budgetCap: 3000, budgetCapMode: 'per_person', fxMarginPct: 5 });
        await repo.updateBudgetSettings(trip.id, { cap: null, capMode: 'total', fxMarginPct: 3 });
        expect((await repo.getBundle(trip.id)).trip.budgetCap ?? null).toBeNull();
      });

      it('supprime tout le budget avec le voyage', async () => {
        const { repo, trip, alice } = await budgetSetup();
        await repo.saveExpense(expense(trip.id, alice.id, [alice.id]));
        await repo.deleteTrip(trip.id);
        const left = await repo.getBudget(trip.id).catch(() => ({ travelers: [], lines: [], expenses: [] }));
        expect(left).toEqual({ travelers: [], lines: [], expenses: [] });
      });

      it('garde les dépenses « hors prévu » quand une ligne ou une réservation disparaît', async () => {
        const { repo, trip, alice } = await budgetSetup();
        const l = await repo.saveBudgetLine(line(trip.id));
        const r = await repo.saveReservation(newReservation(trip.id));
        await repo.saveExpense(expense(trip.id, alice.id, [alice.id], { lineId: l.id }));
        await repo.saveExpense(expense(trip.id, alice.id, [alice.id], { reservationId: r.id }));
        await repo.deleteBudgetLine(l.id);
        await repo.deleteReservation(r.id);
        const { expenses } = await repo.getBudget(trip.id);
        expect(expenses).toHaveLength(2);
        expect(expenses.every((x) => x.lineId === null && x.reservationId === null)).toBe(true);
      });

      it('refuse les cas invalides', async () => {
        const { repo, trip, alice, bob } = await budgetSetup();
        await repo.saveExpense(expense(trip.id, alice.id, [alice.id, bob.id]));
        await expect(repo.deleteTraveler(alice.id)).rejects.toMatchObject({ code: 'TRAVELER_IN_USE' });
        await expect(repo.saveExpense(expense(trip.id, alice.id, []))).rejects.toMatchObject({ code: 'NO_PARTICIPANT' });
        const l = await repo.saveBudgetLine(line(trip.id));
        const r = await repo.saveReservation(newReservation(trip.id));
        await expect(repo.saveExpense(expense(trip.id, alice.id, [alice.id], { lineId: l.id, reservationId: r.id }))).rejects.toBeInstanceOf(BudgetError);
        const chloe = await repo.saveTraveler(traveler(trip.id, 'Chloé', 2));
        await repo.deleteTraveler(chloe.id);
        expect((await repo.getBudget(trip.id)).travelers).toHaveLength(2);
      });

      it('refuse de supprimer le dernier voyageur', async () => {
        const { repo, trip } = await setup();
        const only = await repo.saveTraveler(traveler(trip.id, 'Seul', 0));
        await expect(repo.deleteTraveler(only.id)).rejects.toMatchObject({ code: 'LAST_TRAVELER' });
      });

      it('ne laisse fuiter aucun champ budget par le roadbook partagé', async () => {
        const { repo, trip } = await budgetSetup();
        await repo.updateBudgetSettings(trip.id, { cap: 3000, capMode: 'total', fxMarginPct: 7 });
        for (const hide of [true, false]) {
          const link = await repo.createShareLink(trip.id, hide);
          const json = JSON.stringify(await repo.getSharedRoadbook(link.token));
          expect(json).not.toMatch(/budgetCap|budget_cap|fxMargin|fx_margin|travelers|expenses/);
        }
      });
    });

    describe('brouillons IA', () => {
      const draft = (title: string, over: Partial<AiDraft> = {}): Omit<AiDraft, 'id'> => ({
        stage: 'brief', mode: 'surprise', ideas: null, chosenIdeaId: null, itinerary: null, tripId: null, protocolVersion: 1, updatedAt: '',
        brief: {
          destination: title, startDate: '2026-12-20', endDate: '2026-12-24', departureCity: 'Lyon', adults: 2, children: 0,
          travelers: [{ name: 'A', nationality: 'FR' }], budgetPerPersonEur: 1500, travelerTypes: [], tripTypes: [], wishes: [],
          lodging: [], pace: null, constraints: 'brief-secret',
        },
        ...over,
      });

      it('crée, liste (récent d’abord), met à jour et supprime', async () => {
        const repo = await make();
        const a = await repo.saveDraft(draft('A'));
        await new Promise((r) => setTimeout(r, 5));
        const b = await repo.saveDraft(draft('B'));
        expect((await repo.listDrafts()).map((d) => d.id)).toEqual([b.id, a.id]);
        await new Promise((r) => setTimeout(r, 5));
        const a2 = await repo.saveDraft({ ...a, stage: 'ideas_requested' });
        expect(a2.id).toBe(a.id);
        expect(a2.updatedAt > a.updatedAt).toBe(true);
        expect((await repo.listDrafts()).map((d) => d.id)).toEqual([a.id, b.id]);
        await repo.deleteDraft(b.id);
        expect((await repo.listDrafts()).map((d) => d.id)).toEqual([a.id]);
      });

      it('getDraft d’un id inconnu → NotFoundError', async () => {
        const repo = await make();
        await expect(repo.getDraft('00000000-0000-4000-8000-000000000000')).rejects.toBeInstanceOf(NotFoundError);
      });

      it('rend le contenu à l’identique', async () => {
        const repo = await make();
        const d = draft('Lisbonne');
        const saved = await repo.saveDraft(d);
        const back = await repo.getDraft(saved.id);
        expect(back.brief).toEqual(d.brief);
        expect(back.brief.departureCity).toBe('Lyon');
      });

      it('supprimer le voyage garde le brouillon avec tripId null', async () => {
        const { repo, trip } = await setup();
        const saved = await repo.saveDraft(draft('X', { stage: 'created', tripId: trip.id }));
        await repo.deleteTrip(trip.id);
        const back = await repo.getDraft(saved.id);
        expect(back.tripId).toBeNull();
      });

      it('ne fuit ni par le bundle ni par le partage', async () => {
        const { repo, trip } = await setup();
        await repo.saveDraft(draft('X', { tripId: trip.id }));
        const link = await repo.createShareLink(trip.id, false);
        const json = JSON.stringify([await repo.getBundle(trip.id), await repo.getSharedRoadbook(link.token)]);
        expect(json).not.toMatch(/brief-secret|brief|draft/);
      });
    });
  });
}
