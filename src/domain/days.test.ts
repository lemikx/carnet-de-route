import { datesBetween, diffDays, syncEndDate } from './days';
import type { Day, Stop } from './types';

const day = (date: string): Day => ({ id: 'd-' + date, tripId: 't', date, title: '', note: '' });
const stopOn = (dayId: string): Stop => ({
  id: 's1', dayId, position: 0, kind: 'activity', title: 'Musée', address: '', lat: null, lon: null,
  timezone: 'Europe/Paris', startTime: null, durationMin: null, note: '', phone: '', url: '', reservationId: null,
});

describe('datesBetween', () => {
  it('inclut les deux bornes et passe l’année', () => {
    expect(datesBetween('2026-12-30', '2027-01-02')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  });
  it('renvoie un seul jour si début = fin', () => {
    expect(datesBetween('2026-12-03', '2026-12-03')).toEqual(['2026-12-03']);
  });
});

describe('diffDays', () => {
  const existing = ['2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05'].map(day);
  it('calcule les jours à créer et à supprimer', () => {
    const r = diffDays(existing, '2026-12-03', '2026-12-07', []);
    expect(r.toCreate).toEqual(['2026-12-06', '2026-12-07']);
    expect(r.toDelete.map((d) => d.date)).toEqual(['2026-12-01', '2026-12-02']);
    expect(r.nonEmptyToDelete).toEqual([]);
  });
  it('signale les jours supprimés qui contiennent des lieux', () => {
    const r = diffDays(existing, '2026-12-03', '2026-12-07', [stopOn('d-2026-12-02')]);
    expect(r.nonEmptyToDelete.map((d) => d.date)).toEqual(['2026-12-02']);
  });
});

describe('syncEndDate', () => {
  it('remplit le retour avec le départ quand il est vide ou antérieur', () => {
    expect(syncEndDate('2026-12-20', '')).toBe('2026-12-20');
    expect(syncEndDate('2026-12-20', '2026-12-10')).toBe('2026-12-20');
  });
  it('garde un retour déjà valide', () => {
    expect(syncEndDate('2026-12-20', '2026-12-24')).toBe('2026-12-24');
    expect(syncEndDate('2026-12-20', '2026-12-20')).toBe('2026-12-20');
  });
  it('départ vide ou invalide : retour inchangé', () => {
    expect(syncEndDate('', '2026-12-24')).toBe('2026-12-24');
    expect(syncEndDate('abc', '')).toBe('');
  });
});
