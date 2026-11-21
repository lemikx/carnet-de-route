import { describe, expect, it } from 'vitest';
import { findPhotoForStop, photoQuery } from './autoPhoto';

const photo = { title: 'a.jpg', imageUrl: 'i', thumbUrl: 't', pageUrl: 'p', author: 'Jane', license: 'CC0', licenseUrl: null };

describe('photoQuery', () => {
  it('ajoute la ville quand l’adresse en contient une', () => {
    expect(photoQuery('Jardin Majorelle', 'Jardin Majorelle, Marrakech, Maroc')).toBe('Jardin Majorelle Marrakech');
    expect(photoQuery('Gare', '')).toBe('Gare');
  });
});

describe('findPhotoForStop', () => {
  it('prend la première photo libre', async () => {
    const r = await findPhotoForStop('Belém', 'Belém, Lisbonne', async () => [photo]);
    expect(r).toEqual({ photoUrl: 't', photoCredit: 'Jane (p)', photoLicense: 'CC0', photoLicenseUrl: null });
  });
  it('réessaie avec le nom seul si rien n’est trouvé', async () => {
    const queries: string[] = [];
    const r = await findPhotoForStop('Belém', 'Belém, Lisbonne', async (q) => { queries.push(q); return queries.length === 2 ? [photo] : []; });
    expect(queries).toEqual(['Belém Lisbonne', 'Belém']);
    expect(r).not.toBeNull();
  });
  it('renvoie null sans erreur si la recherche échoue', async () => {
    expect(await findPhotoForStop('X', 'X, Y', async () => { throw new Error('réseau'); })).toBeNull();
  });
});
