import { describe, expect, it, vi } from 'vitest';
import { handleConnector, type ConnectorDeps } from './handler';
import { parseItinerary } from '../../../src/ai/responseParser';
import { buildItineraryPrompt } from '../../../src/ai/promptBuilder';
import { ITINERARY_FIXTURE } from '../../../src/ai/fixtures';

const TOKEN = 'a'.repeat(64);
const lastBrief = {
  destination: 'Kyoto', startDate: '2026-01-01', endDate: '2026-01-03', departureCity: 'Toulouse', adults: 2, children: 0,
  travelers: [{ name: 'mika', nationality: 'FR' }, { name: 'fanny', nationality: 'FR' }], budgetPerPersonEur: 1800,
  travelerTypes: ['adventurer'], tripTypes: [], wishes: [], lodging: ['hotel'], pace: 'balanced', constraints: '',
};

function deps(over: Partial<ConnectorDeps> = {}) {
  const createDraft = vi.fn(async () => ({ id: 'draft-1' }) as const);
  const d: ConnectorDeps = {
    lastBrief: async (t) => (t === TOKEN ? { brief: lastBrief } : null),
    createDraft,
    parseItinerary,
    buildPrompt: (b, today) => buildItineraryPrompt(b as never, null, today),
    today: () => '2026-11-21',
    appUrl: 'https://lemikx.github.io/carnet-de-route/',
    ...over,
  };
  return { d, createDraft };
}

const rpc = (method: string, params: unknown = {}, id: number | null = 1, auth = `Bearer ${TOKEN}`, url = 'https://x/functions/v1/claude-connector') =>
  new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(auth ? { Authorization: auth } : {}) },
    body: JSON.stringify(id === null ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id, method, params }),
  });
const call = async (name: string, args: unknown, over: Partial<ConnectorDeps> = {}) => {
  const { d, createDraft } = deps(over);
  const res = await handleConnector(rpc('tools/call', { name, arguments: args }), d);
  const body = await res.json();
  return { res, body, text: body.result?.content?.[0]?.text as string, createDraft };
};

describe('claude-connector', () => {
  it('sans jeton valide : jamais de 401 (sinon claude.ai tente OAuth), mais aucun outil ne fonctionne', async () => {
    for (const auth of ['', 'Bearer mauvais']) {
      const init = await handleConnector(rpc('initialize', { protocolVersion: '2025-06-18' }, 1, auth), deps().d);
      expect(init.status).toBe(200);
      const { d, createDraft } = deps();
      const res = await handleConnector(rpc('tools/call', { name: 'create_trip_draft', arguments: { startDate: '2027-03-08', endDate: '2027-03-10', itinerary: ITINERARY_FIXTURE } }, 1, auth), d);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.result.isError).toBe(true);
      expect(body.result.content[0].text).toContain('Adresse du connecteur invalide');
      expect(createDraft).not.toHaveBeenCalled();
    }
  });
  it('accepte le jeton dans l’adresse', async () => {
    const res = await handleConnector(rpc('tools/list', {}, 1, '', `https://x/functions/v1/claude-connector?token=${TOKEN}`), deps().d);
    expect(res.status).toBe(200);
  });
  it('GET refusé, corps trop gros refusé', async () => {
    expect((await handleConnector(new Request('https://x/', { method: 'GET', headers: { Authorization: `Bearer ${TOKEN}` } }), deps().d)).status).toBe(405);
    const big = new Request('https://x/', { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: 'x'.repeat(300001) });
    expect((await handleConnector(big, deps().d)).status).toBe(413);
  });
  it('initialize, notification et méthode inconnue', async () => {
    const init = await (await handleConnector(rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude' } }), deps().d)).json();
    expect(init.result).toMatchObject({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'carnet-de-route' } });
    expect((await handleConnector(rpc('notifications/initialized', {}, null), deps().d)).status).toBe(202);
    const unknown = await (await handleConnector(rpc('resources/list'), deps().d)).json();
    expect(unknown.error.code).toBe(-32601);
  });
  it('liste les deux outils', async () => {
    const body = await (await handleConnector(rpc('tools/list'), deps().d)).json();
    expect(body.result.tools.map((t: { name: string }) => t.name)).toEqual(['get_itinerary_format', 'create_trip_draft']);
  });
  it('get_itinerary_format reprend le dernier questionnaire et les dates demandées', async () => {
    const { text } = await call('get_itinerary_format', { destination: 'Madère', startDate: '2027-03-08', endDate: '2027-03-22' });
    expect(text).toContain('Madère');
    expect(text).toContain('Toulouse');
    expect(text).toContain('2027-03-08');
    expect(text).toContain('mika : FR');
    expect(text).toContain('create_trip_draft');
  });
  it('create_trip_draft : brouillon déposé, lien renvoyé', async () => {
    const { text, createDraft, body } = await call('create_trip_draft', { destination: 'Kyoto', startDate: '2027-03-08', endDate: '2027-03-10', itinerary: ITINERARY_FIXTURE });
    expect(body.result.isError).toBeFalsy();
    expect(text).toContain('https://lemikx.github.io/carnet-de-route/#/ia/draft-1');
    expect(text).toContain('3 jours');
    const [tok, brief, itin] = createDraft.mock.calls[0] as unknown as [string, Record<string, unknown>, { days: unknown[] }];
    expect(tok).toBe(TOKEN);
    expect(brief).toMatchObject({ destination: 'Kyoto', startDate: '2027-03-08', endDate: '2027-03-10', departureCity: 'Toulouse' });
    expect(itin.days).toHaveLength(3);
  });
  it('itinéraire transmis en texte : accepté', async () => {
    const { body } = await call('create_trip_draft', { startDate: '2027-03-08', endDate: '2027-03-10', itinerary: JSON.stringify(ITINERARY_FIXTURE) });
    expect(body.result.isError).toBeFalsy();
  });
  it('itinéraire invalide : erreur détaillée, rien déposé', async () => {
    const bad = structuredClone(ITINERARY_FIXTURE) as unknown as { days: { stops: { startTime: string }[] }[] };
    bad.days[0].stops[0].startTime = '25:00';
    const { body, text, createDraft } = await call('create_trip_draft', { startDate: '2027-03-08', endDate: '2027-03-10', itinerary: bad });
    expect(body.result.isError).toBe(true);
    expect(text).toContain('25:00');
    expect(createDraft).not.toHaveBeenCalled();
  });
  it('dates invalides refusées', async () => {
    for (const [s, e] of [['2027-03-10', '2027-03-08'], ['demain', '2027-03-08'], ['2027-03-01', '2027-05-01']]) {
      const { body, createDraft } = await call('create_trip_draft', { startDate: s, endDate: e, itinerary: ITINERARY_FIXTURE });
      expect(body.result.isError).toBe(true);
      expect(createDraft).not.toHaveBeenCalled();
    }
  });
  it('limite de 20 brouillons par jour : message clair', async () => {
    const { body, text } = await call('create_trip_draft', { startDate: '2027-03-08', endDate: '2027-03-10', itinerary: ITINERARY_FIXTURE },
      { createDraft: async () => ({ error: 'RATE_LIMIT' }) });
    expect(body.result.isError).toBe(true);
    expect(text).toContain('20 brouillons');
  });
});
