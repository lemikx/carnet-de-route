import { useState } from 'react';
import { formatEur } from '../../domain/budget/money';
import { useOnline } from '../../offline/useOnline';
import type { TripTabProps } from '../trip/types';
import { ExpensesList } from './ExpensesList';
import { LinesPanel } from './LinesPanel';
import { SettingsPanel } from './SettingsPanel';
import { TravelersSetup } from './TravelersSetup';
import { useBudget } from './useBudget';

export function BudgetTab({ bundle, reload }: TripTabProps) {
  const online = useOnline();
  const budget = useBudget(bundle);
  const [setupError, setSetupError] = useState(false);
  const { data, summary } = budget;

  if (budget.loading && !data) return <p className="muted">Chargement…</p>;
  if (budget.error || !data || !summary) return <p role="alert" className="save-error">Impossible de charger le budget.</p>;

  if (data.travelers.length === 0) {
    return (
      <>
        <TravelersSetup
          disabled={!online}
          onCreate={async (names) => {
            setSetupError(false);
            try {
              for (const name of names) await budget.service.ensureTraveler(bundle.trip.id, name);
              await budget.reload();
            } catch {
              setSetupError(true);
            }
          }}
        />
        {setupError && <p role="alert" className="save-error">Enregistrement impossible.</p>}
      </>
    );
  }

  return (
    <div>
      <p data-testid="planned-total"><strong>Prévu : {formatEur(summary.plannedCents)}</strong></p>
      <LinesPanel
        tripId={bundle.trip.id}
        data={data}
        items={budget.items}
        reservations={bundle.reservations}
        disabled={!online}
        onChange={budget.reload}
      />
      <ExpensesList
        tripId={bundle.trip.id}
        data={data}
        reservations={bundle.reservations}
        localCurrency={bundle.trip.localCurrency}
        disabled={!online}
        onChange={budget.reload}
      />
      <SettingsPanel
        trip={bundle.trip}
        data={data}
        disabled={!online}
        onChanged={async () => {
          await reload();
          await budget.reload();
        }}
      />
    </div>
  );
}
