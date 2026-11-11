import { createFakeFx } from './fakeFx';
import { FxError } from './FxService';
import { createFrankfurterFx } from './frankfurterFx';
import type { KeyValueStore } from '../offline/cachedRepository';

function mapStore(): KeyValueStore {
  const m = new Map<string, unknown>();
  return { get: async (k) => m.get(k), set: async (k, v) => void m.set(k, v) };
}
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('createFrankfurterFx', () => {
  it('ne contacte personne pour l’euro', async () => {
    const f = vi.fn();
    expect(await createFrankfurterFx(f as unknown as typeof fetch, mapStore()).getRate('EUR')).toMatchObject({ rate: 1, stale: false });
    expect(f).not.toHaveBeenCalled();
  });

  it('lit le taux du jour', async () => {
    const f = vi.fn(() => json({ date: '2026-11-11', rates: { EUR: 0.0061 } }));
    const r = await createFrankfurterFx(f as unknown as typeof fetch, mapStore()).getRate('JPY');
    expect(r).toEqual({ currency: 'JPY', rate: 0.0061, date: '2026-11-11', stale: false });
    const url = String((f.mock.calls[0] as unknown[])[0]);
    expect(url).toContain('base=JPY');
    expect(url).toContain('symbols=EUR');
    expect(url).toContain('/latest');
  });

  it('lit le taux d’une date donnée', async () => {
    const f = vi.fn(() => json({ date: '2026-12-01', rates: { EUR: 0.006 } }));
    await createFrankfurterFx(f as unknown as typeof fetch, mapStore()).getRate('JPY', '2026-12-01');
    expect(String((f.mock.calls[0] as unknown[])[0])).toContain('/2026-12-01');
  });

  it('retombe sur la copie en cache quand le réseau échoue', async () => {
    const store = mapStore();
    await createFrankfurterFx((() => json({ date: '2026-11-11', rates: { EUR: 0.0061 } })) as unknown as typeof fetch, store).getRate('JPY');
    const offline = createFrankfurterFx((() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch, store);
    expect(await offline.getRate('JPY')).toMatchObject({ rate: 0.0061, stale: true });
  });

  it('signale un service indisponible sans cache', async () => {
    const fx = createFrankfurterFx((() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch, mapStore());
    await expect(fx.getRate('JPY')).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(fx.getRate('JPY')).rejects.toBeInstanceOf(FxError);
  });

  it('signale une devise non gérée', async () => {
    const fx = createFrankfurterFx((() => json({ message: 'not found' }, 404)) as unknown as typeof fetch, mapStore());
    await expect(fx.getRate('XXX')).rejects.toMatchObject({ code: 'UNSUPPORTED' });
  });

  it('liste les devises', async () => {
    const fx = createFrankfurterFx((() => json({ USD: 'United States Dollar', JPY: 'Japanese Yen' })) as unknown as typeof fetch, mapStore());
    expect(await fx.listCurrencies()).toEqual(['EUR', 'JPY', 'USD']);
  });
});

describe('createFakeFx', () => {
  it('renvoie des taux fixes et refuse les devises inconnues', async () => {
    const fx = createFakeFx();
    expect(await fx.getRate('JPY')).toMatchObject({ rate: 0.0061, stale: false });
    expect(await fx.getRate('EUR')).toMatchObject({ rate: 1 });
    await expect(fx.getRate('XXX')).rejects.toMatchObject({ code: 'UNSUPPORTED' });
    expect(await fx.listCurrencies()).toContain('USD');
  });
});

describe('repli sur le dernier taux connu', () => {
  it('réutilise le taux « latest » pour une dépense à une autre date quand le service est injoignable', async () => {
    const store = mapStore();
    await createFrankfurterFx((() => json({ date: '2026-11-10', rates: { EUR: 0.0061 } })) as unknown as typeof fetch, store).getRate('JPY');
    const down = createFrankfurterFx((() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch, store);
    expect(await down.getRate('JPY', '2026-12-01')).toMatchObject({ rate: 0.0061, stale: true, date: '2026-11-10' });
  });
  it('abandonne une requête qui ne répond pas', async () => {
    const hang = ((_u: string, init?: RequestInit) => new Promise((_r, rej) => init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))))) as unknown as typeof fetch;
    const fx = createFrankfurterFx(hang, mapStore(), 20);
    await expect(fx.getRate('JPY')).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
});
