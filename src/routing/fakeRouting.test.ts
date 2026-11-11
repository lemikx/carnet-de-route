import { createFakeRouting } from './fakeRouting';

describe('createFakeRouting', () => {
  const r = createFakeRouting();
  it('géocode une adresse connue ou générique', async () => {
    expect((await r.geocode('Kyoto'))[0].timezone).toBe('Asia/Tokyo');
    expect(await r.geocode('rue introuvable')).toEqual([]);
  });
  it('calcule un trajet déterministe', async () => {
    const a = await r.route({ lat: 35.0, lon: 135.7 }, { lat: 34.7, lon: 135.5 }, 'car');
    expect(a.durationMin).toBeGreaterThan(0);
    expect(a).toEqual(await r.route({ lat: 35.0, lon: 135.7 }, { lat: 34.7, lon: 135.5 }, 'car'));
  });
  it('refuse un trajet impossible', async () => {
    await expect(r.route({ lat: 0, lon: 0 }, { lat: 1, lon: 1 }, 'car')).rejects.toMatchObject({ code: 'NO_ROUTE' });
  });
});
