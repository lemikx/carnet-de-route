import { describe, expect, it } from 'vitest';
import { buildSearchUrl, isFreeLicense, parseSearchResponse, searchFreePhotos } from './commonsPhotos';

const page = (license: string, artist = '<a href="x">Jane</a>') => ({
  title: 'File:Belem.jpg',
  imageinfo: [{
    url: 'https://upload.example/belem.jpg',
    thumburl: 'https://upload.example/thumb/belem.jpg',
    descriptionurl: 'https://commons.example/File:Belem.jpg',
    extmetadata: {
      LicenseShortName: { value: license },
      Artist: { value: artist },
      LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' },
    },
  }],
});

describe('isFreeLicense', () => {
  it('accepte CC0, domaine public et CC BY(-SA)', () => {
    expect(isFreeLicense('CC0')).toBe(true);
    expect(isFreeLicense('Public domain')).toBe(true);
    expect(isFreeLicense('CC BY-SA 4.0')).toBe(true);
    expect(isFreeLicense('CC-BY-2.0')).toBe(true);
  });
  it('refuse les licences non commerciales, sans dérivés ou inconnues', () => {
    expect(isFreeLicense('CC BY-NC 4.0')).toBe(false);
    expect(isFreeLicense('CC BY-ND 4.0')).toBe(false);
    expect(isFreeLicense('All rights reserved')).toBe(false);
    expect(isFreeLicense('')).toBe(false);
  });
});

describe('parseSearchResponse', () => {
  it('garde les photos libres et nettoie le nom de l’auteur', () => {
    const photos = parseSearchResponse({ query: { pages: { '1': page('CC BY-SA 4.0'), '2': page('CC BY-NC 4.0') } } });
    expect(photos).toHaveLength(1);
    expect(photos[0]).toMatchObject({ title: 'Belem.jpg', author: 'Jane', license: 'CC BY-SA 4.0' });
  });
  it('ignore les réponses vides ou incomplètes', () => {
    expect(parseSearchResponse({})).toEqual([]);
    expect(parseSearchResponse({ query: { pages: { '1': { title: 'File:x' } } } })).toEqual([]);
  });
});

describe('searchFreePhotos', () => {
  it('interroge l’API Commons avec la requête et renvoie les photos libres', async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      return { ok: true, status: 200, json: async () => ({ query: { pages: { '1': page('CC0') } } }) };
    };
    const photos = await searchFreePhotos(' Belém ', { fetchImpl, limit: 3 });
    expect(calls[0]).toContain('gsrsearch=Bel%C3%A9m');
    expect(calls[0]).toContain('gsrlimit=3');
    expect(photos).toHaveLength(1);
  });
  it('renvoie une liste vide sans requête', async () => {
    expect(await searchFreePhotos('   ')).toEqual([]);
  });
  it('signale une erreur HTTP', async () => {
    const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
    await expect(searchFreePhotos('Sintra', { fetchImpl })).rejects.toThrow('503');
  });
  it('construit une URL avec origin=* pour les requêtes navigateur', () => {
    expect(buildSearchUrl('Alfama', 5)).toContain('origin=*');
  });
});
