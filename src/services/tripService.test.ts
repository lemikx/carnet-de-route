import { createMemoryRepository } from '../data/memoryRepository';
import { createFakeRouting } from '../routing/fakeRouting';
import { createTripService, NeedsConfirmationError, type StopInput } from './tripService';
import type { New } from '../data/TripRepository';
import type { Reservation, Trip } from '../domain/types';

const tripInput = (over: Partial<Trip> = {}): New<Trip> => ({
  name: 'Japon', countries: ['JP'], startDate: '2026-12-01', endDate: '2026-12-03',
  localCurrency: 'JPY', homeTimezone: 'Europe/Paris', updatedAt: '', ...over,
});
const stop = (title: string, lat: number, lon: number, over: Partial<StopInput> = {}): StopInput => ({
  kind: 'activity', title, address: title, lat, lon, timezone: 'Asia/Tokyo', startTime: null, durationMin: null,
  note: '', phone: '', url: '', reservationId: null, ...over,
});
const flight = (tripId: string, arrival = '06:00'): New<Reservation> => ({
  tripId, type: 'flight', title: 'AF276',
  startAt: { date: '2026-12-01', time: '10:00', timezone: 'Europe/Paris' },
  endAt: { date: '2026-12-02', time: arrival, timezone: 'Asia/Tokyo' },
  fromPlace: { title: 'Paris CDG', address: 'CDG', lat: 49.0, lon: 2.55, timezone: 'Europe/Paris' },
  toPlace: { title: 'Tokyo Haneda', address: 'HND', lat: 35.55, lon: 139.78, timezone: 'Asia/Tokyo' },
  confirmationNumber: 'ABC', price: null, currency: 'EUR', url: '', phone: '', note: '',
});

function setup() {
  const repo = createMemoryRepository();
  return { repo, service: createTripService(repo, createFakeRouting()) };
}

describe('TripService', () => {
  it('crée un voyage avec ses jours et la checklist par défaut', async () => {
    const { service } = setup();
    const b = await service.createTrip(tripInput());
    expect(b.days).toHaveLength(3);
    expect(b.checklist).toHaveLength(15);
  });

  it('demande confirmation avant de supprimer un jour qui contient un lieu', async () => {
    const { service } = setup();
    const b = await service.createTrip(tripInput());
    const d1 = b.days.find((d) => d.date === '2026-12-01')!;
    await service.addStop(d1.id, stop('Temple', 35, 135.7));
    await expect(service.changeDates(b.trip.id, '2026-12-02', '2026-12-04')).rejects.toBeInstanceOf(NeedsConfirmationError);
    const unchanged = await service.changeDates(b.trip.id, '2026-12-01', '2026-12-03');
    expect(unchanged.stops).toHaveLength(1);
    const after = await service.changeDates(b.trip.id, '2026-12-02', '2026-12-04', { confirm: true });
    expect(after.days.map((d) => d.date).sort()).toEqual(['2026-12-02', '2026-12-03', '2026-12-04']);
    expect(after.stops).toHaveLength(0);
    expect(after.trip.startDate).toBe('2026-12-02');
  });

  it('calcule automatiquement le trajet entre deux lieux', async () => {
    const { service } = setup();
    const b = await service.createTrip(tripInput());
    const d = b.days[0];
    await service.addStop(d.id, stop('Kyoto', 35.01, 135.77));
    const r = await service.addStop(d.id, stop('Nara', 34.69, 135.8));
    expect(r.legs).toHaveLength(1);
    expect(r.legs[0]).toMatchObject({ source: 'auto', mode: 'car', error: null });
    expect(r.legs[0].durationMin).toBeGreaterThan(0);
  });

  it('enregistre un message clair quand aucun trajet n’est possible', async () => {
    const { service } = setup();
    const b = await service.createTrip(tripInput());
    await service.addStop(b.days[0].id, stop('Kyoto', 35.01, 135.77));
    const r = await service.addStop(b.days[0].id, stop('Île', 0, 140));
    expect(r.legs[0].durationMin).toBeNull();
    expect(r.legs[0].error).toContain('Aucun trajet routier possible');
  });

  it('conserve une durée manuelle quand une adresse change', async () => {
    const { service } = setup();
    const b = await service.createTrip(tripInput());
    await service.addStop(b.days[0].id, stop('Kyoto', 35.01, 135.77));
    let r = await service.addStop(b.days[0].id, stop('Nara', 34.69, 135.8));
    r = await service.setLegManual(r.legs[0].id, 'car', 99);
    const nara = r.stops.find((s) => s.title === 'Nara')!;
    r = await service.updateStop({ ...nara, lat: 34.6, lon: 135.9 });
    expect(r.legs[0]).toMatchObject({ durationMin: 99, source: 'manual' });
  });

  it('passe un trajet en avion en saisie manuelle puis revient au calcul en voiture', async () => {
    const { service } = setup();
    const b = await service.createTrip(tripInput());
    await service.addStop(b.days[0].id, stop('Kyoto', 35.01, 135.77));
    let r = await service.addStop(b.days[0].id, stop('Nara', 34.69, 135.8));
    r = await service.setLegMode(r.legs[0].id, 'plane');
    expect(r.legs[0]).toMatchObject({ mode: 'plane', source: 'manual', durationMin: null });
    r = await service.setLegMode(r.legs[0].id, 'walk');
    expect(r.legs[0].source).toBe('auto');
    expect(r.legs[0].durationMin).toBeGreaterThan(60);
  });

  it('transforme un vol en deux lieux reliés par un trajet en avion, sans doublon à la modification', async () => {
    const { service } = setup();
    const b = await service.createTrip(tripInput());
    let r = await service.saveReservation(flight(b.trip.id));
    const linked = r.stops.filter((s) => s.reservationId === r.reservations[0].id);
    expect(linked).toHaveLength(2);
    expect(r.legs).toHaveLength(1);
    expect(r.legs[0]).toMatchObject({ mode: 'plane', source: 'reservation', durationMin: 720 });
    r = await service.saveReservation({ ...r.reservations[0], endAt: { date: '2026-12-02', time: '07:00', timezone: 'Asia/Tokyo' } });
    expect(r.stops.filter((s) => s.reservationId)).toHaveLength(2);
    expect(r.legs[0].durationMin).toBe(780);
    const arrival = r.stops.find((s) => s.title.startsWith('Arrivée'))!;
    expect(r.days.find((d) => d.id === arrival.dayId)!.date).toBe('2026-12-02');
  });

  it('range une nouvelle étape selon son heure, avant l’hébergement de la nuit', async () => {
    const { service } = setup();
    const b = await service.createTrip(tripInput());
    const d = b.days.sort((x, y) => x.date.localeCompare(y.date))[0];
    await service.addStop(d.id, stop('Hôtel', 35, 135.7, { kind: 'lodging', startTime: '15:00' }));
    await service.addStop(d.id, stop('Musée', 35.01, 135.77, { startTime: '10:00' }));
    await service.addStop(d.id, stop('Temple', 35.02, 135.78, { startTime: '09:00' }));
    const r = await service.addStop(d.id, stop('Parc', 35.03, 135.79));
    const order = r.stops.filter((s) => s.dayId === d.id).sort((x, y) => x.position - y.position).map((s) => s.title);
    expect(order).toEqual(['Temple', 'Musée', 'Parc', 'Hôtel']);
  });

  it('modifier une réservation garde l’étape liée, sa note et les trajets saisis à la main', async () => {
    const { service, repo } = setup();
    const b = await service.createTrip(tripInput());
    const d1 = b.days.sort((x, y) => x.date.localeCompare(y.date))[0];
    let r = await service.saveReservation({
      tripId: b.trip.id, type: 'lodging', title: 'Hôtel', startAt: { date: '2026-12-01', time: '15:00', timezone: 'Asia/Tokyo' },
      endAt: null, fromPlace: null, toPlace: { title: 'Hôtel', address: 'Kyoto', lat: 35, lon: 135.7, timezone: 'Asia/Tokyo' },
      confirmationNumber: 'A1', price: null, currency: 'EUR', url: '', phone: '', note: '',
    });
    const hotel = r.stops.find((s) => s.reservationId)!;
    await repo.saveStop({ ...hotel, note: 'Code porte 1234' });
    const d2 = r.days.find((d) => d.date === '2026-12-02')!;
    r = await service.addStop(d2.id, stop('Gare', 35.1, 135.8));
    const leg = r.legs.find((l) => l.fromStopId === hotel.id)!;
    r = await service.setLegManual(leg.id, 'train', 45);

    r = await service.saveReservation({ ...r.reservations[0], confirmationNumber: 'B2' });
    const after = r.stops.find((s) => s.reservationId)!;
    expect(after.id).toBe(hotel.id);
    expect(after.note).toBe('Code porte 1234');
    expect(r.legs.find((l) => l.fromStopId === hotel.id)).toMatchObject({ mode: 'train', durationMin: 45, source: 'manual' });

    r = await service.saveReservation({ ...r.reservations[0], startAt: { date: '2026-12-02', time: '15:00', timezone: 'Asia/Tokyo' } });
    const moved = r.stops.find((s) => s.reservationId)!;
    expect(moved.id).toBe(hotel.id);
    expect(moved.dayId).toBe(d2.id);
    expect(d1.id).not.toBe(d2.id);
  });

  it('range les étapes selon l’heure réelle quand les fuseaux diffèrent', async () => {
    const { service } = setup();
    const b = await service.createTrip(tripInput());
    const d = b.days.sort((x, y) => x.date.localeCompare(y.date))[0];
    // 10:00 à Tokyo = 01:00 UTC ; 09:00 à Paris = 08:00 UTC : Paris vient après Tokyo malgré « 09:00 » < « 10:00 ».
    await service.addStop(d.id, stop('Tokyo', 35.68, 139.65, { startTime: '10:00', timezone: 'Asia/Tokyo' }));
    const r = await service.addStop(d.id, stop('Paris', 48.86, 2.35, { startTime: '09:00', timezone: 'Europe/Paris' }));
    const order = r.stops.filter((s) => s.dayId === d.id).sort((x, y) => x.position - y.position).map((s) => s.title);
    expect(order).toEqual(['Tokyo', 'Paris']);
  });

  it('recalcule tout seul le trajet quand une étape sans carte reçoit une position', async () => {
    const { service } = setup();
    const b = await service.createTrip(tripInput());
    const d = b.days.sort((x, y) => x.date.localeCompare(y.date))[0];
    await service.addStop(d.id, stop('Kyoto', 35.01, 135.77));
    let r = await service.addStop(d.id, stop('Nara', null as unknown as number, null as unknown as number));
    expect(r.legs[0].durationMin).toBeNull();
    r = await service.setLegManual(r.legs[0].id, 'car', 0);
    expect(r.legs[0]).toMatchObject({ source: 'manual', durationMin: 0 });
    const nara = r.stops.find((s) => s.title === 'Nara')!;
    r = await service.updateStop({ ...nara, lat: 34.69, lon: 135.8 });
    expect(r.legs[0].source).toBe('auto');
    expect(r.legs[0].durationMin).toBeGreaterThan(0);
  });

  it('garde une durée saisie à la main quand la position de l’étape ne change pas', async () => {
    const { service } = setup();
    const b = await service.createTrip(tripInput());
    const d = b.days.sort((x, y) => x.date.localeCompare(y.date))[0];
    await service.addStop(d.id, stop('Kyoto', 35.01, 135.77));
    let r = await service.addStop(d.id, stop('Nara', 34.69, 135.8));
    r = await service.setLegManual(r.legs[0].id, 'train', 45);
    const nara = r.stops.find((s) => s.title === 'Nara')!;
    r = await service.updateStop({ ...nara, note: 'Cerfs' });
    expect(r.legs[0]).toMatchObject({ source: 'manual', mode: 'train', durationMin: 45 });
  });

  it('ne crée pas de lieu pour une réservation hors des dates du voyage', async () => {
    const { service } = setup();
    const b = await service.createTrip(tripInput());
    const r = await service.saveReservation({ ...flight(b.trip.id), startAt: { date: '2027-01-10', time: '10:00', timezone: 'Europe/Paris' }, endAt: { date: '2027-01-11', time: '06:00', timezone: 'Asia/Tokyo' } });
    expect(r.reservations).toHaveLength(1);
    expect(r.stops).toHaveLength(0);
  });

  it('déplace un lieu vers le jour suivant et recalcule les trajets', async () => {
    const { service } = setup();
    const b = await service.createTrip(tripInput());
    const [d1, d2] = b.days.sort((x, y) => x.date.localeCompare(y.date));
    await service.addStop(d1.id, stop('Kyoto', 35.01, 135.77));
    await service.addStop(d1.id, stop('Nara', 34.69, 135.8));
    let r = await service.addStop(d2.id, stop('Osaka', 34.69, 135.5));
    const nara = r.stops.find((s) => s.title === 'Nara')!;
    r = await service.moveStop(nara.id, d2.id, 1);
    const title = (id: string) => r.stops.find((s) => s.id === id)!.title;
    expect(r.legs.map((l) => `${title(l.fromStopId)}>${title(l.toStopId)}`).sort()).toEqual(['Kyoto>Osaka', 'Osaka>Nara']);
    expect(r.stops.find((s) => s.id === nara.id)).toMatchObject({ dayId: d2.id, position: 1 });
  });

  it('duplique un voyage avec tout son contenu', async () => {
    const { service } = setup();
    const b = await service.createTrip(tripInput());
    await service.addStop(b.days[0].id, stop('Kyoto', 35.01, 135.77));
    await service.addStop(b.days[0].id, stop('Nara', 34.69, 135.8));
    const copy = await service.duplicateTrip(b.trip.id, 'Japon (copie)');
    expect(copy.trip.id).not.toBe(b.trip.id);
    expect(copy.trip.name).toBe('Japon (copie)');
    expect(copy.days).toHaveLength(3);
    expect(copy.stops).toHaveLength(2);
    expect(copy.legs).toHaveLength(1);
    expect(copy.checklist).toHaveLength(15);
  });
});
