import { buildCalendar } from './calendar';
import { makeDay, makeLeg, makeReservation, makeStop, makeTrip } from '../test/factories';
import type { PlaceRef, TripBundle } from './types';

const ALL = { includeLegs: true, includeChecklist: true };
const NOW = new Date('2026-11-11T10:00:00Z');
const place = (title: string, timezone: string): PlaceRef => ({ title, address: `${title}, adresse`, lat: 1, lon: 2, timezone });

function bundle(over: Partial<TripBundle> = {}): TripBundle {
  return {
    trip: makeTrip({ id: 't1', name: 'Japon 2026' }), days: [], stops: [], legs: [], reservations: [], checklist: [], contacts: [],
    ...over,
  };
}
const unfold = (ics: string) => ics.replace(/\r\n /g, '');
const lines = (ics: string) => ics.split('\r\n');

describe('buildCalendar', () => {
  it('produit un en-tête iCalendar valide', () => {
    const ics = buildCalendar(bundle(), ALL, NOW);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Carnet de route//FR\r\n')).toBe(true);
    expect(unfold(ics)).toContain('X-WR-CALNAME:Japon 2026 — Carnet de route');
    expect(ics).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT1H');
    expect(ics).toContain('X-PUBLISHED-TTL:PT1H');
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('place un vol aux bonnes heures UTC', () => {
    const r = makeReservation({
      id: 'R1', type: 'flight', title: 'AF276', confirmationNumber: 'ABC123',
      startAt: { date: '2026-12-01', time: '10:00', timezone: 'Europe/Paris' },
      endAt: { date: '2026-12-02', time: '06:00', timezone: 'Asia/Tokyo' },
      fromPlace: place('Paris CDG', 'Europe/Paris'), toPlace: place('Tokyo Haneda', 'Asia/Tokyo'),
    });
    const ics = unfold(buildCalendar(bundle({ reservations: [r] }), ALL, NOW));
    expect(ics).toContain('UID:res-R1@carnet-de-route');
    expect(ics).toContain('DTSTART:20261201T090000Z');
    expect(ics).toContain('DTEND:20261201T210000Z');
    expect(ics).toContain('SUMMARY:✈️ Paris CDG → Tokyo Haneda');
    expect(ics).toContain('ABC123');
    expect(ics).toContain('DTSTAMP:20261111T100000Z');
  });

  it('place un hôtel en journées entières', () => {
    const r = makeReservation({
      id: 'H1', type: 'lodging', title: 'Hôtel Sakura',
      startAt: { date: '2026-12-03', time: '15:00', timezone: 'Asia/Tokyo' },
      endAt: { date: '2026-12-05', time: '11:00', timezone: 'Asia/Tokyo' },
    });
    const ics = buildCalendar(bundle({ reservations: [r] }), ALL, NOW);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261203');
    expect(ics).toContain('DTEND;VALUE=DATE:20261205');
    expect(unfold(ics)).toContain('SUMMARY:🏨 Hôtel Sakura');
  });

  it('donne une heure par défaut à une activité sans durée', () => {
    const d = makeDay({ id: 'd1', date: '2026-12-02' });
    const s = makeStop({ id: 'S1', dayId: 'd1', title: 'Temple', startTime: '14:00', timezone: 'Asia/Tokyo' });
    const ics = buildCalendar(bundle({ days: [d], stops: [s] }), ALL, NOW);
    expect(ics).toContain('UID:stop-S1@carnet-de-route');
    expect(ics).toContain('DTSTART:20261202T050000Z');
    expect(ics).toContain('DTEND:20261202T060000Z');
  });

  it('n’inclut que les trajets de plus de 30 minutes dont le départ est connu', () => {
    const d = makeDay({ id: 'd1', date: '2026-12-02' });
    const a = makeStop({ id: 'A', dayId: 'd1', position: 0, title: 'Nara', startTime: '09:00', durationMin: 60, timezone: 'Asia/Tokyo' });
    const b = makeStop({ id: 'B', dayId: 'd1', position: 1, title: 'Kyoto', timezone: 'Asia/Tokyo' });
    const c = makeStop({ id: 'C', dayId: 'd1', position: 2, title: 'Gion', timezone: 'Asia/Tokyo' });
    const long = makeLeg(a, b, { id: 'L1', durationMin: 65 });
    const short = makeLeg(b, c, { id: 'L2', durationMin: 30 });
    const b2 = bundle({ days: [d], stops: [a, b, c], legs: [long, short] });
    const ics = unfold(buildCalendar(b2, ALL, NOW));
    expect(ics).toContain('UID:leg-L1@carnet-de-route');
    expect(ics).toContain('SUMMARY:🚗 1 h 05 vers Kyoto');
    expect(ics).toContain('DTSTART:20261202T010000Z');
    expect(ics).not.toContain('leg-L2');
    expect(buildCalendar(b2, { ...ALL, includeLegs: false }, NOW)).not.toContain('leg-');
  });

  it('inclut les échéances de checklist non cochées', () => {
    const checklist = [
      { id: 'c1', tripId: 't1', category: 'documents' as const, label: 'Faire le visa', done: false, dueDate: '2026-11-20', position: 0 },
      { id: 'c2', tripId: 't1', category: 'documents' as const, label: 'Passeport', done: true, dueDate: '2026-11-15', position: 1 },
    ];
    const ics = unfold(buildCalendar(bundle({ checklist }), ALL, NOW));
    expect(ics).toContain('UID:todo-c1@carnet-de-route');
    expect(ics).toContain('SUMMARY:À faire : Faire le visa');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261120');
    expect(ics).not.toContain('todo-c2');
    expect(buildCalendar(bundle({ checklist }), { ...ALL, includeChecklist: false }, NOW)).not.toContain('todo-');
  });

  it('garde des identifiants stables', () => {
    const r = makeReservation({ id: 'R9' });
    const uids = (s: string) => s.match(/UID:.*/g);
    expect(uids(buildCalendar(bundle({ reservations: [r] }), ALL, NOW))).toEqual(
      uids(buildCalendar(bundle({ reservations: [r] }), ALL, new Date())),
    );
  });

  it('replie les lignes longues et échappe les caractères spéciaux', () => {
    const title = 'Visite guidée du château, des jardins à la française et des écuries royales — ' + 'é'.repeat(42);
    const r = makeReservation({ id: 'R2', title, fromPlace: place('Versailles', 'Europe/Paris') });
    const ics = buildCalendar(bundle({ reservations: [r] }), ALL, NOW);
    for (const l of lines(ics)) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(unfold(ics)).toContain('SUMMARY:' + title.replace(',', '\\,'));
  });
});
