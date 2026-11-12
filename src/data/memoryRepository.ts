import type { AiDraft } from '../ai/types';
import { omitBudget } from '../domain/budget/types';
import type { BudgetLine, Expense, Traveler } from '../domain/budget/types';
import { stripSensitive } from '../domain/roadbook';
import type {
  ChecklistItem, Contact, Day, Leg, Reservation, ShareLink, Stop, Trip, TripBundle,
} from '../domain/types';
import { BudgetError, DEFAULT_OWNER_NAME, NotFoundError, type CalendarLink, type New, type TripRepository } from './TripRepository';

interface Store {
  trips: Trip[];
  days: Day[];
  stops: Stop[];
  legs: Leg[];
  reservations: Reservation[];
  checklist: ChecklistItem[];
  contacts: Contact[];
  shareLinks: ShareLink[];
  calendarLinks: CalendarLink[];
  displayName?: string;
  travelers: Traveler[];
  budgetLines: BudgetLine[];
  expenses: Expense[];
  drafts: AiDraft[];
}

export interface KeyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'carnet-de-route:memory';

export function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const clone = <T>(v: T): T => structuredClone(v);

function emptyStore(): Store {
  return { trips: [], days: [], stops: [], legs: [], reservations: [], checklist: [], contacts: [], shareLinks: [], calendarLinks: [], travelers: [], budgetLines: [], expenses: [], drafts: [] };
}

export function createMemoryRepository(opts: { seed?: TripBundle[]; storage?: KeyStorage } = {}): TripRepository {
  let store: Store = emptyStore();
  try {
    const raw = opts.storage?.getItem(STORAGE_KEY);
    if (raw) store = { ...emptyStore(), ...JSON.parse(raw) };
  } catch {
    store = emptyStore();
  }
  for (const b of opts.seed ?? []) {
    store.trips.push(b.trip);
    store.days.push(...b.days);
    store.stops.push(...b.stops);
    store.legs.push(...b.legs);
    store.reservations.push(...b.reservations);
    store.checklist.push(...b.checklist);
    store.contacts.push(...b.contacts);
  }

  const persist = () => {
    try {
      opts.storage?.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      /* stockage indisponible : on reste en mémoire */
    }
  };

  function upsert<T extends { id: string }>(list: T[], item: T | New<T>): T {
    if ('id' in item && item.id) {
      const i = list.findIndex((x) => x.id === item.id);
      if (i >= 0) {
        list[i] = clone(item as T);
        return clone(list[i]);
      }
    }
    const created = { ...clone(item), id: uid() } as T;
    list.push(created);
    return clone(created);
  }

  function touch(tripId: string) {
    const t = store.trips.find((x) => x.id === tripId);
    if (t) t.updatedAt = now();
  }
  const tripOfDay = (dayId: string) => store.days.find((d) => d.id === dayId)?.tripId;
  const tripOfStop = (stopId: string) => {
    const s = store.stops.find((x) => x.id === stopId);
    return s ? tripOfDay(s.dayId) : undefined;
  };

  function removeStops(ids: Set<string>) {
    store.stops = store.stops.filter((s) => !ids.has(s.id));
    store.legs = store.legs.filter((l) => !ids.has(l.fromStopId) && !ids.has(l.toStopId));
  }

  function bundleOf(tripId: string): TripBundle {
    const trip = store.trips.find((t) => t.id === tripId);
    if (!trip) throw new NotFoundError('Voyage introuvable');
    const days = store.days.filter((d) => d.tripId === tripId);
    const dayIds = new Set(days.map((d) => d.id));
    const stops = store.stops.filter((s) => dayIds.has(s.dayId));
    const stopIds = new Set(stops.map((s) => s.id));
    return clone({
      trip,
      days,
      stops,
      legs: store.legs.filter((l) => stopIds.has(l.fromStopId)),
      reservations: store.reservations.filter((r) => r.tripId === tripId),
      checklist: store.checklist.filter((c) => c.tripId === tripId),
      contacts: store.contacts.filter((c) => c.tripId === tripId),
    });
  }

  const done = <T>(v: T): Promise<T> => {
    persist();
    return Promise.resolve(v);
  };

  return {
    async listTrips() {
      return clone([...store.trips].sort((a, b) => a.startDate.localeCompare(b.startDate)));
    },
    async getBundle(tripId) {
      return bundleOf(tripId);
    },
    async createTrip(t) {
      return done(upsert(store.trips, { ...t, updatedAt: now() }));
    },
    async updateTrip(t) {
      if (!store.trips.some((x) => x.id === t.id)) throw new NotFoundError('Voyage introuvable');
      return done(upsert(store.trips, { ...t, updatedAt: now() }));
    },
    async deleteTrip(id) {
      const dayIds = new Set(store.days.filter((d) => d.tripId === id).map((d) => d.id));
      removeStops(new Set(store.stops.filter((s) => dayIds.has(s.dayId)).map((s) => s.id)));
      store.trips = store.trips.filter((t) => t.id !== id);
      store.days = store.days.filter((d) => d.tripId !== id);
      store.reservations = store.reservations.filter((r) => r.tripId !== id);
      store.checklist = store.checklist.filter((c) => c.tripId !== id);
      store.contacts = store.contacts.filter((c) => c.tripId !== id);
      store.shareLinks = store.shareLinks.filter((l) => l.tripId !== id);
      store.calendarLinks = store.calendarLinks.filter((l) => l.tripId !== id);
      store.travelers = store.travelers.filter((x) => x.tripId !== id);
      store.budgetLines = store.budgetLines.filter((x) => x.tripId !== id);
      store.expenses = store.expenses.filter((x) => x.tripId !== id);
      store.drafts.forEach((d) => { if (d.tripId === id) d.tripId = null; });
      return done(undefined);
    },
    async createDays(tripId, dates) {
      const created = dates.map((date) => upsert(store.days, { tripId, date, title: '', note: '' }));
      touch(tripId);
      return done(created);
    },
    async deleteDays(ids) {
      const set = new Set(ids);
      const tripIds = new Set(store.days.filter((d) => set.has(d.id)).map((d) => d.tripId));
      removeStops(new Set(store.stops.filter((s) => set.has(s.dayId)).map((s) => s.id)));
      store.days = store.days.filter((d) => !set.has(d.id));
      tripIds.forEach(touch);
      return done(undefined);
    },
    async updateDay(d) {
      const saved = upsert(store.days, d);
      touch(d.tripId);
      return done(saved);
    },
    async saveStop(s) {
      const saved = upsert(store.stops, s);
      const t = tripOfDay(saved.dayId);
      if (t) touch(t);
      return done(saved);
    },
    async deleteStop(id) {
      const t = tripOfStop(id);
      removeStops(new Set([id]));
      if (t) touch(t);
      return done(undefined);
    },
    async reorderStops(dayId, orderedIds) {
      orderedIds.forEach((id, position) => {
        const s = store.stops.find((x) => x.id === id);
        if (s) {
          s.dayId = dayId;
          s.position = position;
        }
      });
      const t = tripOfDay(dayId);
      if (t) touch(t);
      return done(undefined);
    },
    async saveLeg(l) {
      return done(upsert(store.legs, l));
    },
    async deleteLegs(ids) {
      const set = new Set(ids);
      store.legs = store.legs.filter((l) => !set.has(l.id));
      return done(undefined);
    },
    async saveReservation(r) {
      const saved = upsert(store.reservations, r);
      touch(saved.tripId);
      return done(saved);
    },
    async deleteReservation(id) {
      const r = store.reservations.find((x) => x.id === id);
      removeStops(new Set(store.stops.filter((s) => s.reservationId === id).map((s) => s.id)));
      store.reservations = store.reservations.filter((x) => x.id !== id);
      store.expenses.forEach((e) => {
        if (e.reservationId === id) e.reservationId = null;
      });
      if (r) touch(r.tripId);
      return done(undefined);
    },
    async saveChecklistItem(i) {
      const saved = upsert(store.checklist, i);
      touch(saved.tripId);
      return done(saved);
    },
    async deleteChecklistItem(id) {
      store.checklist = store.checklist.filter((c) => c.id !== id);
      return done(undefined);
    },
    async saveContact(c) {
      const saved = upsert(store.contacts, c);
      touch(saved.tripId);
      return done(saved);
    },
    async deleteContact(id) {
      store.contacts = store.contacts.filter((c) => c.id !== id);
      return done(undefined);
    },
    async getShareLink(tripId) {
      return clone(store.shareLinks.find((l) => l.tripId === tripId && l.active) ?? null);
    },
    async createShareLink(tripId, hideSensitive) {
      store.shareLinks.forEach((l) => {
        if (l.tripId === tripId) l.active = false;
      });
      const link: ShareLink = { tripId, token: randomToken(), hideSensitive, active: true, createdAt: now() };
      store.shareLinks.push(link);
      return done(clone(link));
    },
    async revokeShareLink(tripId) {
      store.shareLinks.forEach((l) => {
        if (l.tripId === tripId) l.active = false;
      });
      return done(undefined);
    },
    async getSharedRoadbook(token) {
      const link = store.shareLinks.find((l) => l.token === token && l.active);
      if (!link || !store.trips.some((t) => t.id === link.tripId)) return null;
      const bundle = bundleOf(link.tripId);
      return {
        bundle: link.hideSensitive ? stripSensitive(bundle) : { ...bundle, trip: omitBudget(bundle.trip) },
        hideSensitive: link.hideSensitive,
        ownerName: store.displayName?.trim() || DEFAULT_OWNER_NAME,
        updatedAt: bundle.trip.updatedAt,
      };
    },
    async getCalendarLink(tripId) {
      return clone(store.calendarLinks.find((l) => l.tripId === tripId && l.active) ?? null);
    },
    async createCalendarLink(tripId, o) {
      store.calendarLinks.forEach((l) => {
        if (l.tripId === tripId) l.active = false;
      });
      const link: CalendarLink = { tripId, token: randomToken(), ...o, active: true, createdAt: now() };
      store.calendarLinks.push(link);
      return done(clone(link));
    },
    async updateCalendarOptions(tripId, o) {
      const link = store.calendarLinks.find((l) => l.tripId === tripId && l.active);
      if (!link) throw new NotFoundError('Aucun abonnement actif');
      Object.assign(link, o);
      return done(clone(link));
    },
    async revokeCalendarLink(tripId) {
      store.calendarLinks.forEach((l) => {
        if (l.tripId === tripId) l.active = false;
      });
      return done(undefined);
    },
    async getBudget(tripId) {
      if (!store.trips.some((t) => t.id === tripId)) throw new NotFoundError('Voyage introuvable');
      return clone({
        travelers: store.travelers.filter((x) => x.tripId === tripId).sort((a, b) => a.position - b.position),
        lines: store.budgetLines.filter((x) => x.tripId === tripId).sort((a, b) => a.position - b.position),
        expenses: store.expenses.filter((x) => x.tripId === tripId),
      });
    },
    async saveTraveler(t) {
      return done(upsert(store.travelers, t));
    },
    async deleteTraveler(id) {
      const t = store.travelers.find((x) => x.id === id);
      if (!t) return done(undefined);
      if (store.travelers.filter((x) => x.tripId === t.tripId).length <= 1) throw new BudgetError('LAST_TRAVELER');
      if (store.expenses.some((e) => e.paidBy === id || e.participantIds.includes(id))) throw new BudgetError('TRAVELER_IN_USE');
      store.travelers = store.travelers.filter((x) => x.id !== id);
      return done(undefined);
    },
    async saveBudgetLine(l) {
      return done(upsert(store.budgetLines, l));
    },
    async deleteBudgetLine(id) {
      store.budgetLines = store.budgetLines.filter((x) => x.id !== id);
      store.expenses.forEach((e) => {
        if (e.lineId === id) e.lineId = null;
      });
      return done(undefined);
    },
    async saveExpense(e) {
      if (e.participantIds.length === 0) throw new BudgetError('NO_PARTICIPANT');
      if (e.lineId && e.reservationId) throw new BudgetError('BOTH_LINKS');
      return done(upsert(store.expenses, e));
    },
    async deleteExpense(id) {
      store.expenses = store.expenses.filter((x) => x.id !== id);
      return done(undefined);
    },
    async updateBudgetSettings(tripId, s) {
      const trip = store.trips.find((t) => t.id === tripId);
      if (!trip) throw new NotFoundError('Voyage introuvable');
      trip.budgetCap = s.cap;
      trip.budgetCapMode = s.capMode;
      trip.fxMarginPct = s.fxMarginPct;
      return done(clone(trip));
    },
    async listDrafts() {
      return clone([...store.drafts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    },
    async getDraft(id) {
      const d = store.drafts.find((x) => x.id === id);
      if (!d) throw new NotFoundError('Brouillon introuvable');
      return clone(d);
    },
    async saveDraft(d) {
      return done(upsert<AiDraft>(store.drafts, { ...d, updatedAt: now() } as AiDraft));
    },
    async deleteDraft(id) {
      store.drafts = store.drafts.filter((x) => x.id !== id);
      return done(undefined);
    },
    async getDisplayName() {
      return store.displayName ?? '';
    },
    async setDisplayName(name) {
      store.displayName = name.trim().slice(0, 60);
      return done(undefined);
    },
  };
}
