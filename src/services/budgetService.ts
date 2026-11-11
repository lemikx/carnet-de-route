import type { Advice } from '../domain/budget/advice';
import { settingsOf, type BudgetLine, type Traveler } from '../domain/budget/types';
import type { Reservation } from '../domain/types';
import { FxError, type FxService } from '../fx/FxService';
import type { TripRepository } from '../data/TripRepository';

export type NewExpenseRate = { rateToEur: number; manual: false; stale?: boolean; date?: string } | { error: 'UNAVAILABLE' | 'UNSUPPORTED' };

export interface BudgetService {
  ensureTraveler(tripId: string, name: string): Promise<Traveler>;
  /** Crée les voyageurs qui n'existent pas encore (réessayer ne crée jamais de doublon). */
  ensureTravelers(tripId: string, names: string[]): Promise<Traveler[]>;
  addUsualLines(tripId: string): Promise<BudgetLine[]>;
  /** Met à jour les lignes en devise étrangère, non manuelles, dont le taux n'est pas d'aujourd'hui ; renvoie celles qui ont changé. */
  refreshRates(tripId: string): Promise<BudgetLine[]>;
  reservationRates(reservations: Reservation[]): Promise<{ rates: Record<string, number>; missing: string[] }>;
  newExpenseRate(currency: string, date: string): Promise<NewExpenseRate>;
  applyAdvice(tripId: string, advice: Advice): Promise<void>;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Position libre suivante (jamais deux voyageurs à la même place, même après une suppression). */
export const nextPosition = (items: { position: number }[]) => items.reduce((m, i) => Math.max(m, i.position), -1) + 1;

const USUAL_LINES = [
  { category: 'food', label: 'Repas', mode: 'per_person_per_day' },
  { category: 'local_transport', label: 'Transports sur place', mode: 'per_person_per_day' },
  { category: 'activity', label: 'Activités', mode: 'per_person' },
  { category: 'contingency', label: 'Imprévus', mode: 'fixed' },
] as const;

export function createBudgetService(repo: TripRepository, fx: FxService): BudgetService {
  return {
    async ensureTraveler(tripId, name) {
      const { travelers } = await repo.getBudget(tripId);
      return repo.saveTraveler({ tripId, name: name.trim(), position: nextPosition(travelers) });
    },

    async ensureTravelers(tripId, names) {
      const out: Traveler[] = [];
      for (const name of names.map((n) => n.trim()).filter(Boolean)) {
        const { travelers } = await repo.getBudget(tripId);
        const existing = travelers.find((t) => t.name === name);
        out.push(existing ?? (await repo.saveTraveler({ tripId, name, position: nextPosition(travelers) })));
      }
      return out;
    },

    async addUsualLines(tripId) {
      const { lines } = await repo.getBudget(tripId);
      const created: BudgetLine[] = [];
      for (const [i, u] of USUAL_LINES.entries()) {
        created.push(await repo.saveBudgetLine({
          tripId, ...u, amount: 0, currency: 'EUR', position: lines.length + i, rateToEur: 1, rateManual: false, rateDate: today(),
        }));
      }
      return created;
    },

    async refreshRates(tripId) {
      const { lines } = await repo.getBudget(tripId);
      const updated: BudgetLine[] = [];
      for (const line of lines) {
        if (line.currency === 'EUR' || line.rateManual || line.rateDate >= today()) continue;
        try {
          const r = await fx.getRate(line.currency);
          // On garde la date de VÉRIFICATION : la date publiée par le service est parfois celle de la veille.
          updated.push(await repo.saveBudgetLine({ ...line, rateToEur: r.rate, rateDate: today() }));
        } catch {
          /* service injoignable : on garde le taux connu */
        }
      }
      return updated;
    },

    async reservationRates(reservations) {
      const currencies = [...new Set(reservations.filter((r) => r.price !== null && r.currency && r.currency !== 'EUR').map((r) => r.currency))];
      const rates: Record<string, number> = {};
      const missing: string[] = [];
      for (const c of currencies) {
        try {
          rates[c] = (await fx.getRate(c)).rate;
        } catch {
          missing.push(c);
        }
      }
      return { rates, missing: missing.sort() };
    },

    async newExpenseRate(currency, date) {
      try {
        // Une date à venir n'a pas encore de taux publié : on prend le dernier connu.
        const r = await fx.getRate(currency, date > today() ? undefined : date);
        return r.stale ? { rateToEur: r.rate, manual: false, stale: true, date: r.date } : { rateToEur: r.rate, manual: false };
      } catch (e) {
        return { error: e instanceof FxError && e.code === 'UNSUPPORTED' ? 'UNSUPPORTED' : 'UNAVAILABLE' };
      }
    },

    async applyAdvice(tripId, advice) {
      if (advice.kind === 'reduce_margin') {
        const { trip } = await repo.getBundle(tripId);
        await repo.updateBudgetSettings(tripId, { ...settingsOf(trip), fxMarginPct: advice.newMarginPct });
        return;
      }
      const { lines } = await repo.getBudget(tripId);
      const changes = advice.kind === 'proportional' ? advice.changes : [{ lineId: advice.lineId, newAmount: 0 }];
      for (const c of changes) {
        const line = lines.find((l) => l.id === c.lineId);
        if (line) await repo.saveBudgetLine({ ...line, amount: c.newAmount });
      }
    },
  };
}
