import { addMinutes, coordKey, minutesBetween, toInstant } from './time';

describe('time', () => {
  it('calcule une durée entre deux fuseaux horaires', () => {
    expect(
      minutesBetween(
        { date: '2026-12-01', time: '10:00', timezone: 'Europe/Paris' },
        { date: '2026-12-02', time: '06:00', timezone: 'Asia/Tokyo' },
      ),
    ).toBe(720);
  });
  it('ajoute des minutes en passant minuit', () => {
    expect(addMinutes({ date: '2026-12-01', time: '23:30', timezone: 'Europe/Paris' }, 60)).toEqual({
      date: '2026-12-02',
      time: '00:30',
      timezone: 'Europe/Paris',
    });
  });
  it('ajoute des minutes et convertit vers un autre fuseau', () => {
    expect(addMinutes({ date: '2026-12-01', time: '10:00', timezone: 'Europe/Paris' }, 720, 'Asia/Tokyo')).toEqual({
      date: '2026-12-02',
      time: '06:00',
      timezone: 'Asia/Tokyo',
    });
  });
  it('donne un instant UTC', () => {
    expect(new Date(toInstant({ date: '2026-12-01', time: '10:00', timezone: 'Europe/Paris' })).toISOString()).toBe(
      '2026-12-01T09:00:00.000Z',
    );
  });
  it('construit une clé de coordonnées à 5 décimales', () => {
    expect(coordKey(48.856614, 2.3522219)).toBe('48.85661,2.35222');
    expect(coordKey(null, 2)).toBeNull();
  });
});
