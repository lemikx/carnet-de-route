import type { Trip } from './types';

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Voyages dont le nom ou un pays contient la recherche (sans tenir compte des accents ni de la casse). */
export function filterTrips(trips: Trip[], query: string): Trip[] {
  const q = fold(query);
  if (!q) return trips;
  return trips.filter((t) => fold([t.name, ...t.countries].join(' ')).includes(q));
}
