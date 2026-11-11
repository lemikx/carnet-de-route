export interface FxRate {
  currency: string;
  /** Valeur d'une unité de la devise, en euros. */
  rate: number;
  date: string;
  /** Vrai si le taux vient de la copie locale parce que le service était injoignable. */
  stale: boolean;
}

export class FxError extends Error {
  constructor(public code: 'UNAVAILABLE' | 'UNSUPPORTED', message?: string) {
    super(message ?? code);
    this.name = 'FxError';
  }
}

export interface FxService {
  getRate(currency: string, date?: string): Promise<FxRate>;
  listCurrencies(): Promise<string[]>;
}
