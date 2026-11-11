import { createClient } from '@supabase/supabase-js';
import { createSupabaseRepository } from './supabaseRepository';

/** Faux serveur PostgREST minimal : enregistre les requêtes reçues. */
function fakeClient(handler: (method: string, url: URL) => { status?: number; body?: unknown; headers?: Record<string, string> }) {
  const calls: { method: string; url: URL }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = (init?.method ?? 'GET').toUpperCase();
    calls.push({ method, url });
    const r = handler(method, url);
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { 'Content-Type': 'application/json', ...(r.headers ?? {}) },
    });
  };
  return { client: createClient('http://localhost:54321', 'anon', { global: { fetch: fetchImpl }, auth: { persistSession: false } }), calls };
}

describe('supabaseRepository — voyageurs', () => {
  it('supprime un voyageur quand il y en a plusieurs', async () => {
    const { client, calls } = fakeClient((method, url) => {
      if (method === 'GET' && url.searchParams.has('trip_id') === false && url.searchParams.get('select') === 'trip_id') return { body: { trip_id: 't1' } };
      if (method === 'HEAD' || (method === 'GET' && url.searchParams.get('select') === 'id')) return { body: [], headers: { 'Content-Range': '0-1/2' } };
      if (method === 'DELETE') return { status: 204 };
      return { body: [] };
    });
    await createSupabaseRepository(client).deleteTraveler('v1');
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true);
  });

  it('refuse de supprimer le dernier voyageur sans rien supprimer', async () => {
    const { client, calls } = fakeClient((method, url) => {
      if (method === 'GET' && url.searchParams.get('select') === 'trip_id') return { body: { trip_id: 't1' } };
      if (method === 'HEAD' || (method === 'GET' && url.searchParams.get('select') === 'id')) return { body: [], headers: { 'Content-Range': '0-0/1' } };
      return { status: 204 };
    });
    await expect(createSupabaseRepository(client).deleteTraveler('v1')).rejects.toMatchObject({ code: 'LAST_TRAVELER' });
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
  });

  it('traduit un voyageur utilisé en erreur métier', async () => {
    const { client } = fakeClient((method, url) => {
      if (method === 'GET' && url.searchParams.get('select') === 'trip_id') return { body: { trip_id: 't1' } };
      if (method === 'HEAD' || (method === 'GET' && url.searchParams.get('select') === 'id')) return { body: [], headers: { 'Content-Range': '0-1/2' } };
      return { status: 409, body: { code: '23503', message: 'TRAVELER_IN_USE' } };
    });
    await expect(createSupabaseRepository(client).deleteTraveler('v1')).rejects.toMatchObject({ code: 'TRAVELER_IN_USE' });
  });

  it('ne prend pas une autre erreur de clé étrangère pour un voyageur utilisé lors d’une dépense', async () => {
    const { client } = fakeClient(() => ({ status: 409, body: { code: '23503', message: 'insert or update violates foreign key constraint "expenses_line_id_fkey"' } }));
    const err = await createSupabaseRepository(client)
      .saveExpense({ tripId: 't', date: '2026-12-01', category: 'food', label: 'x', amount: 1, currency: 'EUR', rateToEur: 1, rateManual: false, paidBy: 'v', participantIds: ['v'], lineId: 'l', reservationId: null })
      .catch((e) => e);
    expect(err.code).toBeUndefined();
    expect(String(err.message)).toContain('foreign key');
  });
});
