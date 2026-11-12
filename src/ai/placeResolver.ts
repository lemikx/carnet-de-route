import { RoutingError, type GeocodeResult, type LatLon, type RoutingService } from '../routing/RoutingService';
import type { ItineraryPlace } from './types';

export interface ResolvedPlace {
  status: 'ok' | 'not_found' | 'far' | 'unavailable';
  lat: number | null;
  lon: number | null;
  timezone: string | null;
  label: string | null;
}

const FAR_KM = 150;
const BATCH = 4;

export function haversineKm(a: LatLon, b: LatLon): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const plain = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const UNAVAILABLE: ResolvedPlace = { status: 'unavailable', lat: null, lon: null, timezone: null, label: null };
const NOT_FOUND: ResolvedPlace = { status: 'not_found', lat: null, lon: null, timezone: null, label: null };

export async function resolvePlaces(
  places: ItineraryPlace[],
  deps: { routing: RoutingService; onProgress?(done: number, total: number): void; concurrency?: number },
): Promise<ResolvedPlace[]> {
  const size = Math.min(deps.concurrency ?? BATCH, BATCH);
  const queryOf = (p: ItineraryPlace) => [p.name, p.city, p.country].map((s) => s.trim()).filter(Boolean).join(', ');
  const queries = places.map(queryOf);
  const unique = [...new Set(queries)];
  const results = new Map<string, ResolvedPlace>();
  const candidates = new Map<string, GeocodeResult[]>();
  const isoOf = (q: string) => candidates.get(q)?.[0]?.country ?? '';
  const countryOf = new Map(places.map((p, i) => [queries[i], p.country] as const));
  let done = 0;
  let broken = false;

  for (let i = 0; i < unique.length; i += size) {
    const batch = unique.slice(i, i + size);
    if (broken) {
      batch.forEach((q) => results.set(q, UNAVAILABLE));
      continue;
    }
    const placed = [...results.values()].filter((r) => r.lat !== null && r.lon !== null);
    const focus: LatLon | undefined = placed.length
      ? { lat: placed.reduce((s, r) => s + r.lat!, 0) / placed.length, lon: placed.reduce((s, r) => s + r.lon!, 0) / placed.length }
      : undefined;
    const out = await Promise.all(batch.map(async (q): Promise<ResolvedPlace | 'down'> => {
      if (!q) return NOT_FOUND;
      try {
        const found = await deps.routing.geocode(q, focus);
        const first = found[0];
        candidates.set(q, found);
        return first ? { status: 'ok', lat: first.lat, lon: first.lon, timezone: first.timezone, label: first.label } : NOT_FOUND;
      } catch (e) {
        if (e instanceof RoutingError && (e.code === 'QUOTA' || e.code === 'NETWORK' || e.code === 'UNAUTHORIZED')) return 'down';
        return NOT_FOUND;
      }
    }));
    out.forEach((r, k) => {
      if (r === 'down') broken = true;
      // Dès qu'un lieu du lot a échoué, tous les suivants sont considérés indisponibles.
      results.set(batch[k], broken || r === 'down' ? UNAVAILABLE : r);
    });
    done += batch.length;
    deps.onProgress?.(Math.min(done, unique.length), unique.length);
  }

  // Lieux trop éloignés des autres : on cherche un meilleur candidat près du centre ; à défaut, on les signale
  // sans coordonnées, sauf si le pays demandé figure dans l'adresse trouvée (ex. aéroport de départ à l'étranger).
  const placed = [...results.values()].filter((r) => r.status === 'ok');
  if (placed.length >= 2) {
    const tally = new Map<string, number>();
    for (const [q, r] of results) if (r.status === 'ok') tally.set(isoOf(q), (tally.get(isoOf(q)) ?? 0) + 1);
    const main = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    const center = { lat: median(placed.map((r) => r.lat!)), lon: median(placed.map((r) => r.lon!)) };
    for (const [q, r] of results) {
      if (r.status !== 'ok' || haversineKm(center, { lat: r.lat!, lon: r.lon! }) <= FAR_KM) continue;
      const near = (candidates.get(q) ?? []).find((c) => haversineKm(center, c) <= FAR_KM);
      if (near) {
        results.set(q, { status: 'ok', lat: near.lat, lon: near.lon, timezone: near.timezone, label: near.label });
        continue;
      }
      // Même pays que la majorité des lieux (circuit étalé) : on garde la position, mais on signale le lieu.
      if (main && isoOf(q) === main) {
        results.set(q, { ...r, status: 'far' });
        continue;
      }
      const country = plain(countryOf.get(q) ?? '').trim();
      const plausible = country !== '' && plain(r.label ?? '').includes(country);
      if (!plausible) results.set(q, { ...r, status: 'far', lat: null, lon: null });
    }
  }
  return queries.map((q) => results.get(q) ?? NOT_FOUND);
}
