import { sortReservations } from './reservations';
import { computeDaySchedule, type DaySchedule } from './schedule';
import type { ChecklistItem, Contact, Day, Leg, Reservation, Stop, Trip, TripBundle } from './types';

export interface RoadbookDay {
  day: Day;
  stops: Stop[];
  legs: Leg[];
  schedule: DaySchedule;
  lodging: Stop | null;
  lodgingReservation: Reservation | null;
}

export interface Roadbook {
  trip: Trip;
  overview: { date: string; title: string; lodgingTitle: string | null; travelMinutes: number; distanceKm: number }[];
  days: RoadbookDay[];
  reservations: Reservation[];
  checklist: ChecklistItem[];
  contacts: Contact[];
  totals: { travelMinutes: number; distanceKm: number };
  hideSensitive: boolean;
}

export function stripSensitive(bundle: TripBundle): TripBundle {
  const linked = new Set(bundle.reservations.map((r) => r.id));
  return {
    ...bundle,
    days: bundle.days.map((d) => ({ ...d, note: '' })),
    stops: bundle.stops.map((s) => ({
      ...s,
      note: '',
      url: s.reservationId && linked.has(s.reservationId) ? '' : s.url,
    })),
    reservations: bundle.reservations.map((r) => ({
      ...r, confirmationNumber: '', price: null, currency: '', url: '', note: '',
    })),
    contacts: bundle.contacts.map((c) => ({ ...c, note: '' })),
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function buildRoadbook(
  input: TripBundle,
  opts: { hideSensitive: boolean; heavyThresholdMin?: number },
): Roadbook {
  const bundle = opts.hideSensitive ? stripSensitive(input) : input;
  const resById = new Map(bundle.reservations.map((r) => [r.id, r]));
  const days = [...bundle.days].sort((a, b) => a.date.localeCompare(b.date));

  const rbDays: RoadbookDay[] = days.map((day) => {
    const stops = bundle.stops.filter((s) => s.dayId === day.id).sort((a, b) => a.position - b.position);
    const ids = new Set(stops.map((s) => s.id));
    const legs = bundle.legs.filter((l) => ids.has(l.fromStopId));
    const lodging = [...stops].reverse().find((s) => s.kind === 'lodging') ?? null;
    return {
      day,
      stops,
      legs,
      schedule: computeDaySchedule(day, stops, bundle.legs, opts.heavyThresholdMin),
      lodging,
      lodgingReservation: lodging?.reservationId ? (resById.get(lodging.reservationId) ?? null) : null,
    };
  });

  const overview = rbDays.map((d) => ({
    date: d.day.date,
    title: d.day.title,
    lodgingTitle: d.lodging?.title ?? null,
    travelMinutes: d.legs.reduce((s, l) => s + (l.durationMin ?? 0), 0),
    distanceKm: round1(d.legs.reduce((s, l) => s + (l.distanceKm ?? 0), 0)),
  }));

  return {
    trip: bundle.trip,
    overview,
    days: rbDays,
    reservations: sortReservations(bundle.reservations),
    checklist: [...bundle.checklist].sort((a, b) => a.position - b.position),
    contacts: bundle.contacts,
    totals: {
      travelMinutes: overview.reduce((s, o) => s + o.travelMinutes, 0),
      distanceKm: round1(overview.reduce((s, o) => s + o.distanceKm, 0)),
    },
    hideSensitive: opts.hideSensitive,
  };
}
