import { describe, expect, it } from 'vitest';
import { assessPeriod } from './period';
import type { BestPeriod } from './types';

const KH: BestPeriod = { text: 'Novembre à février', goodMonths: [11, 12, 1, 2], avoidMonths: [3, 4] };
const a = (startDate: string, endDate: string, p: BestPeriod = KH) => assessPeriod(p, { startDate, endDate });

describe('assessPeriod', () => {
  it('bonne période', () => {
    expect(a('2026-12-20', '2026-12-24')).toMatchObject({ fit: 'good', months: [12], label: 'Tes dates tombent en bonne période.' });
  });
  it('à cheval sur deux années', () => {
    expect(a('2026-12-28', '2027-01-03')).toMatchObject({ fit: 'good', months: [12, 1] });
  });
  it('un mois à éviter l’emporte', () => {
    expect(a('2027-02-28', '2027-03-02')).toMatchObject({ fit: 'avoid', label: 'Tes dates tombent dans une période à éviter.' });
  });
  it('intermédiaire', () => {
    expect(a('2026-10-10', '2026-10-12')).toMatchObject({ fit: 'average', label: 'Période intermédiaire pour tes dates.' });
    expect(a('2026-10-30', '2026-11-02')).toMatchObject({ fit: 'average' });
  });
  it('mois à la fois bon et évité : à éviter', () => {
    expect(a('2026-05-10', '2026-05-12', { text: '', goodMonths: [5], avoidMonths: [5] })?.fit).toBe('avoid');
  });
  it('voyage de plus de 12 mois : sans boucle infinie', () => {
    const r = a('2027-01-01', '2028-03-01');
    expect(r?.fit).toBe('avoid');
    expect(r?.months).toHaveLength(12);
  });
  it('entrées invalides : null', () => {
    expect(a('', '')).toBeNull();
    expect(a('abc', '2026-12-01')).toBeNull();
    expect(a('2026-12-10', '2026-12-01')).toBeNull();
    expect(a('2026-12-10', '2026-12-11', { text: 'x', goodMonths: [], avoidMonths: [] })).toBeNull();
  });
});
