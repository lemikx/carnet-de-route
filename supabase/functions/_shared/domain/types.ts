export type TravelMode = 'car' | 'walk' | 'bike' | 'train' | 'bus' | 'plane' | 'ferry' | 'other';
export const AUTO_MODES: TravelMode[] = ['car', 'walk', 'bike'];

export interface ZonedDateTime {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  timezone: string; // IANA
}

export interface PlaceRef {
  title: string;
  address: string;
  lat: number | null;
  lon: number | null;
  timezone: string;
}

export interface Trip {
  id: string;
  name: string;
  countries: string[];
  startDate: string;
  endDate: string;
  localCurrency: string;
  homeTimezone: string;
  updatedAt: string;
}

export interface Day {
  id: string;
  tripId: string;
  date: string;
  title: string;
  note: string;
}

export type StopKind = 'activity' | 'lodging' | 'point';

export interface Stop {
  id: string;
  dayId: string;
  position: number;
  kind: StopKind;
  title: string;
  address: string;
  lat: number | null;
  lon: number | null;
  timezone: string;
  startTime: string | null;
  durationMin: number | null;
  note: string;
  phone: string;
  url: string;
  reservationId: string | null;
}

export type LegSource = 'auto' | 'manual' | 'reservation';

export interface Leg {
  id: string;
  fromStopId: string;
  toStopId: string;
  mode: TravelMode;
  durationMin: number | null;
  distanceKm: number | null;
  geometry: [number, number][] | null;
  source: LegSource;
  error: string | null;
  computedAt: string | null;
  fromKey: string | null;
  toKey: string | null;
}

export type ReservationType = 'flight' | 'lodging' | 'car_rental' | 'train' | 'activity' | 'other';

export interface Reservation {
  id: string;
  tripId: string;
  type: ReservationType;
  title: string;
  startAt: ZonedDateTime;
  endAt: ZonedDateTime | null;
  fromPlace: PlaceRef | null;
  toPlace: PlaceRef | null;
  confirmationNumber: string;
  price: number | null;
  currency: string;
  url: string;
  phone: string;
  note: string;
}

export type ChecklistCategory = 'documents' | 'health' | 'luggage' | 'before_departure';

export interface ChecklistItem {
  id: string;
  tripId: string;
  category: ChecklistCategory;
  label: string;
  done: boolean;
  dueDate: string | null;
  position: number;
}

export type ContactKind = 'embassy' | 'emergency' | 'lodging' | 'other';

export interface Contact {
  id: string;
  tripId: string;
  name: string;
  kind: ContactKind;
  phone: string;
  address: string;
  note: string;
}

export interface ShareLink {
  tripId: string;
  token: string;
  hideSensitive: boolean;
  active: boolean;
  createdAt: string;
}

export interface TripBundle {
  trip: Trip;
  days: Day[];
  stops: Stop[];
  legs: Leg[];
  reservations: Reservation[];
  checklist: ChecklistItem[];
  contacts: Contact[];
}
