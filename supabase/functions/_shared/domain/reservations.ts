import { minutesBetween, toInstant } from './time.ts';
import type { PlaceRef, Reservation, Stop, StopKind, TravelMode, ZonedDateTime } from './types.ts';

export type ReservationStopDraft = Omit<Stop, 'id' | 'dayId' | 'position'> & { date: string };

export interface ReservationStops {
  stops: ReservationStopDraft[];
  leg: { mode: TravelMode; durationMin: number } | null;
}

export function sortReservations(r: Reservation[]): Reservation[] {
  return [...r].sort((a, b) => toInstant(a.startAt) - toInstant(b.startAt));
}

function draft(
  r: Reservation,
  place: PlaceRef | null,
  at: ZonedDateTime,
  kind: StopKind,
  title: string,
): ReservationStopDraft {
  return {
    date: at.date,
    kind,
    title,
    address: place?.address ?? '',
    lat: place?.lat ?? null,
    lon: place?.lon ?? null,
    timezone: place?.timezone ?? at.timezone,
    startTime: at.time,
    durationMin: null,
    note: '',
    phone: r.phone,
    url: r.url,
    reservationId: r.id,
  };
}

export function reservationToStops(r: Reservation): ReservationStops {
  if ((r.type === 'flight' || r.type === 'train') && r.endAt) {
    const from = r.fromPlace?.title ?? r.title;
    const to = r.toPlace?.title ?? r.title;
    return {
      stops: [
        draft(r, r.fromPlace, r.startAt, 'point', `Départ : ${from}`),
        draft(r, r.toPlace, r.endAt, 'point', `Arrivée : ${to}`),
      ],
      leg: { mode: r.type === 'flight' ? 'plane' : 'train', durationMin: minutesBetween(r.startAt, r.endAt) },
    };
  }
  if (r.type === 'lodging') {
    return { stops: [draft(r, r.toPlace ?? r.fromPlace, r.startAt, 'lodging', r.title)], leg: null };
  }
  return { stops: [draft(r, r.fromPlace ?? r.toPlace, r.startAt, 'activity', r.title)], leg: null };
}
