import { describe, expect, it } from 'vitest';
import { findPhotoForStop, isBadPhotoUrl, cityOf, countryOf, isTransportStop, photoQuery } from './autoPhoto';

const photo = { title: 'a.jpg', imageUrl: 'i', thumbUrl: 't', pageUrl: 'p', author: 'Jane', license: 'CC0', licenseUrl: null };

describe('photoQuery', () => {
  it('ajoute la ville quand l’adresse en contient une', () => {
    expect(photoQuery('Jardin Majorelle', 'Jardin Majorelle, Marrakech, Maroc')).toBe('Jardin Majorelle Marrakech');
    expect(photoQuery('Gare', '')).toBe('Gare');
    expect(photoQuery('Zagora', 'Zagora, Maroc')).toBe('Zagora');
  });
});

describe('cityOf / countryOf', () => {
  it('extrait ville et pays', () => {
    expect(cityOf('Riad dans la médina de Marrakech (à choisir), Marrakech, Maroc')).toBe('Marrakech');
    expect(cityOf('Zagora, Zagora, Maroc')).toBe('Zagora');
    expect(cityOf('Zagora, Maroc')).toBe('Zagora');
    expect(cityOf('Zagora')).toBe('');
    expect(cityOf('')).toBe('');
    expect(countryOf('X, Marrakech, Maroc')).toBe('Maroc');
    expect(countryOf('Zagora, Maroc')).toBe('Maroc');
    expect(countryOf('Zagora')).toBe('');
    expect(countryOf('')).toBe('');
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
    expect(queries).toEqual(['Belém', 'Belém Lisbonne']);
    expect(r).not.toBeNull();
  });
  it('activité : titre+ville, titre, ville+pays, ville, jusqu’au premier résultat', async () => {
    const queries: string[] = [];
    const r = await findPhotoForStop('Balade à dos de dromadaire', 'Zagora, Zagora, Maroc', async (q) => { queries.push(q); return []; });
    expect(r).toBeNull();
    expect(queries).toEqual(['Balade à dos de dromadaire Zagora', 'Balade à dos de dromadaire', 'Zagora Maroc', 'Zagora']);
    const q2: string[] = [];
    const r2 = await findPhotoForStop('Balade à dos de dromadaire', 'Zagora, Zagora, Maroc', async (q) => { q2.push(q); return q === 'Zagora Maroc' ? [photo] : []; });
    expect(r2).not.toBeNull();
    expect(q2).toEqual(['Balade à dos de dromadaire Zagora', 'Balade à dos de dromadaire', 'Zagora Maroc']);
  });
  it('ignore les requêtes vides ou en double', async () => {
    const queries: string[] = [];
    await findPhotoForStop('Zagora', 'Zagora, Zagora', async (q) => { queries.push(q); return []; });
    expect(queries).toEqual(['Zagora']);
    const q2: string[] = [];
    await findPhotoForStop('Gare', '', async (q) => { q2.push(q); return []; });
    expect(q2).toEqual(['Gare']);
  });
  it('hébergement : photo de la ville (ville+pays puis ville)', async () => {
    const queries: string[] = [];
    const r = await findPhotoForStop('Hébergement à Marrakech (1re nuit)', 'Riad dans la médina de Marrakech (à choisir), Marrakech, Maroc',
      async (q) => { queries.push(q); return q === 'Marrakech' ? [photo] : []; }, 'lodging');
    expect(queries).toEqual(['Marrakech Maroc', 'Marrakech']);
    expect(r).not.toBeNull();
  });
  it('hébergement sans ville : null sans recherche', async () => {
    let calls = 0;
    expect(await findPhotoForStop('Hôtel', '', async () => { calls += 1; return [photo]; }, 'lodging')).toBeNull();
    expect(calls).toBe(0);
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
