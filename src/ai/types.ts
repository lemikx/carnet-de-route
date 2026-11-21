import type { BudgetCategory, LineMode } from '../domain/budget/types';
import type { ChecklistCategory, StopKind } from '../domain/types';

export const PROTOCOL_VERSION = 1 as const;

export interface VisaInfo {
  required: boolean | 'unknown';
  type: string;
  processingDaysMin: number | null;
  processingDaysMax: number | null;
  officialUrl: string | null;
  notes: string;
}

export interface BestPeriod {
  text: string;
  goodMonths: number[];
  avoidMonths: number[];
}

export interface Idea {
  id: string;
  destination: string;
  country: string;
  summary: string;
  durationDays: number;
  highlights: string[];
  budgetPerPersonEur: number | null;
  whyItMatches: string;
  visa: VisaInfo;
  bestPeriod: BestPeriod | null;
}

export interface IdeasResponse {
  v: 1;
  kind: 'ideas';
  ideas: Idea[];
}

export interface ItineraryPlace {
  name: string;
  city: string;
  country: string;
}

export interface ItineraryStop {
  title: string;
  kind: StopKind;
  place: ItineraryPlace;
  startTime: string | null;
  durationMin: number | null;
  note: string;
}

export interface ItineraryDay {
  day: number;
  title: string;
  note: string;
  stops: ItineraryStop[];
}

export interface ItineraryChecklistItem {
  category: ChecklistCategory;
  label: string;
  daysBeforeDeparture: number | null;
}

export interface ItineraryBudgetLine {
  category: BudgetCategory;
  label: string;
  amount: number;
  currency: string;
  mode: LineMode;
}

export interface ItineraryResponse {
  v: 1;
  kind: 'itinerary';
  trip: { name: string; countries: string[]; currency: string; visa: VisaInfo; bestPeriod: BestPeriod | null };
  days: ItineraryDay[];
  checklist: ItineraryChecklistItem[];
  budget: ItineraryBudgetLine[];
}

export type Pace = 'calm' | 'balanced' | 'intense';

export interface BriefTraveler {
  name: string;
  nationality: string;
}

export interface Brief {
  destination: string | null;
  startDate: string;
  endDate: string;
  departureCity: string | null;
  adults: number;
  children: number;
  travelers: BriefTraveler[];
  budgetPerPersonEur: number | null;
  travelerTypes: string[];
  tripTypes: string[];
  wishes: string[];
  lodging: string[];
  pace: Pace | null;
  constraints: string;
}

export type DraftStage =
  | 'brief' | 'ideas_requested' | 'ideas_received' | 'idea_chosen'
  | 'itinerary_requested' | 'itinerary_received' | 'created';
export const DRAFT_STAGES: DraftStage[] = [
  'brief', 'ideas_requested', 'ideas_received', 'idea_chosen', 'itinerary_requested', 'itinerary_received', 'created',
];

export interface AiDraft {
  id: string;
  stage: DraftStage;
  mode: 'known' | 'surprise';
  brief: Brief;
  ideas: Idea[] | null;
  chosenIdeaId: string | null;
  itinerary: ItineraryResponse | null;
  tripId: string | null;
  protocolVersion: number;
  updatedAt: string;
}
