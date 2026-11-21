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

/** Première photo libre trouvée pour une étape, ou null (jamais d'erreur : l'automatique ne doit rien bloquer). */
export async function findPhotoForStop(
  title: string, address: string, search: typeof searchFreePhotos = searchFreePhotos,
): Promise<StopPhoto | null> {
  try {
    const query = photoQuery(title, address);
    let photos = await search(query, { limit: 3 });
    if (photos.length === 0 && title.trim() && query !== title.trim()) photos = await search(title.trim(), { limit: 3 });
    return photos.length ? toStopPhoto(photos[0]) : null;
  } catch {
    return null;
  }
}
