import { describe, expect, it } from 'vitest';
import { makeStop } from '../test/factories';
import type { Stop } from '../domain/types';
import type { StopPhoto } from './autoPhoto';
import { fillMissingPhotos } from './fillMissingPhotos';

const photo = (n: string): StopPhoto => ({ photoUrl: `u-${n}`, photoCredit: 'a', photoLicense: 'CC', photoLicenseUrl: null });

function setup(stops: Stop[], find: (s: Stop) => Promise<StopPhoto | null>, save?: (s: Stop, p: StopPhoto | null) => Promise<void>) {
  const saved: string[] = [];
  const tried: string[] = [];
  const opts = {
    stopIds: stops.map((s) => s.id),
    getStop: async (id: string) => stops.find((s) => s.id === id) ?? null,
    find,
    save: save ?? (async (s: Stop) => { saved.push(s.id); }),
    isCancelled: () => false,
    onAttempt: (id: string) => { tried.push(id); },
  };
  return { opts, saved, tried };
}

describe('fillMissingPhotos', () => {
  it('continue après une étape sans photo trouvée', async () => {
    const stops = [makeStop({ id: 'A', title: 'A' }), makeStop({ id: 'B', title: 'B' })];
    const { opts, saved, tried } = setup(stops, async (s) => (s.id === 'A' ? null : photo('B')));
    await fillMissingPhotos(opts);
    expect(saved).toEqual(['B']);
    expect(tried).toEqual(['A', 'B']);
  });

  it('ignore hébergements, titres vides et étapes déjà illustrées', async () => {
    const stops = [
      makeStop({ id: 'L', title: 'Hôtel', kind: 'lodging' }),
      makeStop({ id: 'E', title: '  ' }),
      makeStop({ id: 'P', title: 'Déjà', photoUrl: 'x' }),
      makeStop({ id: 'OK', title: 'Temple' }),
    ];
    const searched: string[] = [];
    const { opts, saved } = setup(stops, async (s) => { searched.push(s.id); return photo(s.id); });
    await fillMissingPhotos(opts);
    expect(searched).toEqual(['OK']);
    expect(saved).toEqual(['OK']);
  });

  it("s'arrête quand isCancelled renvoie vrai", async () => {
    const stops = [makeStop({ id: 'A', title: 'A' }), makeStop({ id: 'B', title: 'B' }), makeStop({ id: 'C', title: 'C' })];
    let calls = 0;
    const { opts, saved, tried } = setup(stops, async () => { calls += 1; return photo('x'); });
    opts.isCancelled = () => calls >= 1;
    await fillMissingPhotos(opts);
    expect(calls).toBe(1);
    expect(saved).toEqual([]);
    expect(tried).toEqual([]);
  });

  it("une erreur d'enregistrement n'arrête pas les autres étapes", async () => {
    const stops = [makeStop({ id: 'A', title: 'A' }), makeStop({ id: 'B', title: 'B' })];
    const saved: string[] = [];
    const { opts, tried } = setup(stops, async (s) => photo(s.id), async (s) => {
      if (s.id === 'A') throw new Error('échec');
      saved.push(s.id);
    });
    await fillMissingPhotos(opts);
    expect(saved).toEqual(['B']);
    expect(tried).toEqual(['A', 'B']);
  });

  it('remplace une photo PDF par une nouvelle photo', async () => {
    const stops = [makeStop({ id: 'P', title: 'Temple', photoUrl: 'https://x/Catalog.pdf/page1-800px-Catalog.pdf.jpg' })];
    const calls: Array<[string, string | null]> = [];
    const { opts } = setup(stops, async () => photo('new'), async (s, p) => { calls.push([s.id, p ? p.photoUrl : null]); });
    await fillMissingPhotos(opts);
    expect(calls).toEqual([['P', null], ['P', 'u-new']]);
  });

  it('efface la photo d’une étape de transport sans la rechercher', async () => {
    const stops = [makeStop({ id: 'V', title: 'Vol Bangkok - Toulouse', photoUrl: 'https://x/ok.jpg' })];
    const calls: Array<[string, string | null]> = [];
    let searched = 0;
    const { opts, tried } = setup(stops, async () => { searched += 1; return photo('x'); }, async (s, p) => { calls.push([s.id, p ? p.photoUrl : null]); });
    await fillMissingPhotos(opts);
    expect(calls).toEqual([['V', null]]);
    expect(searched).toBe(0);
    expect(tried).toEqual(['V']);
  });
});
