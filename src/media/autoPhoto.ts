import { searchFreePhotos, type CommonsPhoto } from './commonsPhotos';

export interface StopPhoto {
  photoUrl: string;
  photoCredit: string;
  photoLicense: string;
  photoLicenseUrl: string | null;
}

/** Requête de recherche : nom du lieu + ville (deuxième morceau de l'adresse, si elle existe). */
export function photoQuery(title: string, address: string): string {
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  const city = parts.length > 1 ? parts[1] : '';
  return [title.trim(), city].filter(Boolean).join(' ');
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

/** Première photo libre trouvée pour une étape, ou null (jamais d'erreur : l'automatique ne doit rien bloquer). */
export async function findPhotoForStop(
  title: string, address: string, search: typeof searchFreePhotos = searchFreePhotos,
): Promise<StopPhoto | null> {
  if (isTransportStop(title)) return null;
  try {
    const query = photoQuery(title, address);
    let photos = await search(query, { limit: 3 });
    if (photos.length === 0 && title.trim() && query !== title.trim()) photos = await search(title.trim(), { limit: 3 });
    return photos.length ? toStopPhoto(photos[0]) : null;
  } catch {
    return null;
  }
}
