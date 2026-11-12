import { describe, expect, it } from 'vitest';
import type { VisaInfo } from './types';
import { assessVisa } from './visa';

const v = (o: Partial<VisaInfo> = {}): VisaInfo => ({ required: true, type: 'e-visa', processingDaysMin: 1, processingDaysMax: 20, officialUrl: null, notes: '', ...o });
const input = { departureDate: '2026-12-20', today: '2026-11-12' };

describe('assessVisa', () => {
  it('vert / orange / rouge avec échéance', () => {
    const g = assessVisa(v({ processingDaysMax: 20 }), input);
    expect(g).toMatchObject({ level: 'green', deadline: '2026-11-23', overdue: false, remainingDays: 38 });
    expect(assessVisa(v({ processingDaysMax: 30 }), input)).toMatchObject({ level: 'orange', deadline: '2026-11-13', overdue: false });
    const r = assessVisa(v({ processingDaysMax: 45 }), input);
    expect(r).toMatchObject({ level: 'red', deadline: '2026-10-29', overdue: true });
    expect(r.reason).toBe('Délai de traitement jusqu\'à 45 jours, mais il ne reste que 38 jours avant le départ.');
  });
  it('limites', () => {
    const lv = (n: number) => assessVisa(v({ processingDaysMax: n }), input).level;
    expect([lv(24), lv(25), lv(38), lv(39)]).toEqual(['green', 'orange', 'orange', 'red']);
  });
  it('non requis, inconnu, délai absent', () => {
    expect(assessVisa(v({ required: false }), input)).toMatchObject({ level: 'green', deadline: null });
    expect(assessVisa(v({ required: 'unknown' }), input).level).toBe('grey');
    expect(assessVisa(v({ processingDaysMax: null }), input)).toMatchObject({ level: 'grey', deadline: null });
  });
  it('départ aujourd’hui ou passé', () => {
    for (const d of ['2026-11-12', '2026-10-01']) {
      const a = assessVisa(v(), { departureDate: d, today: '2026-11-12' });
      expect(a.level).toBe('red');
      expect(Number.isNaN(a.remainingDays)).toBe(false);
      expect(assessVisa(v({ required: false }), { departureDate: d, today: '2026-11-12' }).level).toBe('green');
    }
  });
  it('marge personnalisée', () => {
    expect(assessVisa(v({ processingDaysMax: 38 }), { ...input, marginDays: 0 }).level).toBe('green');
  });
  it('date de départ invalide : pas de crash', () => {
    const a = assessVisa(v(), { departureDate: 'n’importe quoi', today: '2026-11-12' });
    expect(a.level).toBe('grey');
  });
});
