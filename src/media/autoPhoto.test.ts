import { describe, expect, it } from 'vitest';
import { findPhotoForStop, isBadPhotoUrl, isTransportStop, photoQuery } from './autoPhoto';

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

describe('isTransportStop', () => {
  it('reconnaît les étapes de transport (casse et accents ignorés)', () => {
    for (const t of ['Vol Bangkok - Toulouse', '  trajet vers Chiang Mai', 'Départ de l\'hôtel', 'DEPART', 'Retour maison', 'Transfert aéroport',
      'Prise de la voiture', 'Rendu de la voiture', 'Arrivée à l\'aéroport', 'Arrivee a l\'aeroport']) expect(isTransportStop(t)).toBe(true);
  });
  it('ne confond pas avec les lieux', () => {
    for (const t of ['Volcan Etna', 'Temple Wat Pho', 'Retournement', 'Le vol des cigognes']) expect(isTransportStop(t)).toBe(false);
  });
  it('findPhotoForStop ne cherche rien pour un transport', async () => {
    let calls = 0;
    expect(await findPhotoForStop('Vol Bangkok - Toulouse', '', async () => { calls += 1; return []; })).toBeNull();
    expect(calls).toBe(0);
  });
});

describe('isBadPhotoUrl', () => {
  it('détecte PDF et DjVu', () => {
    expect(isBadPhotoUrl('https://x/page1-800px-Catalog.PDF.jpg')).toBe(true);
    expect(isBadPhotoUrl('https://x/a.djvu/page1.jpg')).toBe(true);
    expect(isBadPhotoUrl('https://x/a.jpg')).toBe(false);
    expect(isBadPhotoUrl(null)).toBe(false);
  });
});
