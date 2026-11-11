import { DateTime } from 'npm:luxon@3.5.0';

export function formatDate(iso: string): string {
  return DateTime.fromISO(iso).toFormat('dd/MM/yyyy');
}

export function formatDuration(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} h` : `${h} h ${String(r).padStart(2, '0')}`;
}

export function formatDistance(km: number): string {
  return `${km.toFixed(1).replace('.', ',')} km`;
}

export function formatDayLabel(iso: string): string {
  return DateTime.fromISO(iso).setLocale('fr').toFormat('cccc d LLLL');
}
