import type { Day, Leg, Reservation, Stop, Trip } from '../domain/types';

let n = 0;
const id = (p: string) => `${p}${++n}`;

export function makeTrip(over: Partial<Trip> = {}): Trip {
  return {
    id: id('t'), name: 'Japon', countries: ['JP'], startDate: '2026-12-01', endDate: '2026-12-03',
    localCurrency: 'JPY', homeTimezone: 'Europe/Paris', updatedAt: '2026-11-11T10:00:00Z', ...over,
  };
}

export function makeDay(over: Partial<Day> = {}): Day {
  return { id: id('d'), tripId: 't1', date: '2026-12-01', title: '', note: '', ...over };
}

export function makeStop(over: Partial<Stop> = {}): Stop {
  return {
    id: id('s'), dayId: 'd1', position: 0, kind: 'activity', title: 'Lieu', address: '', lat: 35, lon: 135,
    timezone: 'Asia/Tokyo', startTime: null, durationMin: null, note: '', phone: '', url: '', reservationId: null,
    ...over,
  };
}

export function makeLeg(from: Stop, to: Stop, over: Partial<Leg> = {}): Leg {
  return {
    id: id('l'), fromStopId: from.id, toStopId: to.id, mode: 'car', durationMin: null, distanceKm: null,
    geometry: null, source: 'auto', error: null, computedAt: null, fromKey: null, toKey: null, ...over,
  };
}

export function makeReservation(over: Partial<Reservation> = {}): Reservation {
  return {
    id: id('r'), tripId: 't1', type: 'activity', title: 'Réservation',
    startAt: { date: '2026-12-01', time: '10:00', timezone: 'Europe/Paris' }, endAt: null,
    fromPlace: null, toPlace: null, confirmationNumber: '', price: null, currency: 'EUR', url: '', phone: '', note: '',
    ...over,
  };
}
