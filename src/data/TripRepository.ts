import type { CalendarOptions } from '../domain/calendar';
import type { BudgetData, BudgetLine, BudgetSettings, Expense, Traveler } from '../domain/budget/types';
import type {
  ChecklistItem, Contact, Day, Leg, Reservation, ShareLink, Stop, Trip, TripBundle,
} from '../domain/types';

export class OfflineError extends Error {
  constructor(message = 'Hors ligne — consultation seulement') {
    super(message);
    this.name = 'OfflineError';
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Introuvable') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export type New<T> = Omit<T, 'id'>;

export type BudgetErrorCode = 'TRAVELER_IN_USE' | 'LAST_TRAVELER' | 'NO_PARTICIPANT' | 'BOTH_LINKS';

export class BudgetError extends Error {
  constructor(public code: BudgetErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'BudgetError';
  }
}

export interface SharedRoadbookData {
  bundle: TripBundle;
  hideSensitive: boolean;
  ownerName: string;
  updatedAt: string;
}

export interface CalendarLink {
  tripId: string;
  token: string;
  includeLegs: boolean;
  includeChecklist: boolean;
  active: boolean;
  createdAt: string;
}

export interface TripRepository {
  listTrips(): Promise<Trip[]>;
  getBundle(tripId: string): Promise<TripBundle>;
  createTrip(t: New<Trip>): Promise<Trip>;
  updateTrip(t: Trip): Promise<Trip>;
  deleteTrip(id: string): Promise<void>;
  createDays(tripId: string, dates: string[]): Promise<Day[]>;
  deleteDays(ids: string[]): Promise<void>;
  updateDay(d: Day): Promise<Day>;
  saveStop(s: Stop | New<Stop>): Promise<Stop>;
  deleteStop(id: string): Promise<void>;
  reorderStops(dayId: string, orderedIds: string[]): Promise<void>;
  saveLeg(l: Leg | New<Leg>): Promise<Leg>;
  deleteLegs(ids: string[]): Promise<void>;
  saveReservation(r: Reservation | New<Reservation>): Promise<Reservation>;
  deleteReservation(id: string): Promise<void>;
  saveChecklistItem(i: ChecklistItem | New<ChecklistItem>): Promise<ChecklistItem>;
  deleteChecklistItem(id: string): Promise<void>;
  saveContact(c: Contact | New<Contact>): Promise<Contact>;
  deleteContact(id: string): Promise<void>;
  getShareLink(tripId: string): Promise<ShareLink | null>;
  createShareLink(tripId: string, hideSensitive: boolean): Promise<ShareLink>;
  revokeShareLink(tripId: string): Promise<void>;
  getSharedRoadbook(token: string): Promise<SharedRoadbookData | null>;
  getCalendarLink(tripId: string): Promise<CalendarLink | null>;
  createCalendarLink(tripId: string, opts: CalendarOptions): Promise<CalendarLink>;
  updateCalendarOptions(tripId: string, opts: CalendarOptions): Promise<CalendarLink>;
  revokeCalendarLink(tripId: string): Promise<void>;
  /** Nom affiché sur les roadbooks partagés (jamais l'adresse e-mail). */
  getDisplayName(): Promise<string>;
  setDisplayName(name: string): Promise<void>;
  // Budget (étape 2) : volontairement hors de TripBundle pour ne pas fuiter par le partage ni le calendrier.
  getBudget(tripId: string): Promise<BudgetData>;
  saveTraveler(t: Traveler | New<Traveler>): Promise<Traveler>;
  deleteTraveler(id: string): Promise<void>; // BudgetError TRAVELER_IN_USE / LAST_TRAVELER
  saveBudgetLine(l: BudgetLine | New<BudgetLine>): Promise<BudgetLine>;
  deleteBudgetLine(id: string): Promise<void>; // les dépenses rattachées passent hors prévu
  saveExpense(e: Expense | New<Expense>): Promise<Expense>; // BudgetError NO_PARTICIPANT / BOTH_LINKS
  deleteExpense(id: string): Promise<void>;
  updateBudgetSettings(tripId: string, s: BudgetSettings): Promise<Trip>;
}

export const DEFAULT_OWNER_NAME = 'Voyageur';
