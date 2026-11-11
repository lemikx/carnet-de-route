import { mapOrsError, toGeocodeResults, toRouteResult, ORS_PROFILES } from './ors';

describe('ors', () => {
  it('traduit les erreurs ORS', () => {
    expect(mapOrsError(429, {})).toBe('QUOTA');
    expect(mapOrsError(404, { error: { code: 2010 } })).toBe('NO_ROUTE');
    expect(mapOrsError(400, { error: { code: 2009 } })).toBe('NO_ROUTE');
    expect(mapOrsError(400, { error: { code: 2004 } })).toBe('NO_ROUTE');
    expect(mapOrsError(403, {})).toBe('UNAUTHORIZED');
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
