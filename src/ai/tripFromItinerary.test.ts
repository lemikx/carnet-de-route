import { describe, expect, it } from 'vitest';
import { createMemoryRepository } from '../data/memoryRepository';
import type { TripRepository } from '../data/TripRepository';
import { createFakeFx } from '../fx/fakeFx';
import { createFakeRouting } from '../routing/fakeRouting';
import { createBudgetService } from '../services/budgetService';
import { createTripService } from '../services/tripService';
import { ITINERARY_FIXTURE } from './fixtures';
import type { ResolvedPlace } from './placeResolver';
import { CreationError, createTripFromItinerary } from './tripFromItinerary';
import type { Brief, ItineraryResponse } from './types';

const brief: Brief = {
  destination: null, startDate: '2026-12-20', endDate: '2026-12-22', departureCity: 'Lyon', adults: 2, children: 0,
  travelers: [{ name: '', nationality: 'FR' }, { name: 'Léa', nationality: 'FR' }], budgetPerPersonEur: null,
  travelerTypes: [], tripTypes: [], wishes: [], lodging: [], pace: null, constraints: '',
};
const ok = (lat = 35.01): ResolvedPlace => ({ status: 'ok', lat, lon: 135.76, timezone: 'Asia/Tokyo', label: 'x' });
const nf: ResolvedPlace = { status: 'not_found', lat: null, lon: null, timezone: null, label: null };
const itin = (patch: Partial<ItineraryResponse> = {}): ItineraryResponse => ({ ...structuredClone(ITINERARY_FIXTURE), ...patch });
const nStops = (i: ItineraryResponse) => i.days.reduce((n, d) => n + d.stops.length, 0);

function setup(repoOverride?: (r: TripRepository) => TripRepository) {
  const base = createMemoryRepository();
  const repo = repoOverride ? repoOverride(base) : base;
  const tripService = createTripService(repo, createFakeRouting());
  const budgetService = createBudgetService(repo, createFakeFx());
  return { base, repo, deps: { repo, tripService, budgetService, today: '2026-11-12' } };
}

describe('createTripFromItinerary', () => {
  it('crée le voyage, les étapes, les trajets et le budget', async () => {
    const { repo, deps } = setup();
    const it1 = itin();
    const r = await createTripFromItinerary(deps, { brief, itinerary: it1, resolved: Array(nStops(it1)).fill(null).map(() => ok()) });
    const b = await repo.getBundle(r.tripId);
    expect(b.days).toHaveLength(3);
    expect(b.stops).toHaveLength(5);
    const day1 = b.stops.filter((s) => s.dayId === b.days.find((d) => d.date === '2026-12-20')!.id).sort((a, c) => a.position - c.position);
    expect(day1.map((s) => s.kind)).toEqual(['activity', 'lodging']);
    expect(day1[0]).toMatchObject({ startTime: '10:00', durationMin: 120, lat: 35.01 });
    expect(b.legs.length).toBeGreaterThan(0);
    expect(r.toVerify).toBe(0);
    const budget = await repo.getBudget(r.tripId);
    expect(budget.travelers.map((t) => t.name)).toEqual(['Voyageur 1', 'Léa']);
    expect(budget.lines.map((l) => l.currency)).toEqual(['JPY', 'EUR']);
    expect(budget.lines[0].rateToEur).toBeCloseTo(0.0061);
  });

  it('lieux tous introuvables : voyage créé sans carte', async () => {
    const { repo, deps } = setup();
    const it1 = itin();
    const r = await createTripFromItinerary(deps, { brief, itinerary: it1, resolved: Array(nStops(it1)).fill(nf) });
    const b = await repo.getBundle(r.tripId);
    expect(b.stops.every((s) => s.lat === null)).toBe(true);
    expect(r.toVerify).toBe(5);
  });

  it('jours en trop ignorés, jours manquants vides', async () => {
    const { repo, deps } = setup();
    const it1 = itin();
    const r1 = await createTripFromItinerary(deps, { brief: { ...brief, endDate: '2026-12-21' }, itinerary: it1, resolved: Array(5).fill(ok()) });
    expect((await repo.getBundle(r1.tripId)).days).toHaveLength(2);
    const r2 = await createTripFromItinerary(deps, { brief: { ...brief, endDate: '2026-12-24' }, itinerary: it1, resolved: Array(5).fill(ok()) });
    const b2 = await repo.getBundle(r2.tripId);
    expect(b2.days).toHaveLength(5);
    expect(b2.stops).toHaveLength(5);
  });

  it('échéance du visa dans la checklist', async () => {
    const { repo, deps } = setup();
    const r = await createTripFromItinerary(deps, { brief, itinerary: itin(), resolved: Array(5).fill(ok()) });
    const visa = (await repo.getBundle(r.tripId)).checklist.find((c) => c.label.startsWith('Visa'))!;
    expect(visa).toMatchObject({ label: 'Visa / autorisation d’entrée', dueDate: '2026-12-03' });
    const late = await createTripFromItinerary({ ...deps, today: '2026-12-10' }, { brief, itinerary: itin(), resolved: Array(5).fill(ok()) });
    const v2 = (await repo.getBundle(late.tripId)).checklist.find((c) => c.label.startsWith('Visa'))!;
    expect(v2.label).toBe('Visa / autorisation d’entrée (en retard)');
    const none = itin({ trip: { ...ITINERARY_FIXTURE.trip, visa: { ...ITINERARY_FIXTURE.trip.visa, required: false } } });
    const r3 = await createTripFromItinerary(deps, { brief, itinerary: none, resolved: Array(5).fill(ok()) });
    expect((await repo.getBundle(r3.tripId)).checklist.find((c) => c.label.startsWith('Visa'))!.dueDate).toBeNull();
  });

  it('éléments de checklist de l’IA avec échéance', async () => {
    const { repo, deps } = setup();
    const r = await createTripFromItinerary(deps, { brief, itinerary: itin(), resolved: Array(5).fill(ok()) });
    const c = (await repo.getBundle(r.tripId)).checklist.find((x) => x.label === 'Assurance voyage' && x.dueDate)!;
    expect(c.dueDate).toBe('2026-12-06');
  });

  it('ligne de budget en devise inconnue ignorée', async () => {
    const { repo, deps } = setup();
    const it1 = itin();
    it1.budget.push({ category: 'other', label: 'Mystère', amount: 5, currency: 'XXX', mode: 'fixed' });
    const r = await createTripFromItinerary(deps, { brief, itinerary: it1, resolved: Array(5).fill(ok()) });
    expect(r.skippedBudgetLines).toBe(1);
    expect((await repo.getBudget(r.tripId)).lines).toHaveLength(2);
  });

  it('échec à la 4e étape : rien ne reste, puis un réessai crée un seul voyage', async () => {
    let n = 0;
    let fail = true;
    const { base, deps } = setup((r) => ({
      ...r,
      saveStop: async (s) => {
        if (fail && ++n === 4) throw new Error('panne');
        return r.saveStop(s);
      },
    }));
    await expect(createTripFromItinerary(deps, { brief, itinerary: itin(), resolved: Array(5).fill(ok()) })).rejects.toBeInstanceOf(CreationError);
    expect(await base.listTrips()).toEqual([]);
    fail = false;
    await createTripFromItinerary(deps, { brief, itinerary: itin(), resolved: Array(5).fill(ok()) });
    expect(await base.listTrips()).toHaveLength(1);
  });

  it('I2 : si le nettoyage échoue aussi, le message le dit', async () => {
    const { deps } = setup((r) => ({
      ...r,
      saveStop: async () => { throw new Error('panne'); },
      deleteTrip: async () => { throw new Error('réseau coupé'); },
    }));
    await expect(createTripFromItinerary(deps, { brief, itinerary: itin(), resolved: Array(5).fill(ok()) }))
      .rejects.toThrow(/incomplet/);
  });

  it('lieu lointain (far) : pas de coordonnées et note « à vérifier »', async () => {
    const { repo, deps } = setup();
    const far: ResolvedPlace = { status: 'far', lat: null, lon: null, timezone: null, label: null };
    const it1 = itin();
    const resolved = Array(nStops(it1)).fill(null).map(() => ok());
    resolved[1] = far;
    const r = await createTripFromItinerary(deps, { brief, itinerary: it1, resolved });
    const stops = (await repo.getBundle(r.tripId)).stops;
    const flagged = stops.filter((s) => s.lat === null);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].note).toContain('À vérifier');
    expect(r.toVerify).toBe(1);
  });
});
