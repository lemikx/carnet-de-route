import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../app/AppContext';
import { formatDate, formatDayLabel } from '../../domain/format';
import type { Day, Trip } from '../../domain/types';
import { NeedsConfirmationError } from '../../services/tripService';
import { useOnline } from '../../offline/useOnline';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { SaveError } from '../common/SaveError';
import { useAsync } from '../common/useAsync';
import { useSave } from '../common/useSave';
import { TripForm, type TripFormValues } from './TripForm';

const splitCountries = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

export function TripsPage() {
  const { repo, service } = useApp();
  const online = useOnline();
  const trips = useAsync(() => repo.listTrips(), [repo]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Trip | null>(null);
  const [deleting, setDeleting] = useState<Trip | null>(null);
  const [pendingDates, setPendingDates] = useState<{ trip: Trip; v: TripFormValues; days: Day[] } | null>(null);

  const create = useSave(
    useCallback(async (v: TripFormValues) => {
      await service.createTrip({
        name: v.name, startDate: v.startDate, endDate: v.endDate, countries: splitCountries(v.countries),
        localCurrency: v.localCurrency.toUpperCase(), homeTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone, updatedAt: '',
      });
      setCreating(false);
      await trips.reload();
    }, [service, trips]),
  );

  const edit = useSave(
    useCallback(async (trip: Trip, v: TripFormValues, confirm = false) => {
      try {
        if (v.startDate !== trip.startDate || v.endDate !== trip.endDate) {
          await service.changeDates(trip.id, v.startDate, v.endDate, { confirm });
        }
      } catch (e) {
        if (e instanceof NeedsConfirmationError) {
          setPendingDates({ trip, v, days: e.days });
          return;
        }
        throw e;
      }
      const fresh = (await repo.getBundle(trip.id)).trip;
      await repo.updateTrip({ ...fresh, name: v.name, countries: splitCountries(v.countries), localCurrency: v.localCurrency.toUpperCase() });
      setPendingDates(null);
      setEditing(null);
      await trips.reload();
    }, [repo, service, trips]),
  );

  const remove = useSave(
    useCallback(async (trip: Trip) => {
      await repo.deleteTrip(trip.id);
      setDeleting(null);
      await trips.reload();
    }, [repo, trips]),
  );

  const duplicate = useSave(
    useCallback(async (trip: Trip) => {
      await service.duplicateTrip(trip.id, `${trip.name} (copie)`);
      await trips.reload();
    }, [service, trips]),
  );

  const list = trips.data ?? [];
  return (
    <main className="page">
      <div className="page-head">
        <h1>Mes voyages</h1>
        {!creating && (
          <button className="btn btn-primary" onClick={() => setCreating(true)} disabled={!online}>
            Nouveau voyage
          </button>
        )}
      </div>

      {creating && (
        <>
          <TripForm submitLabel="Créer le voyage" disabled={create.saving} onSubmit={(v) => create.run(v)} onCancel={() => setCreating(false)} />
          <SaveError error={create.error} onRetry={create.retry} />
        </>
      )}

      {trips.loading && !trips.data && <p className="muted">Chargement…</p>}
      {Boolean(trips.error) && <p role="alert" className="save-error">Impossible de charger tes voyages.</p>}
      {!trips.loading && list.length === 0 && !creating && <p className="empty">Aucun voyage pour l’instant</p>}

      <ul className="trip-list">
        {list.map((t) =>
          editing?.id === t.id ? (
            <li key={t.id}>
              <TripForm
                submitLabel="Enregistrer"
                disabled={edit.saving}
                initial={{ name: t.name, startDate: t.startDate, endDate: t.endDate, countries: t.countries.join(', '), localCurrency: t.localCurrency }}
                onSubmit={(v) => edit.run(t, v)}
                onCancel={() => setEditing(null)}
              />
              <SaveError error={edit.error} onRetry={edit.retry} />
            </li>
          ) : (
            <li key={t.id} className="card trip-card">
              <Link to={`/voyage/${t.id}/itineraire`} className="trip-link">
                <strong>{t.name}</strong>
                <span className="muted">{formatDate(t.startDate)} → {formatDate(t.endDate)}</span>
                {t.countries.length > 0 && <span className="muted">{t.countries.join(', ')}</span>}
              </Link>
              <div className="trip-actions">
                <button className="btn btn-small" onClick={() => setEditing(t)} disabled={!online}>Modifier</button>
                <button className="btn btn-small" onClick={() => duplicate.run(t)} disabled={!online}>Dupliquer</button>
                <button className="btn btn-small btn-danger-text" onClick={() => setDeleting(t)} disabled={!online}>Supprimer</button>
              </div>
            </li>
          ),
        )}
      </ul>
      <SaveError error={duplicate.error} onRetry={duplicate.retry} />

      {deleting && (
        <ConfirmDialog title={`Supprimer « ${deleting.name} » ?`} confirmLabel="Supprimer" danger onConfirm={() => remove.run(deleting)} onCancel={() => setDeleting(null)}>
          <p>Tout le voyage sera supprimé : itinéraire, réservations, checklist et liens de partage. C’est définitif.</p>
          <SaveError error={remove.error} onRetry={remove.retry} />
        </ConfirmDialog>
      )}

      {pendingDates && (
        <ConfirmDialog
          title="Supprimer des jours qui contiennent des étapes ?"
          confirmLabel="Supprimer ces jours"
          danger
          onConfirm={() => edit.run(pendingDates.trip, pendingDates.v, true)}
          onCancel={() => setPendingDates(null)}
        >
          <p>Avec les nouvelles dates, ces jours disparaissent avec leurs étapes :</p>
          <ul>
            {pendingDates.days.map((d) => (
              <li key={d.id}>{formatDayLabel(d.date)}</li>
            ))}
          </ul>
        </ConfirmDialog>
      )}
    </main>
  );
}
