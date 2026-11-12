import { createClient } from '@supabase/supabase-js';
import { createSupabaseRepository } from './supabaseRepository';
import type { AiDraft } from '../ai/types';

function fakeClient(handler: (method: string, url: URL, body: unknown) => { status?: number; body?: unknown }) {
  const calls: { method: string; url: URL; body: unknown }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });
    const r = handler(method, url, body);
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status ?? 200, headers: { 'Content-Type': 'application/json' } });
  };
  return { client: createClient('http://localhost:54321', 'anon', { global: { fetch: fetchImpl }, auth: { persistSession: false } }), calls };
}

const brief = {
  destination: null, startDate: '2026-12-20', endDate: '2026-12-24', departureCity: 'Lyon', adults: 2, children: 0, travelers: [],
  budgetPerPersonEur: null, travelerTypes: [], tripTypes: [], wishes: [], lodging: [], pace: null, constraints: '',
};

describe('supabaseRepository — brouillons', () => {
  it('saveDraft envoie des colonnes snake_case et un brief intact', async () => {
    const { client, calls } = fakeClient((_m, _u, body) => ({ body: { ...(body as object), id: 'd1', updated_at: '2026-11-12T10:00:00Z' } }));
    const draft: Omit<AiDraft, 'id'> = {
      stage: 'idea_chosen', mode: 'surprise', brief, ideas: null, chosenIdeaId: 'kyoto', itinerary: null, tripId: null, protocolVersion: 1, updatedAt: 'x',
    };
    const saved = await createSupabaseRepository(client).saveDraft(draft);
    const sent = calls.find((c) => c.method === 'POST')!.body as Record<string, unknown>;
    expect(sent.chosen_idea_id).toBe('kyoto');
    expect(sent.protocol_version).toBe(1);
    expect(sent.updated_at).toBeUndefined();
    expect((sent.brief as typeof brief).departureCity).toBe('Lyon');
    expect(saved.chosenIdeaId).toBe('kyoto');
    expect(saved.id).toBe('d1');
  });

  it('listDrafts trie par date décroissante et reconvertit trip_id', async () => {
    const { client, calls } = fakeClient(() => ({
      body: [{ id: 'd1', trip_id: 't1', chosen_idea_id: null, protocol_version: 1, stage: 'created', mode: 'known', brief, ideas: null, itinerary: null, updated_at: 'z', user_id: 'u' }],
    }));
    const list = await createSupabaseRepository(client).listDrafts();
    expect(calls[0].url.searchParams.get('order')).toBe('updated_at.desc');
    expect(list[0].tripId).toBe('t1');
    expect((list[0] as unknown as Record<string, unknown>).userId).toBeUndefined();
  });

  it('getDraft inconnu → NotFoundError', async () => {
    const { client } = fakeClient(() => ({ body: null }));
    await expect(createSupabaseRepository(client).getDraft('x')).rejects.toMatchObject({ name: 'NotFoundError' });
  });
});
