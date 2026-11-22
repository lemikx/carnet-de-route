import { describe, expect, it } from 'vitest';
import { createMemoryRepository } from '../data/memoryRepository';
import type { TripRepository } from '../data/TripRepository';
import { createFakeFx } from '../fx/fakeFx';
import { createFakeRouting } from '../routing/fakeRouting';
import { createBudgetService } from '../services/budgetService';
import { createTripService } from '../services/tripService';
import { createAiService } from './aiService';
import { asReply, IDEAS_FIXTURE, ITINERARY_FIXTURE } from './fixtures';
import type { Brief } from './types';

const brief = (o: Partial<Brief> = {}): Brief => ({
  destination: null, startDate: '2026-12-20', endDate: '2026-12-22', departureCity: null, adults: 1, children: 0, travelers: [{ name: '', nationality: 'FR' }],
  budgetPerPersonEur: null, travelerTypes: [], tripTypes: [], wishes: [], lodging: [], pace: null, constraints: '', ...o,
});

function make(wrap?: (r: TripRepository) => TripRepository) {
  const base = createMemoryRepository();
  const repo = wrap ? wrap(base) : base;
  const ai = createAiService({
    repo, routing: createFakeRouting(), tripService: createTripService(repo, createFakeRouting()),
    budgetService: createBudgetService(repo, createFakeFx()), today: () => '2026-11-12',
  });
  return { base, repo, ai };
}

describe('aiService', () => {
  it('parcours « surprends-moi » complet', async () => {
    const { repo, ai } = make();
    let d = await ai.startDraft(brief());
    expect([d.mode, d.stage]).toEqual(['surprise', 'brief']);
    const q1 = await ai.buildRequest(d.id);
    expect(q1.kind).toBe('ideas');
    expect((await repo.getDraft(d.id)).stage).toBe('ideas_requested');
    const r1 = await ai.receiveIdeas(d.id, asReply(IDEAS_FIXTURE));
    expect(r1.ok && r1.value.stage).toBe('ideas_received');
    d = await ai.chooseIdea(d.id, 'kyoto');
    expect(d.stage).toBe('idea_chosen');
    const q2 = await ai.buildRequest(d.id);
    expect(q2.kind).toBe('itinerary');
    expect(q2.prompt).toContain('Kyoto');
    const r2 = await ai.receiveItinerary(d.id, asReply(ITINERARY_FIXTURE));
    expect(r2.ok && r2.value.stage).toBe('itinerary_received');
    const progress: number[] = [];
    const res = await ai.create(d.id, (done) => progress.push(done));
    const final = await repo.getDraft(d.id);
    expect([final.stage, final.tripId]).toEqual(['created', res.tripId]);
    expect(progress.length).toBeGreaterThan(0);
    expect((await repo.getBundle(res.tripId)).stops).toHaveLength(5);
  });

  it('parcours « je sais où aller » saute les idées', async () => {
    const { ai } = make();
    const d = await ai.startDraft(brief({ destination: 'Kyoto' }));
    expect(d.mode).toBe('known');
    const q = await ai.buildRequest(d.id);
    expect(q.kind).toBe('itinerary');
    expect(q.prompt).toContain('Kyoto');
    expect((await ai.receiveItinerary(d.id, asReply(ITINERARY_FIXTURE))).ok).toBe(true);
  });

  it('réponse invalide ou tronquée : brouillon inchangé', async () => {
    const { repo, ai } = make();
    const d = await ai.startDraft(brief({ destination: 'Kyoto' }));
    await ai.buildRequest(d.id);
    const before = await repo.getDraft(d.id);
    const bad = await ai.receiveItinerary(d.id, 'blabla');
    expect(bad.ok).toBe(false);
    const full = asReply(ITINERARY_FIXTURE, 'raw');
    const cut = await ai.receiveItinerary(d.id, full.slice(0, 200));
    expect(!cut.ok && cut.truncated).toBe(true);
    expect(await repo.getDraft(d.id)).toEqual(before);
  });

  it('étapes dans le mauvais ordre refusées', async () => {
    const { ai } = make();
    const d = await ai.startDraft(brief());
    await ai.buildRequest(d.id);
    await expect(ai.receiveItinerary(d.id, asReply(ITINERARY_FIXTURE))).rejects.toThrow('pas disponible');
    await ai.receiveIdeas(d.id, asReply(IDEAS_FIXTURE));
    await expect(ai.chooseIdea(d.id, 'inconnue')).rejects.toThrow();
  });

  it('échec de création : brouillon intact, aucun voyage, réessai = un seul voyage', async () => {
    let fail = true;
    const { base, repo, ai } = make((r) => ({ ...r, saveStop: async (s) => { if (fail) throw new Error('panne'); return r.saveStop(s); } }));
    const d = await ai.startDraft(brief({ destination: 'Kyoto' }));
    await ai.buildRequest(d.id);
    await ai.receiveItinerary(d.id, asReply(ITINERARY_FIXTURE));
    await expect(ai.create(d.id)).rejects.toThrow();
    expect((await repo.getDraft(d.id)).stage).toBe('itinerary_received');
    expect(await base.listTrips()).toEqual([]);
    fail = false;
    await ai.create(d.id);
    expect(await base.listTrips()).toHaveLength(1);
    await expect(ai.create(d.id)).rejects.toThrow('déjà créé');
    expect(await base.listTrips()).toHaveLength(1);
  });

  it('les brouillons survivent à un rechargement', async () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const a = createMemoryRepository({ storage });
    const mk = (repo: TripRepository) => createAiService({
      repo, routing: createFakeRouting(), tripService: createTripService(repo, createFakeRouting()), budgetService: createBudgetService(repo, createFakeFx()),
    });
    const d = await mk(a).startDraft(brief());
    const b = createMemoryRepository({ storage });
    expect((await b.listDrafts()).map((x) => x.id)).toEqual([d.id]);
  });

  it('I2 : si l’enregistrement final du brouillon échoue, le voyage est retiré (pas de doublon au réessai)', async () => {
    let fail = true;
    const { base, ai } = make((r) => ({ ...r, saveDraft: async (d) => { if (fail && 'stage' in d && d.stage === 'created') throw new Error('panne'); return r.saveDraft(d); } }));
    const d = await ai.startDraft(brief({ destination: 'Kyoto' }));
    await ai.buildRequest(d.id);
    await ai.receiveItinerary(d.id, asReply(ITINERARY_FIXTURE));
    await expect(ai.create(d.id)).rejects.toThrow();
    expect(await base.listTrips()).toEqual([]);
    fail = false;
    await ai.create(d.id);
    expect(await base.listTrips()).toHaveLength(1);
  });

  it('I5 : on peut redemander la demande pour recoller une autre réponse', async () => {
    const { repo, ai } = make();
    const d = await ai.startDraft(brief());
    await ai.buildRequest(d.id);
    await ai.receiveIdeas(d.id, asReply(IDEAS_FIXTURE));
    expect((await ai.buildRequest(d.id)).kind).toBe('ideas');
    expect((await repo.getDraft(d.id)).stage).toBe('ideas_requested');
    await ai.receiveIdeas(d.id, asReply(IDEAS_FIXTURE));
    await ai.chooseIdea(d.id, 'kyoto');
    await ai.buildRequest(d.id);
    await ai.receiveItinerary(d.id, asReply(ITINERARY_FIXTURE));
    expect((await ai.buildRequest(d.id)).kind).toBe('itinerary');
    expect((await repo.getDraft(d.id)).stage).toBe('itinerary_requested');
  });

  it('« surprend moi » écrit dans la destination → mode surprise', async () => {
    const { ai } = make();
    const d = await ai.startDraft(brief({ destination: 'surprend moi' }));
    expect([d.mode, d.brief.destination]).toEqual(['surprise', null]);
    expect((await ai.buildRequest(d.id)).kind).toBe('ideas');
  });

  it('ancien brouillon « known » avec destination « surprends moi » → corrigé en surprise', async () => {
    const { repo, ai } = make();
    const old = await repo.saveDraft({
      stage: 'brief', mode: 'known', brief: brief({ destination: 'surprends moi' }), ideas: null, chosenIdeaId: null,
      itinerary: null, tripId: null, protocolVersion: 1, updatedAt: '',
    });
    expect((await ai.buildRequest(old.id)).kind).toBe('ideas');
    const d = await repo.getDraft(old.id);
    expect([d.mode, d.brief.destination, d.stage]).toEqual(['surprise', null, 'ideas_requested']);
  });

  it('ancien brouillon déjà à « itinéraire demandé » avec « surprends moi » → corrigé en surprise', async () => {
    const { repo, ai } = make();
    const old = await repo.saveDraft({
      stage: 'itinerary_requested', mode: 'known', brief: brief({ destination: 'surprends moi' }), ideas: null, chosenIdeaId: null,
      itinerary: null, tripId: null, protocolVersion: 1, updatedAt: '',
    });
    expect((await ai.buildRequest(old.id)).kind).toBe('ideas');
    const d = await repo.getDraft(old.id);
    expect([d.mode, d.brief.destination, d.stage]).toEqual(['surprise', null, 'ideas_requested']);
  });

  it('importItinerary : valide et enregistre un brouillon « itinéraire reçu » (mode connu)', async () => {
    const { repo, ai } = make();
    const r = await ai.importItinerary({ brief: brief({ destination: 'Kyoto' }), text: asReply(ITINERARY_FIXTURE) });
    expect(r.ok).toBe(true);
    const drafts = await repo.listDrafts();
    expect(drafts).toHaveLength(1);
    expect([drafts[0].mode, drafts[0].stage, drafts[0].brief.destination]).toEqual(['known', 'itinerary_received', 'Kyoto']);
    expect(drafts[0].itinerary?.days).toHaveLength(3);
    const created = await ai.create(drafts[0].id);
    expect((await repo.getBundle(created.tripId)).stops).toHaveLength(5);
  });

  it('importItinerary : échec de validation, aucun brouillon créé', async () => {
    const { repo, ai } = make();
    const bad = structuredClone(ITINERARY_FIXTURE);
    bad.days[0].stops[0].startTime = '25:00';
    const r = await ai.importItinerary({ brief: brief(), text: asReply(bad, 'raw') });
    expect(r.ok).toBe(false);
    expect(await repo.listDrafts()).toEqual([]);
    expect((await ai.importItinerary({ brief: brief(), text: 'rien' })).ok).toBe(false);
    expect(await repo.listDrafts()).toEqual([]);
  });
});

