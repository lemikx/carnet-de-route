import { DateTime } from 'npm:luxon@3.5.0';
import { formatDuration } from './format.ts';
import { orderedStops } from './legs.ts';
import { computeDaySchedule } from './schedule.ts';
import { addMinutes, toInstant } from './time.ts';
import type { Reservation, TravelMode, TripBundle, ZonedDateTime } from './types.ts';

export interface CalendarOptions {
  includeLegs: boolean;
  includeChecklist: boolean;
}

export const LEG_MIN_MINUTES = 30;
export const DEFAULT_ACTIVITY_MINUTES = 60;

const MODE_ICON: Record<TravelMode, string> = {
  car: '🚗', walk: '🚶', bike: '🚲', train: '🚆', bus: '🚌', plane: '✈️', ferry: '⛴️', other: '➡️',
};

export function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Replie une ligne à 75 octets UTF-8 sans couper un caractère. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (size + n > 75) {
      out.push(current);
      current = ' ' + ch;
      size = 1 + n;
    } else {
      current += ch;
      size += n;
    }
  }
  out.push(current);
  return out.join('\r\n');
}

const utc = (ms: number) => DateTime.fromMillis(ms, { zone: 'utc' }).toFormat("yyyyMMdd'T'HHmmss'Z'");
const zoned = (z: ZonedDateTime) => utc(toInstant(z));
const dateOnly = (iso: string) => iso.replace(/-/g, '');
const nextDay = (iso: string) => DateTime.fromISO(iso, { zone: 'utc' }).plus({ days: 1 }).toFormat('yyyy-MM-dd');

interface Event {
  uid: string;
  summary: string;
  start: string; // ligne DTSTART complète (sans le nom)
  end: string;
  location?: string;
  description?: string;
}

function describe(parts: (string | null | undefined | false)[]): string {
  return parts.filter(Boolean).join('\n');
}

function reservationEvent(r: Reservation): Event {
  const location = (r.fromPlace ?? r.toPlace)?.address;
  const description = describe([
    r.fromPlace?.address && `Départ : ${r.fromPlace.address}`,
    r.toPlace?.address && `Arrivée : ${r.toPlace.address}`,
    r.phone && `Téléphone : ${r.phone}`,
    r.confirmationNumber && `Réservation : ${r.confirmationNumber}`,
    r.url,
    r.note,
  ]);
  const base = { uid: `res-${r.id}`, location, description };
  if (r.type === 'lodging') {
    const end = r.endAt && r.endAt.date > r.startAt.date ? r.endAt.date : nextDay(r.startAt.date);
    return { ...base, summary: `🏨 ${r.title}`, start: `;VALUE=DATE:${dateOnly(r.startAt.date)}`, end: `;VALUE=DATE:${dateOnly(end)}` };
  }
  const end = r.endAt ?? addMinutes(r.startAt, DEFAULT_ACTIVITY_MINUTES);
  let summary = r.title;
  if (r.type === 'flight' || r.type === 'train') {
    const icon = r.type === 'flight' ? '✈️' : '🚆';
    summary = `${icon} ${r.fromPlace?.title ?? r.title} → ${r.toPlace?.title ?? r.title}`;
  }
  return { ...base, summary, start: `:${zoned(r.startAt)}`, end: `:${zoned(end)}` };
}

export function buildCalendar(bundle: TripBundle, opts: CalendarOptions, now: Date = new Date()): string {
  const events: Event[] = bundle.reservations.map(reservationEvent);
  const dayById = new Map(bundle.days.map((d) => [d.id, d]));
  const stopById = new Map(bundle.stops.map((s) => [s.id, s]));

  for (const s of orderedStops(bundle.days, bundle.stops)) {
    if (s.reservationId || !s.startTime) continue;
    const start: ZonedDateTime = { date: dayById.get(s.dayId)!.date, time: s.startTime, timezone: s.timezone };
    events.push({
      uid: `stop-${s.id}`,
      summary: s.title,
      start: `:${zoned(start)}`,
      end: `:${zoned(addMinutes(start, s.durationMin ?? DEFAULT_ACTIVITY_MINUTES))}`,
      location: s.address || undefined,
      description: describe([s.phone && `Téléphone : ${s.phone}`, s.url, s.note]),
    });
  }

  if (opts.includeLegs) {
    for (const day of bundle.days) {
      const stops = bundle.stops.filter((s) => s.dayId === day.id).sort((a, b) => a.position - b.position);
      const timings = new Map(computeDaySchedule(day, stops, bundle.legs).timings.map((t) => [t.stopId, t]));
      for (const leg of bundle.legs) {
        const from = stopById.get(leg.fromStopId);
        const to = stopById.get(leg.toStopId);
        if (!from || !to || from.dayId !== day.id) continue;
        if (leg.source === 'reservation' || leg.durationMin === null || leg.durationMin <= LEG_MIN_MINUTES) continue;
        const t = timings.get(from.id);
        const ref = t?.plannedStart ?? t?.estimatedArrival;
        if (!ref) continue;
        const departure = addMinutes(ref, from.durationMin ?? 0);
        events.push({
          uid: `leg-${leg.id}`,
          summary: `${MODE_ICON[leg.mode]} ${formatDuration(leg.durationMin)} vers ${to.title}`,
          start: `:${zoned(departure)}`,
          end: `:${zoned(addMinutes(departure, leg.durationMin))}`,
          location: from.address || undefined,
          description: describe([to.address && `Destination : ${to.address}`]),
        });
      }
    }
  }

  if (opts.includeChecklist) {
    for (const item of bundle.checklist) {
      if (item.done || !item.dueDate) continue;
      events.push({
        uid: `todo-${item.id}`,
        summary: `À faire : ${item.label}`,
        start: `;VALUE=DATE:${dateOnly(item.dueDate)}`,
        end: `;VALUE=DATE:${dateOnly(nextDay(item.dueDate))}`,
      });
    }
  }

  const stamp = utc(now.getTime());
  const out = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Carnet de route//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(`${bundle.trip.name} — Carnet de route`)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  for (const e of events) {
    out.push('BEGIN:VEVENT', `UID:${e.uid}@carnet-de-route`, `DTSTAMP:${stamp}`, `DTSTART${e.start}`, `DTEND${e.end}`);
    out.push(`SUMMARY:${escapeText(e.summary)}`);
    if (e.location) out.push(`LOCATION:${escapeText(e.location)}`);
    if (e.description) out.push(`DESCRIPTION:${escapeText(e.description)}`);
    out.push('END:VEVENT');
  }
  out.push('END:VCALENDAR');
  return out.map(foldLine).join('\r\n') + '\r\n';
}
