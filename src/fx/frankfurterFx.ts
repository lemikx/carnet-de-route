import type { KeyValueStore } from '../offline/cachedRepository';
import { FxError, type FxRate, type FxService } from './FxService';

// Adresses prises dans la spec (à vérifier dans la documentation publique de Frankfurter : non joignable depuis l'environnement de développement).
const BASE = 'https://api.frankfurter.dev/v1';

const TIMEOUT_MS = 5000;

export function createFrankfurterFx(fetchImpl: typeof fetch, store: KeyValueStore, timeoutMs = TIMEOUT_MS): FxService {
  /** Dernier taux connu : celui de la date demandée, sinon le plus récent déjà obtenu. */
  async function lastKnown(currency: string, cacheKey: string): Promise<FxRate | undefined> {
    for (const key of [cacheKey, `fx:${currency}:latest`]) {
      const cached = (await store.get(key).catch(() => undefined)) as FxRate | undefined;
      if (cached) return { ...cached, stale: true };
    }
    return undefined;
  }
  async function timedFetch(url: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    async getRate(currency, date) {
      if (currency === 'EUR') return { currency, rate: 1, date: date ?? new Date().toISOString().slice(0, 10), stale: false };
      const cacheKey = `fx:${currency}:${date ?? 'latest'}`;
      let res: Response;
      try {
        res = await timedFetch(`${BASE}/${date ?? 'latest'}?base=${encodeURIComponent(currency)}&symbols=EUR`);
      } catch {
        const known = await lastKnown(currency, cacheKey);
        if (known) return known;
        throw new FxError('UNAVAILABLE', 'Service de taux de change injoignable');
      }
      if (res.status === 404 || res.status === 422) throw new FxError('UNSUPPORTED', `Devise non gérée : ${currency}`);
      if (!res.ok) {
        const known = await lastKnown(currency, cacheKey);
        if (known) return known;
        throw new FxError('UNAVAILABLE', `Service de taux de change indisponible (${res.status})`);
      }
      const data = (await res.json()) as { date?: string; rates?: { EUR?: number } };
      const rate = data.rates?.EUR;
      if (typeof rate !== 'number' || !(rate > 0)) throw new FxError('UNSUPPORTED', `Pas de taux pour ${currency}`);
      const out: FxRate = { currency, rate, date: data.date ?? date ?? '', stale: false };
      await store.set(cacheKey, out).catch(() => {});
      return out;
    },
    async listCurrencies() {
      try {
        const res = await timedFetch(`${BASE}/currencies`);
        if (res.ok) return [...new Set(['EUR', ...Object.keys((await res.json()) as Record<string, string>)])].sort();
      } catch {
        /* liste de secours ci-dessous */
      }
      return FALLBACK_CURRENCIES;
    },
  };
}

export const FALLBACK_CURRENCIES = ['AUD', 'CAD', 'CHF', 'CNY', 'EUR', 'GBP', 'JPY', 'MAD', 'NOK', 'SEK', 'THB', 'TRY', 'USD'];
