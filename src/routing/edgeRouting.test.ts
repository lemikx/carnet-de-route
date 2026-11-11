import { createEdgeRouting } from './edgeRouting';
import { RoutingError } from './RoutingService';

const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
const err = (status: number, code: string) => Promise.resolve(new Response(JSON.stringify({ code, message: 'x' }), { status }));

describe('createEdgeRouting', () => {
  const token = async () => 'jwt';
  it('renvoie un itinéraire', async () => {
    const f = vi.fn(() => ok({ durationMin: 10, distanceKm: 3, geometry: [] }));
    const r = createEdgeRouting('https://x.supabase.co/functions/v1/routes', token, f);
    expect(await r.route({ lat: 1, lon: 2 }, { lat: 3, lon: 4 }, 'car')).toEqual({ durationMin: 10, distanceKm: 3, geometry: [] });
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt');
    expect(JSON.parse(init.body as string)).toEqual({ action: 'route', from: { lat: 1, lon: 2 }, to: { lat: 3, lon: 4 }, mode: 'car' });
  });
  it('signale un quota atteint', async () => {
    const r = createEdgeRouting('u', token, () => err(429, 'QUOTA'));
    await expect(r.route({ lat: 1, lon: 2 }, { lat: 3, lon: 4 }, 'car')).rejects.toMatchObject({ code: 'QUOTA' });
  });
  it('signale une erreur réseau', async () => {
    const r = createEdgeRouting('u', token, () => Promise.reject(new TypeError('Failed to fetch')));
    const p = r.geocode('Kyoto');
    await expect(p).rejects.toBeInstanceOf(RoutingError);
    await expect(p).rejects.toMatchObject({ code: 'NETWORK' });
  });
});
