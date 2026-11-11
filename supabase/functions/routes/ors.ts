// Code partagé entre l'Edge Function (Deno) et les tests (Vitest) : aucune dépendance.
export type RoutingErrorCode = 'NOT_FOUND' | 'NO_ROUTE' | 'QUOTA' | 'NETWORK' | 'UNAUTHORIZED';
export type AutoMode = 'car' | 'walk' | 'bike';

export const ORS_BASE = 'https://api.openrouteservice.org';
export const ORS_PROFILES: Record<AutoMode, string> = { car: 'driving-car', walk: 'foot-walking', bike: 'cycling-regular' };

const NO_ROUTE_CODES = new Set([2004, 2009, 2010]);

export function mapOrsError(status: number, body: unknown): RoutingErrorCode {
  const code = (body as { error?: { code?: number } })?.error?.code;
  if (status === 429) return 'QUOTA';
  if (status === 404 || (typeof code === 'number' && NO_ROUTE_CODES.has(code))) return 'NO_ROUTE';
  if (status === 401 || status === 403) return 'UNAUTHORIZED';
  return 'NETWORK';
}

interface Feature {
  properties: Record<string, unknown>;
  geometry: { coordinates: unknown };
}

export function toRouteResult(geojson: { features: Feature[] }) {
  const f = geojson.features[0];
  const summary = f.properties.summary as { duration: number; distance: number };
  const coords = f.geometry.coordinates as [number, number][];
  return {
    durationMin: Math.ceil(summary.duration / 60),
    distanceKm: Math.round(summary.distance / 100) / 10,
    geometry: coords.map(([lon, lat]) => [lat, lon] as [number, number]),
  };
}

export function toGeocodeResults(geojson: { features: Feature[] }, tz: (lat: number, lon: number) => string) {
  return geojson.features.map((f) => {
    const [lon, lat] = f.geometry.coordinates as [number, number];
    return {
      label: String(f.properties.label ?? ''),
      lat,
      lon,
      country: String(f.properties.country_a ?? ''),
      timezone: tz(lat, lon),
    };
  });
}

export const ERROR_MESSAGES: Record<RoutingErrorCode, string> = {
  NOT_FOUND: 'Adresse introuvable',
  NO_ROUTE: 'Aucun trajet routier possible',
  QUOTA: 'Limite gratuite atteinte pour aujourd’hui',
  NETWORK: 'Service de calcul indisponible',
  UNAUTHORIZED: 'Accès refusé au service de calcul',
};

/** Traite une requête POST de l'appli. `fetchImpl` et `tz` sont injectés (Deno en production, simulés en test). */
export async function handleRoutes(
  req: Request,
  deps: { apiKey: string; fetchImpl: typeof fetch; tz: (lat: number, lon: number) => string },
): Promise<Response> {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ code: 'NETWORK', message: 'Méthode non autorisée' }, 405);

  let body: { action?: string; query?: string; from?: { lat: number; lon: number }; to?: { lat: number; lon: number }; mode?: AutoMode };
  try {
    body = await req.json();
  } catch {
    return json({ code: 'NETWORK', message: 'Requête invalide' }, 400);
  }

  let url: string;
  let init: RequestInit = { headers: { Authorization: deps.apiKey } };
  if (body.action === 'geocode' && body.query) {
    url = `${ORS_BASE}/geocode/search?text=${encodeURIComponent(body.query)}&size=5&lang=fr`;
  } else if (body.action === 'route' && body.from && body.to && body.mode && ORS_PROFILES[body.mode]) {
    url = `${ORS_BASE}/v2/directions/${ORS_PROFILES[body.mode]}/geojson`;
    init = {
      method: 'POST',
      headers: { Authorization: deps.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinates: [[body.from.lon, body.from.lat], [body.to.lon, body.to.lat]] }),
    };
  } else {
    return json({ code: 'NETWORK', message: 'Requête invalide' }, 400);
  }

  let res: Response;
  try {
    res = await deps.fetchImpl(url, init);
  } catch {
    return json({ code: 'NETWORK', message: ERROR_MESSAGES.NETWORK }, 502);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = mapOrsError(res.status, data);
    return json({ code, message: ERROR_MESSAGES[code] }, code === 'QUOTA' ? 429 : code === 'NO_ROUTE' ? 404 : 502);
  }
  return json(body.action === 'geocode' ? toGeocodeResults(data, deps.tz) : toRouteResult(data));
}

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
