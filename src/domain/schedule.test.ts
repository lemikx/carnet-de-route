import { computeDaySchedule } from './schedule';
import { makeDay, makeLeg, makeStop } from '../test/factories';

const day = makeDay({ id: 'd1', date: '2026-12-01' });
const P = 'Europe/Paris';

describe('computeDaySchedule', () => {
  it('conflit simple', () => {
    const a = makeStop({ startTime: '13:00', durationMin: 60, timezone: P });
    const b = makeStop({ startTime: '14:00', timezone: P, position: 1 });
    const s = computeDaySchedule(day, [a, b], [makeLeg(a, b, { durationMin: 80 })]);
    expect(s.timings[1].estimatedArrival?.time).toBe('15:20');
    expect(s.timings[1].conflictMinutes).toBe(80);
  });

  it('pas de conflit', () => {
    const a = makeStop({ startTime: '09:00', durationMin: 60, timezone: P });
    const b = makeStop({ startTime: '11:00', timezone: P, position: 1 });
    const s = computeDaySchedule(day, [a, b], [makeLeg(a, b, { durationMin: 30 })]);
    expect(s.timings[1].conflictMinutes).toBe(0);
  });

  it('chaîne sans heure', () => {
    const a = makeStop({ startTime: '09:00', durationMin: 60, timezone: P });
    const b = makeStop({ durationMin: 120, timezone: P, position: 1 });
    const c = makeStop({ startTime: '12:30', timezone: P, position: 2 });
    const s = computeDaySchedule(day, [a, b, c], [makeLeg(a, b, { durationMin: 30 }), makeLeg(b, c, { durationMin: 15 })]);
    expect(s.timings[2].estimatedArrival?.time).toBe('12:45');
    expect(s.timings[2].conflictMinutes).toBe(15);
  });

  it('trajet inconnu', () => {
    const a = makeStop({ startTime: '09:00', durationMin: 60, timezone: P });
    const b = makeStop({ startTime: '10:00', timezone: P, position: 1 });
    const s = computeDaySchedule(day, [a, b], [makeLeg(a, b)]);
    expect(s.timings[1].estimatedArrival).toBeNull();
    expect(s.timings[1].conflictMinutes).toBe(0);
    expect(s.unknownLegs).toBe(1);
  });

  it('fuseaux horaires (vol Paris → Tokyo)', () => {
    const a = makeStop({ startTime: '10:00', durationMin: 0, timezone: P, title: 'CDG' });
    const b = makeStop({ timezone: 'Asia/Tokyo', title: 'Haneda', position: 1 });
    const s = computeDaySchedule(day, [a, b], [makeLeg(a, b, { mode: 'plane', durationMin: 720, source: 'reservation' })]);
    expect(s.timings[1].estimatedArrival).toEqual({ date: '2026-12-02', time: '06:00', timezone: 'Asia/Tokyo' });
    expect(s.timings[1].conflictMinutes).toBe(0);
  });

  it('journée chargée', () => {
    const a = makeStop({ timezone: P });
    const b = makeStop({ timezone: P, position: 1 });
    const c = makeStop({ timezone: P, position: 2 });
    const legs = [makeLeg(a, b, { durationMin: 200, distanceKm: 150 }), makeLeg(b, c, { durationMin: 120, distanceKm: 100 })];
    const s = computeDaySchedule(day, [a, b, c], legs);
    expect(s.travelMinutes).toBe(320);
    expect(s.distanceKm).toBe(250);
    expect(s.heavy).toBe(true);
    expect(computeDaySchedule(day, [a, b, c], legs, 400).heavy).toBe(false);
  });

  it('journée vide', () => {
    expect(computeDaySchedule(day, [], [])).toEqual({ timings: [], travelMinutes: 0, distanceKm: 0, heavy: false, unknownLegs: 0 });
  });
});
