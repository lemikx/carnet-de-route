import { DateTime } from 'luxon';
import { nextPosition, type BudgetService } from '../services/budgetService';
import type { TripRepository } from '../data/TripRepository';
import type { TripService } from '../services/tripService';
import type { Stop } from '../domain/types';
import type { ResolvedPlace } from './placeResolver';
import type { Brief, ItineraryResponse, ItineraryStop } from './types';
import { assessVisa } from './visa';

export class CreationError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'CreationError';
  }
}

export interface CreationDeps {
  repo: TripRepository;
  tripService: TripService;
  budgetService: BudgetService;
  today: string;
}

export interface CreationResult {
  tripId: string;
  toVerify: number;
  skippedBudgetLines: number;
}

const VISA_LABEL = 'Visa / autorisation d’entrée';
const NONE: ResolvedPlace = { status: 'not_found', lat: null, lon: null, timezone: null, label: null };

/** `resolved` suit l'ordre des étapes de tous les jours mis bout à bout. */
export async function createTripFromItinerary(
  deps: CreationDeps,
  input: { brief: Brief; itinerary: ItineraryResponse; resolved: ResolvedPlace[] },
): Promise<CreationResult> {
  const { repo, tripService, budgetService, today } = deps;
  const { brief, itinerary, resolved } = input;
  let tripId: string | null = null;
  try {
    const bundle = await tripService.createTrip({
      name: itinerary.trip.name || brief.destination || 'Voyage IA',
      countries: itinerary.trip.countries,
      startDate: brief.startDate,
      endDate: brief.endDate,
      localCurrency: itinerary.trip.currency,
      homeTimezone: 'Europe/Paris',
      updatedAt: '',
    });
    tripId = bundle.trip.id;
    const days = [...bundle.days].sort((a, b) => a.date.localeCompare(b.date));

    // Étapes : l'hébergement termine la journée ; les jours en trop sont ignorés.
    let cursor = 0;
    let toVerify = 0;
    for (const [i, day] of itinerary.days.entries()) {
      const indexed: { stop: ItineraryStop; res: ResolvedPlace }[] = day.stops.map((stop, k) => ({ stop, res: resolved[cursor + k] ?? NONE }));
      cursor += day.stops.length;
      const target = days[i];
      if (!target) continue;
      await repo.updateDay({ ...target, title: day.title, note: day.note });
      const ordered = [...indexed.filter((x) => x.stop.kind !== 'lodging'), ...indexed.filter((x) => x.stop.kind === 'lodging')];
      for (const [position, { stop, res }] of ordered.entries()) {
        const located = res.status === 'ok';
        if (res.status !== 'ok') toVerify++;
        const s: Omit<Stop, 'id'> = {
          dayId: target.id,
          position,
          kind: stop.kind,
          title: stop.title,
          address: [stop.place.name, stop.place.city, stop.place.country].filter(Boolean).join(', '),
          lat: located ? res.lat : null,
          lon: located ? res.lon : null,
          timezone: res.timezone ?? bundle.trip.homeTimezone,
          startTime: stop.startTime,
          durationMin: stop.durationMin,
          note: located ? stop.note : [stop.note, 'À vérifier : lieu non localisé automatiquement.'].filter(Boolean).join('\n'),
          phone: '',
          url: '',
          reservationId: null,
        };
        await repo.saveStop(s);
      }
    }
    await tripService.syncLegs(tripId);

    // Checklist : éléments de l'IA, puis échéance du visa.
    const existing = (await repo.getBundle(tripId)).checklist;
    let pos = nextPosition(existing);
    const dep = DateTime.fromISO(brief.startDate, { zone: 'utc' });
    for (const c of itinerary.checklist) {
      await repo.saveChecklistItem({
        tripId, category: c.category, label: c.label, done: false, position: pos++,
        dueDate: c.daysBeforeDeparture === null ? null : dep.minus({ days: c.daysBeforeDeparture }).toISODate(),
      });
    }
    const visa = assessVisa(itinerary.trip.visa, { departureDate: brief.startDate, today });
    if (itinerary.trip.visa.required === true && visa.deadline) {
      const label = visa.overdue ? `${VISA_LABEL} (en retard)` : VISA_LABEL;
      const item = existing.find((c) => c.label === VISA_LABEL);
      if (item) await repo.saveChecklistItem({ ...item, label, dueDate: visa.deadline });
      else await repo.saveChecklistItem({ tripId, category: 'documents', label, done: false, dueDate: visa.deadline, position: pos++ });
    }

    // Budget : voyageurs puis lignes prévues avec leur taux.
    const count = brief.travelers.length || brief.adults + brief.children || 1;
    const names = Array.from({ length: count }, (_, i) => brief.travelers[i]?.name.trim() || `Voyageur ${i + 1}`);
    await budgetService.ensureTravelers(tripId, names);
    let skipped = 0;
    let linePos = 0;
    for (const b of itinerary.budget) {
      let rate = 1;
      if (b.currency !== 'EUR') {
        const r = await budgetService.newExpenseRate(b.currency, today);
        if ('error' in r) { skipped++; continue; }
        rate = r.rateToEur;
      }
      await repo.saveBudgetLine({
        tripId, category: b.category, label: b.label, amount: b.amount, currency: b.currency, mode: b.mode,
        position: linePos++, rateToEur: rate, rateManual: false, rateDate: today,
      });
    }
    return { tripId, toVerify, skippedBudgetLines: skipped };
  } catch (e) {
    if (tripId) {
      try {
        await repo.deleteTrip(tripId);
      } catch {
        throw new CreationError('La création a échoué et un voyage incomplet est peut-être resté : vérifie « Mes voyages » et supprime-le.', e);
      }
    }
    throw new CreationError('La création a échoué : rien n’a été enregistré.', e);
  }
}
