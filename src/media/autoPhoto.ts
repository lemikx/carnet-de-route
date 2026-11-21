import type { StopKind } from '../domain/types';
import { searchFreePhotos, type CommonsPhoto } from './commonsPhotos';

export interface StopPhoto {
  photoUrl: string;
  photoCredit: string;
  photoLicense: string;
  photoLicenseUrl: string | null;
}

function addressParts(address: string): string[] {
  return address.split(',').map((p) => p.trim()).filter(Boolean);
}

/** Ville d'une adresse : avant-dernier morceau si ≥ 3 morceaux, premier morceau si 2, sinon ''. */
export function cityOf(address: string): string {
  const parts = addressParts(address);
  if (parts.length >= 3) return parts[parts.length - 2];
  if (parts.length === 2) return parts[0];
  return '';
}

/** Pays d'une adresse : dernier morceau quand il y en a au moins 2, sinon ''. */
export function countryOf(address: string): string {
  const parts = addressParts(address);
  return parts.length >= 2 ? parts[parts.length - 1] : '';
}

/** Requête de recherche : nom du lieu + ville (sauf si le nom contient déjà la ville). */
export function photoQuery(title: string, address: string): string {
  const t = title.trim();
  const city = cityOf(address);
  const withCity = city && !t.toLowerCase().includes(city.toLowerCase()) ? city : '';
  return [t, withCity].filter(Boolean).join(' ');
}

export function toStopPhoto(p: CommonsPhoto): StopPhoto {
  return { photoUrl: p.thumbUrl, photoCredit: `${p.author} (${p.pageUrl})`, photoLicense: p.license, photoLicenseUrl: p.licenseUrl };
}

const TRANSPORT_START = /^(vol|trajet|depart|retour|transfert|prise de la voiture|rendu de la voiture|arrivee a l'aeroport)(?![a-z])/;

/** Étape de transport (vol, trajet, retour...) : aucune photo automatique n'a de sens. */
export function isTransportStop(title: string): boolean {
  const t = title.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'");
  return TRANSPORT_START.test(t);
}

/** Photo déjà enregistrée qui est en fait un document (PDF, DjVu). */
export function isBadPhotoUrl(url: string | null | undefined): boolean {
  return !!url && /\.(pdf|djvu)/i.test(url);
}

/** Requêtes à essayer, dans l'ordre, sans vide ni doublon. */
function photoQueries(title: string, address: string, kind?: StopKind): string[] {
  const city = cityOf(address);
  const country = countryOf(address);
  const t = title.trim();
  const cityCountry = country && country.toLowerCase() !== city.toLowerCase() ? `${city} ${country}` : city;
  const raw = kind === 'lodging'
    ? (city ? [cityCountry, city] : [])
    : [photoQuery(t, address), t, cityCountry, city];
  const out: string[] = [];
  for (const q of raw) {
    const n = q.trim().replace(/\s+/g, ' ');
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

/** Première photo libre trouvée pour une étape, ou null (jamais d'erreur : l'automatique ne doit rien bloquer). */
export async function findPhotoForStop(
  title: string, address: string, search: typeof searchFreePhotos = searchFreePhotos, kind?: StopKind,
): Promise<StopPhoto | null> {
  try {
    if (isTransportStop(title)) return null;
    for (const query of photoQueries(title, address, kind)) {
      const photos = await search(query, { limit: 3 });
      if (photos.length) return toStopPhoto(photos[0]);
    }
    return null;
  } catch {
    return null;
  }
}
