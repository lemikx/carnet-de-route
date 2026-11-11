import { describe, expect, it } from 'vitest';
import { NotFoundError, type New, type TripRepository } from './TripRepository';
import type { Reservation, Stop, Trip } from '../domain/types';

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
  });
}
