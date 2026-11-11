import type { TripBundle } from '../domain/types';
import { makeDay, makeLeg, makeReservation, makeStop, makeTrip } from './factories';

/** Voyage de 3 jours avec valeurs sentinelles « SECRET-… » dans tous les champs sensibles. */
export function sampleBundle(): TripBundle {
  const trip = makeTrip({ id: 't1', startDate: '2026-12-01', endDate: '2026-12-03' });
  const d1 = makeDay({ id: 'd1', tripId: 't1', date: '2026-12-01', note: 'SECRET-day-note' });
  const d2 = makeDay({ id: 'd2', tripId: 't1', date: '2026-12-02' });
  const d3 = makeDay({ id: 'd3', tripId: 't1', date: '2026-12-03' });
  const hotel = makeReservation({
    id: 'H1', tripId: 't1', type: 'lodging', title: 'Hôtel Sakura', confirmationNumber: 'SECRET-conf',
    price: 4242, url: 'https://SECRET-url.example', note: 'SECRET-res-note',
    startAt: { date: '2026-12-01', time: '15:00', timezone: 'Asia/Tokyo' },
    endAt: { date: '2026-12-03', time: '11:00', timezone: 'Asia/Tokyo' },
  });
  const a = makeStop({ id: 'A', dayId: 'd1', position: 0, title: 'Temple', startTime: '09:00', durationMin: 60, note: 'SECRET-stop-note' });
  const b = makeStop({ id: 'B', dayId: 'd1', position: 1, title: 'Hôtel Sakura', kind: 'lodging', reservationId: 'H1', url: 'https://SECRET-stopurl.example' });
  const c = makeStop({ id: 'C', dayId: 'd2', position: 0, title: 'Marché', startTime: '10:00' });
  const legs = [makeLeg(a, b, { id: 'L1', durationMin: 30, distanceKm: 12 }), makeLeg(b, c, { id: 'L2', durationMin: 20, distanceKm: 8 })];
  return {
    trip,
    days: [d1, d2, d3],
    stops: [a, b, c],
    legs,
    reservations: [hotel],
    checklist: [{ id: 'c1', tripId: 't1', category: 'documents', label: 'Passeport', done: true, dueDate: null, position: 0 }],
    contacts: [{ id: 'k1', tripId: 't1', name: 'Ambassade de France', kind: 'embassy', phone: '+81 3', address: 'Tokyo', note: 'SECRET-contact-note' }],
  };
}
