import { FxError, type FxService } from './FxService';

export const FAKE_RATES: Record<string, number> = { JPY: 0.0061, USD: 0.92, GBP: 1.17, CHF: 1.04 };

/** Taux fixes pour les tests et le mode hors Internet. */
export function createFakeFx(rates: Record<string, number> = FAKE_RATES): FxService {
  return {
    async getRate(currency, date) {
      const today = date ?? new Date().toISOString().slice(0, 10);
      if (currency === 'EUR') return { currency, rate: 1, date: today, stale: false };
      const rate = rates[currency];
      if (rate === undefined) throw new FxError('UNSUPPORTED', `Devise non gérée : ${currency}`);
      return { currency, rate, date: today, stale: false };
    },
    async listCurrencies() {
      return ['EUR', ...Object.keys(rates)].sort();
    },
  };
}
