import { describe, expect, it } from 'vitest';
import { RoutingError, type GeocodeResult, type LatLon, type RoutingService } from '../routing/RoutingService';
import { haversineKm, resolvePlaces } from './placeResolver';
import type { ItineraryPlace } from './types';

const place = (name: string): ItineraryPlace => ({ name, city: 'Kyoto', country: 'Japon' });
const geo = (lat: number, lon = 135, label = 'x'): GeocodeResult => ({ label, lat, lon, country: 'JPN', timezone: 'Asia/Tokyo' });

function service(fn: (q: string, focus: LatLon | undefined, n: number) => Promise<GeocodeResult[]>) {
  const calls: { q: string; focus?: LatLon }[] = [];
  let running = 0;
  let maxRunning = 0;
  const routing: RoutingService = {
    async geocode(q, focus) {
      calls.push({ q, focus });
      const n = calls.length;
      running++;
      maxRunning = Math.max(maxRunning, running);
      try {
        await new Promise((r) => setTimeout(r, 2));
        return await fn(q, focus, n);
      } finally {
        running--;
      }
    },
    async route() { throw new Error('inutile'); },
  };
  return { routing, calls, max: () => maxRunning };
}

describe('resolvePlaces', () => {
  it('place quatre lieux dans l’ordre et signale la progression', async () => {
    const { routing } = service(async (q) => [geo(35 + Number(q.slice(1, 2)) / 100)]);
    const progress: [number, number][] = [];
    const r = await resolvePlaces(['1', '2', '3', '4'].map((n) => place(`L${n}`)), { routing, onProgress: (d, t) => progress.push([d, t]) });
    expect(r.map((x) => x.status)).toEqual(['ok', 'ok', 'ok', 'ok']);
    expect(r[2].lat).toBeCloseTo(35.03);
    expect(progress[progress.length - 1]).toEqual([4, 4]);
  });

  it('introuvable', async () => {
    const { routing } = service(async () => []);
    const r = await resolvePlaces([place('Rien')], { routing });
    expect(r[0]).toMatchObject({ status: 'not_found', lat: null, lon: null });
  });

  it('frontière des 150 km autour de la médiane', async () => {
    const lats = [35, 35, 35, 36.34];
    const { routing } = service(async (q) => [geo(lats[Number(q.slice(1, 2))])]);
    const places = [0, 1, 2, 3].map((n) => place(`L${n}`));
    expect((await resolvePlaces(places, { routing }))[3]).toMatchObject({ status: 'ok' });
    const lats2 = [35, 35, 35, 36.36];
    const s2 = service(async (q) => [geo(lats2[Number(q.slice(1, 2))])]);
    const r2 = await resolvePlaces(places, { routing: s2.routing });
    expect(r2[3]).toMatchObject({ status: 'far', lat: null, lon: null });
  });

  it('quota en cours de route : les suivants sont indisponibles et plus aucun appel', async () => {
    const { routing, calls } = service(async (_q, _f, n) => {
      if (n === 5) throw new RoutingError('QUOTA', 'quota');
      return [geo(35)];
    });
    const r = await resolvePlaces(Array.from({ length: 10 }, (_, i) => place(`L${i}`)), { routing });
    expect(r.slice(0, 4).every((x) => x.status === 'ok')).toBe(true);
    expect(r.slice(4).every((x) => x.status === 'unavailable')).toBe(true);
    expect(calls.length).toBeLessThanOrEqual(8);
  });

  it('au plus 4 appels simultanés, doublons dédoublonnés', async () => {
    const s = service(async () => [geo(35)]);
    await resolvePlaces(Array.from({ length: 12 }, (_, i) => place(`L${i}`)), { routing: s.routing });
    expect(s.max()).toBeLessThanOrEqual(4);
    const d = service(async () => [geo(35)]);
    await resolvePlaces([place('A'), place('A'), place('A')], { routing: d.routing });
    expect(d.calls.length).toBe(1);
  });

  it('le deuxième lot reçoit un point de proximité, pas le premier', async () => {
    const { routing, calls } = service(async () => [geo(35.5, 135.5)]);
    await resolvePlaces(Array.from({ length: 6 }, (_, i) => place(`L${i}`)), { routing });
    expect(calls.slice(0, 4).every((c) => c.focus === undefined)).toBe(true);
    expect(calls[4].focus).toEqual({ lat: 35.5, lon: 135.5 });
  });

  it('liste vide et tous introuvables', async () => {
    const { routing, calls } = service(async () => []);
    expect(await resolvePlaces([], { routing })).toEqual([]);
    expect(calls.length).toBe(0);
    const r = await resolvePlaces([place('a'), place('b')], { routing });
    expect(r.map((x) => x.status)).toEqual(['not_found', 'not_found']);
  });

  it('haversine', () => {
    expect(haversineKm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(111.19, 1);
  });

  it('choisit un autre candidat proche du centre quand le premier est loin', async () => {
    const { routing } = service(async (q) => (q.startsWith('L3') ? [geo(48.8, 2.3), geo(35.05)] : [geo(35)]));
    const r = await resolvePlaces([0, 1, 2, 3].map((n) => place(`L${n}`)), { routing });
    expect(r[3]).toMatchObject({ status: 'ok', lat: 35.05 });
  });

  it('garde un lieu lointain légitime si le pays demandé figure dans l’adresse', async () => {
    const { routing } = service(async (q) => (q.startsWith('L3') ? [geo(43.6, 1.36, 'Aéroport, Blagnac, France')] : [geo(14.7, -17.4)]));
    const places = [0, 1, 2].map((n) => place(`L${n}`));
    places.push({ name: 'L3', city: 'Blagnac', country: 'France' });
    const r = await resolvePlaces(places, { routing });
    expect(r[3]).toMatchObject({ status: 'ok', lat: 43.6 });
  });
});
