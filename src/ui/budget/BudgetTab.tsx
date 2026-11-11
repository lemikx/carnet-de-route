import { useState } from 'react';
import { formatEur } from '../../domain/budget/money';
import { useOnline } from '../../offline/useOnline';
import type { TripTabProps } from '../trip/types';
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
