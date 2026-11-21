import { DateTime } from 'luxon';
import type { Day, Stop } from './types';

export function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  let d = DateTime.fromISO(start, { zone: 'utc' });
  const last = DateTime.fromISO(end, { zone: 'utc' });
  while (d <= last) {
    out.push(d.toFormat('yyyy-MM-dd'));
    d = d.plus({ days: 1 });
  }
  return out;
}

export function diffDays(
  existing: Day[],
  start: string,
  end: string,
  stops: Stop[],
): { toCreate: string[]; toDelete: Day[]; nonEmptyToDelete: Day[] } {
  const wanted = new Set(datesBetween(start, end));
  const have = new Set(existing.map((d) => d.date));
  const toCreate = [...wanted].filter((d) => !have.has(d));
  const toDelete = existing.filter((d) => !wanted.has(d.date)).sort((a, b) => a.date.localeCompare(b.date));
  const usedDays = new Set(stops.map((s) => s.dayId));
  return { toCreate, toDelete, nonEmptyToDelete: toDelete.filter((d) => usedDays.has(d.id)) };
}

/** Quand on choisit le départ, le retour reprend la même date s'il est vide ou antérieur ; un retour valide n'est jamais écrasé. */
export function syncEndDate(start: string, end: string): string {
  if (!DateTime.fromISO(start, { zone: 'utc' }).isValid) return end;
  if (end === '' || end < start) return start;
  return end;
}
