import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { plannedItems, tripDays, type PlannedItem } from '../../domain/budget/planned';
import { computeBudget, type BudgetSummary } from '../../domain/budget/projection';
import { settingsOf, type BudgetData } from '../../domain/budget/types';
import type { TripBundle } from '../../domain/types';
import { createBudgetService, type BudgetService } from '../../services/budgetService';

export interface UseBudget {
  data: BudgetData | null;
  summary: BudgetSummary | null;
  items: PlannedItem[];
  missingRates: string[];
  loading: boolean;
  error: boolean;
  reload(): Promise<void>;
  service: BudgetService;
}

/** Charge le budget d'un voyage, rafraîchit les taux et calcule le résumé. */
export function useBudget(bundle: TripBundle): UseBudget {
  const { repo, fx } = useApp();
  const service = useMemo(() => createBudgetService(repo, fx), [repo, fx]);
  const [data, setData] = useState<BudgetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reservationRates, setReservationRates] = useState<{ rates: Record<string, number>; missing: string[] }>({ rates: {}, missing: [] });
  const tripId = bundle.trip.id;

  const reload = useCallback(async () => {
    try {
      setData(await repo.getBudget(tripId));
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [repo, tripId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await reload();
      try {
        if ((await service.refreshRates(tripId)).length > 0 && !cancelled) await reload();
      } catch {
        /* hors ligne ou service injoignable : taux déjà connus */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reload, service, tripId]);

  const reservationKey = bundle.reservations.map((r) => `${r.id}:${r.price}:${r.currency}`).join('|');
  useEffect(() => {
    let cancelled = false;
    service.reservationRates(bundle.reservations).then((r) => !cancelled && setReservationRates(r), () => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, reservationKey]);

  const settings = settingsOf(bundle.trip);
  const travelers = data?.travelers.length ?? 0;
  const days = tripDays(bundle.trip);
  const items = useMemo(
    () => (data ? plannedItems({ lines: data.lines, reservations: bundle.reservations, travelers, days, marginPct: settings.fxMarginPct, reservationRates: reservationRates.rates }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, bundle.reservations, travelers, days, settings.fxMarginPct, reservationRates],
  );
  const summary = useMemo(
    () => (data ? computeBudget({ items, expenses: data.expenses, settings, travelers }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, items, settings.cap, settings.capMode, settings.fxMarginPct, travelers],
  );

  return { data, summary, items, missingRates: reservationRates.missing, loading, error, reload, service };
}
