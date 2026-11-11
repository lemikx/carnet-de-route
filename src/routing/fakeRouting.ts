import { RoutingError, type AutoMode, type GeocodeResult, type RoutingService } from './RoutingService';

const SPEED_KMH: Record<AutoMode, number> = { car: 70, walk: 5, bike: 15 };

const KNOWN: Record<string, GeocodeResult> = {
  paris: { label: 'Paris, France', lat: 48.8566, lon: 2.3522, country: 'FRA', timezone: 'Europe/Paris' },
  tokyo: { label: 'Tokyo, Japon', lat: 35.6762, lon: 139.6503, country: 'JPN', timezone: 'Asia/Tokyo' },
  kyoto: { label: 'Kyoto, Japon', lat: 35.0116, lon: 135.7681, country: 'JPN', timezone: 'Asia/Tokyo' },
  nara: { label: 'Nara, Japon', lat: 34.6851, lon: 135.8048, country: 'JPN', timezone: 'Asia/Tokyo' },
  osaka: { label: 'Osaka, Japon', lat: 34.6937, lon: 135.5023, country: 'JPN', timezone: 'Asia/Tokyo' },
};

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Service factice déterministe pour les tests et le mode démo (sans Internet). */
export function createFakeRouting(places: Record<string, GeocodeResult[]> = {}): RoutingService {
  return {
    async geocode(query) {
      const q = query.trim().toLowerCase();
      if (!q || q.includes('introuvable')) return [];
      if (places[q]) return places[q];
      const hit = Object.entries(KNOWN).filter(([k]) => q.includes(k)).map(([, v]) => ({ ...v, label: `${query} — ${v.label}` }));
      if (hit.length) return hit;
      // Adresse générique : position stable dérivée du texte, à Paris.
      let h = 0;
      for (const c of q) h = (h * 31 + c.charCodeAt(0)) % 10000;
      return [{ label: query, lat: 48.8 + h / 100000, lon: 2.3 + h / 100000, country: 'FRA', timezone: 'Europe/Paris' }];
    },
    async route(from, to, mode) {
      if (from.lat === 0 || to.lat === 0) throw new RoutingError('NO_ROUTE', 'Aucun trajet routier possible');
      const distanceKm = Math.round(haversineKm(from, to) * 1.3 * 10) / 10;
      return {
        distanceKm,
        durationMin: Math.max(1, Math.ceil((distanceKm / SPEED_KMH[mode]) * 60)),
        geometry: [[from.lat, from.lon], [to.lat, to.lon]],
      };
    },
  };
}
