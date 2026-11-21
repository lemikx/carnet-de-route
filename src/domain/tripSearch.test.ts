import { filterTrips } from './tripSearch';
import type { Trip } from './types';

const t = (name: string, countries: string[]): Trip => ({
  id: name, name, countries, startDate: '2026-12-01', endDate: '2026-12-05', localCurrency: '', homeTimezone: 'Europe/Paris', updatedAt: '',
} as Trip);
const trips = [t('Été à Zürich', ['Suisse']), t('Japon en famille', ['Japon']), t('Road trip', ['Islande', 'Norvège'])];

describe('filterTrips', () => {
  it('renvoie tout si la recherche est vide', () => {
    expect(filterTrips(trips, '  ')).toHaveLength(3);
  });
  it('ignore accents et casse sur le nom', () => {
    expect(filterTrips(trips, 'ETE a zurich').map((x) => x.name)).toEqual(['Été à Zürich']);
  });
  it('cherche aussi dans les pays', () => {
    expect(filterTrips(trips, 'norvege').map((x) => x.name)).toEqual(['Road trip']);
  });
  it('renvoie une liste vide sans correspondance', () => {
    expect(filterTrips(trips, 'Pérou')).toEqual([]);
  });
});
