import { handleRoutes, mapOrsError, toGeocodeResults, toRouteResult, ORS_PROFILES } from './ors';

describe('ors', () => {
  it('traduit les erreurs ORS', () => {
    expect(mapOrsError(429, {})).toBe('QUOTA');
    expect(mapOrsError(404, { error: { code: 2010 } })).toBe('NO_ROUTE');
    expect(mapOrsError(400, { error: { code: 2009 } })).toBe('NO_ROUTE');
    expect(mapOrsError(400, { error: { code: 2004 } })).toBe('NO_ROUTE');
    expect(mapOrsError(403, {})).toBe('UNAUTHORIZED');
    // Tyk (passerelle d'OpenRouteService) répond 403 « Quota exceeded » quand la limite est atteinte.
    expect(mapOrsError(403, { error: 'Quota exceeded' })).toBe('QUOTA');
    expect(mapOrsError(403, { error: 'quota exceeded for this key' })).toBe('QUOTA');
    expect(mapOrsError(403, { error: 'Access to this API has been disallowed' })).toBe('UNAUTHORIZED');
    expect(mapOrsError(500, {})).toBe('NETWORK');
  });

  it('convertit un itinéraire GeoJSON', () => {
    const geo = {
      features: [{
        properties: { summary: { duration: 3725, distance: 52340 } },
        geometry: { coordinates: [[135.5, 34.7], [135.7, 35.0]] },
      }],
    };
    expect(toRouteResult(geo)).toEqual({ durationMin: 63, distanceKm: 52.3, geometry: [[34.7, 135.5], [35.0, 135.7]] });
  });

  it('convertit des résultats de géocodage avec fuseau horaire', () => {
    const geo = {
      features: [{ properties: { label: 'Kyoto, Japon', country_a: 'JPN' }, geometry: { coordinates: [135.76, 35.01] } }],
    };
    expect(toGeocodeResults(geo, () => 'Asia/Tokyo')).toEqual([
      { label: 'Kyoto, Japon', lat: 35.01, lon: 135.76, country: 'JPN', timezone: 'Asia/Tokyo' },
    ]);
  });

  it('utilise les bons profils', () => {
    expect(ORS_PROFILES).toEqual({ car: 'driving-car', walk: 'foot-walking', bike: 'cycling-regular' });
  });
});

describe('handleRoutes : accès', () => {
  const jwt = (payload: object) => `x.${btoa(JSON.stringify(payload)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}.y`;
  const deps = () => ({
    apiKey: 'k',
    tz: () => 'Asia/Tokyo',
    fetchImpl: vi.fn(async () => new Response(JSON.stringify({ features: [] }), { status: 200 })) as unknown as typeof fetch,
  });
  const req = (token?: string) =>
    new Request('https://x/routes', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: JSON.stringify({ action: 'geocode', query: 'Kyoto' }),
    });

  it('refuse la clé publique anon', async () => {
    const d = deps();
    const res = await handleRoutes(req(jwt({ role: 'anon' })), d);
    expect(res.status).toBe(401);
    expect(d.fetchImpl).not.toHaveBeenCalled();
  });
  it('refuse une requête sans jeton', async () => {
    expect((await handleRoutes(req(), deps())).status).toBe(401);
  });
  it('accepte un utilisateur connecté', async () => {
    const res = await handleRoutes(req(jwt({ role: 'authenticated', sub: 'u1' })), deps());
    expect(res.status).toBe(200);
  });
  it('rejette un corps vide sans planter', async () => {
    const r = new Request('https://x/routes', { method: 'POST', headers: { Authorization: `Bearer ${jwt({ role: 'authenticated' })}` }, body: 'null' });
    expect((await handleRoutes(r, deps())).status).toBe(400);
  });

  it('transmet un point de proximité au géocodage', async () => {
    const d = deps();
    const r = new Request('https://x/routes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt({ role: 'authenticated' })}` },
      body: JSON.stringify({ action: 'geocode', query: 'Kinkaku-ji', focus: { lat: 35.04, lon: 135.73 } }),
    });
    await handleRoutes(r, d);
    const url = String((d.fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0]);
    expect(url).toContain('focus.point.lat=35.04');
    expect(url).toContain('focus.point.lon=135.73');
  });
  it('ignore un point de proximité invalide', async () => {
    const d = deps();
    const r = new Request('https://x/routes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt({ role: 'authenticated' })}` },
      body: JSON.stringify({ action: 'geocode', query: 'Kyoto', focus: { lat: 'x', lon: 999 } }),
    });
    await handleRoutes(r, d);
    expect(String((d.fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0])).not.toContain('focus.point');
  });
});
