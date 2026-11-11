import { DateTime } from 'luxon';
import type { ZonedDateTime } from './types';

function toDateTime(z: ZonedDateTime): DateTime {
  return DateTime.fromISO(`${z.date}T${z.time}`, { zone: z.timezone });
}

function fromDateTime(dt: DateTime, timezone: string): ZonedDateTime {
  const local = dt.setZone(timezone);
  return { date: local.toFormat('yyyy-MM-dd'), time: local.toFormat('HH:mm'), timezone };
}

export function toInstant(z: ZonedDateTime): number {
  return toDateTime(z).toMillis();
}

export function minutesBetween(a: ZonedDateTime, b: ZonedDateTime): number {
  return Math.round((toInstant(b) - toInstant(a)) / 60000);
}

export function addMinutes(z: ZonedDateTime, min: number, targetTz?: string): ZonedDateTime {
  return fromDateTime(toDateTime(z).plus({ minutes: min }), targetTz ?? z.timezone);
}

export function coordKey(lat: number | null, lon: number | null): string | null {
  if (lat === null || lon === null) return null;
  return `${lat.toFixed(5)},${lon.toFixed(5)}`;
}
