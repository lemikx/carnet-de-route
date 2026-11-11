import { reservationToStops, sortReservations } from './reservations';
import { makeReservation } from '../test/factories';
import type { PlaceRef } from './types';

const place = (title: string, timezone: string): PlaceRef => ({ title, address: title, lat: 1, lon: 2, timezone });

describe('reservationToStops', () => {
  it('transforme un vol en deux lieux et un trajet en avion', () => {
    const r = makeReservation({
      id: 'R1', type: 'flight', title: 'AF276',
      startAt: { date: '2026-12-01', time: '10:00', timezone: 'Europe/Paris' },
      endAt: { date: '2026-12-02', time: '06:00', timezone: 'Asia/Tokyo' },
      fromPlace: place('Paris CDG', 'Europe/Paris'), toPlace: place('Tokyo Haneda', 'Asia/Tokyo'),
    });
    const out = reservationToStops(r);
    expect(out.stops.map((s) => [s.date, s.title, s.kind, s.startTime])).toEqual([
      ['2026-12-01', 'Départ : Paris CDG', 'point', '10:00'],
      ['2026-12-02', 'Arrivée : Tokyo Haneda', 'point', '06:00'],
    ]);
    expect(out.stops.every((s) => s.reservationId === 'R1')).toBe(true);
    expect(out.leg).toEqual({ mode: 'plane', durationMin: 720 });
  });

  it('transforme un train de la même façon', () => {
    const r = makeReservation({
      type: 'train', title: 'Shinkansen',
      startAt: { date: '2026-12-03', time: '09:00', timezone: 'Asia/Tokyo' },
      endAt: { date: '2026-12-03', time: '11:15', timezone: 'Asia/Tokyo' },
      fromPlace: place('Tokyo', 'Asia/Tokyo'), toPlace: place('Kyoto', 'Asia/Tokyo'),
    });
    expect(reservationToStops(r).leg).toEqual({ mode: 'train', durationMin: 135 });
  });

  it('transforme un hôtel en hébergement à la date d’arrivée', () => {
    const r = makeReservation({
      id: 'H1', type: 'lodging', title: 'Hôtel Sakura',
      startAt: { date: '2026-12-02', time: '15:00', timezone: 'Asia/Tokyo' },
      endAt: { date: '2026-12-04', time: '11:00', timezone: 'Asia/Tokyo' },
      toPlace: place('Shinjuku', 'Asia/Tokyo'),
    });
    const out = reservationToStops(r);
    expect(out.stops).toHaveLength(1);
    expect(out.stops[0]).toMatchObject({ date: '2026-12-02', kind: 'lodging', title: 'Hôtel Sakura', reservationId: 'H1' });
    expect(out.leg).toBeNull();
  });

  it('transforme une activité en un lieu activité', () => {
    const r = makeReservation({ type: 'activity', title: 'Cours de cuisine', fromPlace: place('Kyoto', 'Asia/Tokyo'),
      startAt: { date: '2026-12-03', time: '14:00', timezone: 'Asia/Tokyo' } });
    expect(reservationToStops(r).stops[0]).toMatchObject({ kind: 'activity', title: 'Cours de cuisine', startTime: '14:00' });
  });
});

describe('sortReservations', () => {
  it('trie selon l’instant réel, fuseaux compris', () => {
    const train = makeReservation({ id: 'train', startAt: { date: '2026-12-01', time: '07:00', timezone: 'Europe/Paris' } });
    const vol = makeReservation({ id: 'vol', startAt: { date: '2026-12-01', time: '08:00', timezone: 'Asia/Tokyo' } });
    expect(sortReservations([train, vol]).map((r) => r.id)).toEqual(['vol', 'train']);
  });
});
