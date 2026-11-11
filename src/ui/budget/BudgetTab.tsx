import { useMemo, useState } from 'react';
import { computeAdvice, type Advice } from '../../domain/budget/advice';
import { tripDays } from '../../domain/budget/planned';
import { settingsOf } from '../../domain/budget/types';
import { useOnline } from '../../offline/useOnline';
import { SaveError } from '../common/SaveError';
import type { TripTabProps } from '../trip/types';
import { AdvicePanel } from './AdvicePanel';
import { ExpensesList } from './ExpensesList';
import { LinesPanel } from './LinesPanel';
import { SettingsPanel } from './SettingsPanel';
import { SettlementPanel } from './SettlementPanel';
import { SummaryPanel } from './SummaryPanel';
import { TravelersSetup } from './TravelersSetup';
import { useBudget } from './useBudget';

export function BudgetTab({ bundle, reload }: TripTabProps) {
  const online = useOnline();
  const budget = useBudget(bundle);
  const [setupError, setSetupError] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const { data, summary, items } = budget;

  const advice = useMemo(
    () =>
      data && summary
        ? computeAdvice({ summary, items, lines: data.lines, settings: settingsOf(bundle.trip), travelers: data.travelers.length, days: tripDays(bundle.trip) })
        : [],
    [data, summary, items, bundle.trip],
  );

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

  const labelOf = (key: string) => items.find((i) => i.key === key)?.label ?? key;

  async function apply(a: Advice) {
    setApplyError(null);
    try {
      await budget.service.applyAdvice(bundle.trip.id, a);
      await reload();
      await budget.reload();
    } catch {
      setApplyError('Enregistrement impossible.');
    }
  }

  return (
    <div className="budget-sections">
      <SummaryPanel summary={summary} travelers={data.travelers.length} labelOf={labelOf} />
      <AdvicePanel advice={advice} lines={data.lines} onApply={apply} disabled={!online} />
      {applyError && <SaveError error={applyError} onRetry={() => setApplyError(null)} />}
      <LinesPanel tripId={bundle.trip.id} data={data} items={items} reservations={bundle.reservations} disabled={!online} onChange={budget.reload} />
      <ExpensesList
        tripId={bundle.trip.id}
        data={data}
        reservations={bundle.reservations}
        localCurrency={bundle.trip.localCurrency}
        disabled={!online}
        onChange={budget.reload}
      />
      <SettlementPanel data={data} />
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
