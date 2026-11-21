// Recherche de photos libres de droits sur Wikimedia Commons (API publique, sans clé).
// Seules les photos dont la licence est libre (CC0, domaine public, CC BY, CC BY-SA) sont retenues.

export interface CommonsPhoto {
  title: string;
  imageUrl: string;
  thumbUrl: string;
  pageUrl: string;
  author: string;
  license: string;
  licenseUrl: string | null;
}

type FetchLike = (input: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const API = 'https://commons.wikimedia.org/w/api.php';

const FREE_LICENSE = /^(CC0|Public domain|PD-|CC BY(-SA)?(\s|$)|CC-BY(-SA)?(-\d\.\d)?$)/i;

export function isFreeLicense(shortName: string): boolean {
  const name = shortName.trim();
  if (!name) return false;
  if (/non-?commercial|NC|no derivatives|ND/i.test(name)) return false;
  return FREE_LICENSE.test(name);
}

export function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

export function buildSearchUrl(query: string, limit: number): string {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrnamespace: '6',
    gsrsearch: `${query} filetype:bitmap`,
    gsrlimit: String(limit),
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|mime',
    iiurlwidth: '800',
    format: 'json',
    origin: '*',
  });
  return `${API}?${params.toString()}`;
}

interface CommonsPage {
  title?: string;
  imageinfo?: Array<{
    url?: string;
    mime?: string;
    thumburl?: string;
    descriptionurl?: string;
    extmetadata?: Record<string, { value?: string } | undefined>;
  }>;
}

const PHOTO_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const NON_PHOTO_TITLE = /\.(pdf|djvu|tiff?|svg)$/i;

export function parseSearchResponse(body: unknown): CommonsPhoto[] {
  const pages = (body as { query?: { pages?: Record<string, CommonsPage> } })?.query?.pages ?? {};
  const photos: CommonsPhoto[] = [];
  for (const page of Object.values(pages)) {
    const info = page.imageinfo?.[0];
    if (!info?.url || !info.thumburl || !info.descriptionurl) continue;
    if (!info.mime || !PHOTO_MIMES.has(info.mime.toLowerCase())) continue;
    if (NON_PHOTO_TITLE.test((page.title ?? '').trim())) continue;
    const meta = info.extmetadata ?? {};
    const license = meta.LicenseShortName?.value ?? '';
    if (!isFreeLicense(license)) continue;
    photos.push({
      title: (page.title ?? '').replace(/^File:/, ''),
      imageUrl: info.url,
      thumbUrl: info.thumburl,
      pageUrl: info.descriptionurl,
      author: stripHtml(meta.Artist?.value ?? '') || 'Auteur inconnu',
      license,
      licenseUrl: meta.LicenseUrl?.value ?? null,
    });
  }
  return photos;
}

export async function searchFreePhotos(
  query: string,
  options: { limit?: number; fetchImpl?: FetchLike } = {},
): Promise<CommonsPhoto[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const fetchImpl: FetchLike = options.fetchImpl ?? ((url) => fetch(url));
  const response = await fetchImpl(buildSearchUrl(trimmed, options.limit ?? 5));
  if (!response.ok) throw new Error(`Wikimedia Commons : erreur ${response.status}`);
  return parseSearchResponse(await response.json());
}
